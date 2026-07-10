
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Extend leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS quote_id uuid,
  ADD COLUMN IF NOT EXISTS won_at timestamptz,
  ADD COLUMN IF NOT EXISTS lost_reason text,
  ADD COLUMN IF NOT EXISTS converted_client_id uuid,
  ADD COLUMN IF NOT EXISTS converted_project_id uuid,
  ADD COLUMN IF NOT EXISTS converted_contract_id uuid;

-- 2. Extend invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS contract_id uuid;

-- 3. Extend products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS default_solution_type text;

-- 4. Enums
DO $$ BEGIN
  CREATE TYPE public.billing_frequency AS ENUM ('monthly','quarterly','yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.contract_status AS ENUM ('draft','active','paused','cancelled','ended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. contracts
CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  contract_number text,
  title text NOT NULL,
  status public.contract_status NOT NULL DEFAULT 'draft',
  billing_frequency public.billing_frequency NOT NULL DEFAULT 'monthly',
  start_date date NOT NULL,
  end_date date,
  notice_period_days integer NOT NULL DEFAULT 30,
  monthly_amount_cents bigint NOT NULL DEFAULT 0,
  setup_fee_cents bigint NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 21,
  currency text NOT NULL DEFAULT 'EUR',
  auto_invoice boolean NOT NULL DEFAULT true,
  payment_terms_days integer NOT NULL DEFAULT 14,
  next_invoice_date date,
  last_invoiced_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contracts_select_members" ON public.contracts FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "contracts_insert_members" ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "contracts_update_members" ON public.contracts FOR UPDATE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "contracts_delete_members" ON public.contracts FOR DELETE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE TRIGGER contracts_updated_at BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. contract_lines
CREATE TABLE IF NOT EXISTS public.contract_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price_cents bigint NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 21,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_lines TO authenticated;
GRANT ALL ON public.contract_lines TO service_role;
ALTER TABLE public.contract_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contract_lines_members_all" ON public.contract_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_lines.contract_id AND app_private.has_org_access(auth.uid(), c.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_lines.contract_id AND app_private.has_org_access(auth.uid(), c.organization_id)));

-- 7. recurring_invoice_runs
CREATE TABLE IF NOT EXISTS public.recurring_invoice_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.recurring_invoice_runs TO authenticated;
GRANT ALL ON public.recurring_invoice_runs TO service_role;
ALTER TABLE public.recurring_invoice_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "runs_select_members" ON public.recurring_invoice_runs FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

-- 8. Convert lead → client + project + contract
CREATE OR REPLACE FUNCTION public.convert_lead_to_customer(
  _lead_id uuid,
  _monthly_cents bigint,
  _setup_cents bigint,
  _start_date date,
  _title text
) RETURNS TABLE(out_client_id uuid, out_project_id uuid, out_contract_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private
AS $$
DECLARE
  _lead public.leads%ROWTYPE;
  _client_id uuid;
  _project_id uuid;
  _contract_id uuid;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead niet gevonden'; END IF;
  IF auth.role() <> 'service_role' AND NOT app_private.has_org_access(auth.uid(), _lead.organization_id) THEN
    RAISE EXCEPTION 'Geen toegang';
  END IF;

  IF _lead.converted_client_id IS NOT NULL THEN
    _client_id := _lead.converted_client_id;
  ELSE
    INSERT INTO public.clients (organization_id, name, contact_person, email, phone, monthly_value, start_date, created_by)
    VALUES (_lead.organization_id, COALESCE(NULLIF(_lead.company,''), _lead.name), _lead.name, _lead.email, _lead.phone, (_monthly_cents::numeric/100), _start_date, auth.uid())
    RETURNING id INTO _client_id;
  END IF;

  INSERT INTO public.projects (organization_id, client_id, name, status, value_cents, created_by)
  VALUES (_lead.organization_id, _client_id, _title, 'contract_getekend'::project_status, _monthly_cents, auth.uid())
  RETURNING id INTO _project_id;

  INSERT INTO public.contracts (organization_id, client_id, project_id, title, status, start_date, monthly_amount_cents, setup_fee_cents, next_invoice_date, created_by)
  VALUES (_lead.organization_id, _client_id, _project_id, _title, 'active', _start_date, _monthly_cents, _setup_cents, _start_date, auth.uid())
  RETURNING id INTO _contract_id;

  IF _monthly_cents > 0 THEN
    INSERT INTO public.contract_lines (contract_id, description, quantity, unit_price_cents, vat_rate, position)
    VALUES (_contract_id, _title || ' — maandelijks abonnement', 1, _monthly_cents, 21, 0);
  END IF;
  IF _setup_cents > 0 THEN
    INSERT INTO public.contract_lines (contract_id, description, quantity, unit_price_cents, vat_rate, position)
    VALUES (_contract_id, 'Eenmalige implementatiekosten', 1, _setup_cents, 21, 1);
  END IF;

  UPDATE public.leads
     SET stage = 'gewonnen', won_at = now(),
         converted_client_id = _client_id,
         converted_project_id = _project_id,
         converted_contract_id = _contract_id
   WHERE id = _lead_id;

  out_client_id := _client_id;
  out_project_id := _project_id;
  out_contract_id := _contract_id;
  RETURN NEXT;
END $$;

-- 9. Recompute clients.monthly_value from active contracts
CREATE OR REPLACE FUNCTION public.recompute_client_monthly_value()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _client uuid;
  _total numeric;
BEGIN
  _client := COALESCE(NEW.client_id, OLD.client_id);
  IF _client IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM(monthly_amount_cents),0)::numeric/100 INTO _total
    FROM public.contracts WHERE client_id = _client AND status = 'active';
  UPDATE public.clients SET monthly_value = _total WHERE id = _client;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS contracts_sync_monthly_value ON public.contracts;
CREATE TRIGGER contracts_sync_monthly_value
AFTER INSERT OR UPDATE OR DELETE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.recompute_client_monthly_value();

-- 10. Generate recurring invoices
CREATE OR REPLACE FUNCTION public.generate_recurring_invoices(_only_contract_id uuid DEFAULT NULL)
RETURNS TABLE(contract_id uuid, invoice_id uuid, status text, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private
AS $$
DECLARE
  _c public.contracts%ROWTYPE;
  _inv_id uuid;
  _inv_no text;
  _line record;
  _period_start date;
  _period_end date;
  _subtotal bigint;
  _vat bigint;
  _total bigint;
  _client_name text;
BEGIN
  FOR _c IN
    SELECT * FROM public.contracts
    WHERE status = 'active' AND auto_invoice = true
      AND (_only_contract_id IS NULL OR id = _only_contract_id)
      AND next_invoice_date IS NOT NULL
      AND next_invoice_date <= CURRENT_DATE
  LOOP
    _period_start := _c.next_invoice_date;
    _period_end := NULL;
    BEGIN
      _period_end := CASE _c.billing_frequency
        WHEN 'monthly' THEN (_period_start + INTERVAL '1 month')::date - 1
        WHEN 'quarterly' THEN (_period_start + INTERVAL '3 months')::date - 1
        WHEN 'yearly' THEN (_period_start + INTERVAL '1 year')::date - 1
      END;

      SELECT name INTO _client_name FROM public.clients WHERE id = _c.client_id;
      _inv_no := app_private.next_invoice_number(_c.organization_id);

      SELECT COALESCE(SUM((quantity*unit_price_cents)::bigint),0),
             COALESCE(SUM(((quantity*unit_price_cents*vat_rate)/100)::bigint),0)
        INTO _subtotal, _vat
        FROM public.contract_lines WHERE contract_id = _c.id;
      _total := _subtotal + _vat;

      INSERT INTO public.invoices (organization_id, client_id, client_name, contract_id, project_id, invoice_number, status, issue_date, due_date, subtotal_cents, vat_cents, total_cents, amount, currency)
      VALUES (_c.organization_id, _c.client_id, _client_name, _c.id, _c.project_id, _inv_no, 'draft'::invoice_status, CURRENT_DATE, CURRENT_DATE + _c.payment_terms_days, _subtotal, _vat, _total, (_total::numeric/100), _c.currency)
      RETURNING id INTO _inv_id;

      FOR _line IN SELECT * FROM public.contract_lines WHERE contract_id = _c.id ORDER BY position LOOP
        INSERT INTO public.invoice_lines (invoice_id, description, quantity, unit_price_cents, vat_rate, subtotal_cents, vat_cents, total_cents, position)
        VALUES (
          _inv_id,
          _line.description || ' (' || to_char(_period_start,'DD-MM-YYYY') || ' t/m ' || to_char(_period_end,'DD-MM-YYYY') || ')',
          _line.quantity, _line.unit_price_cents, _line.vat_rate,
          (_line.quantity*_line.unit_price_cents)::bigint,
          ((_line.quantity*_line.unit_price_cents*_line.vat_rate)/100)::bigint,
          ((_line.quantity*_line.unit_price_cents) + (_line.quantity*_line.unit_price_cents*_line.vat_rate)/100)::bigint,
          _line.position
        );
      END LOOP;

      UPDATE public.contracts
         SET last_invoiced_at = now(),
             next_invoice_date = CASE billing_frequency
               WHEN 'monthly' THEN (next_invoice_date + INTERVAL '1 month')::date
               WHEN 'quarterly' THEN (next_invoice_date + INTERVAL '3 months')::date
               WHEN 'yearly' THEN (next_invoice_date + INTERVAL '1 year')::date
             END
       WHERE id = _c.id;

      INSERT INTO public.recurring_invoice_runs (organization_id, contract_id, invoice_id, period_start, period_end, status)
      VALUES (_c.organization_id, _c.id, _inv_id, _period_start, _period_end, 'ok');

      contract_id := _c.id; invoice_id := _inv_id; status := 'ok'; error := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.recurring_invoice_runs (organization_id, contract_id, period_start, period_end, status, error)
      VALUES (_c.organization_id, _c.id, COALESCE(_period_start, CURRENT_DATE), COALESCE(_period_end, CURRENT_DATE), 'error', SQLERRM);
      contract_id := _c.id; invoice_id := NULL; status := 'error'; error := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END $$;
