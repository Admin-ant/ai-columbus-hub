
-- 1. client_requirements table
CREATE TABLE public.client_requirements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT '',
  one_time_cents BIGINT NOT NULL DEFAULT 0,
  recurring_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_requirements TO authenticated;
GRANT ALL ON public.client_requirements TO service_role;

ALTER TABLE public.client_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read client_requirements"
  ON public.client_requirements FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "org members write client_requirements"
  ON public.client_requirements FOR ALL TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE TRIGGER trg_client_requirements_updated_at
  BEFORE UPDATE ON public.client_requirements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX client_requirements_org_idx ON public.client_requirements(organization_id);

-- 2. finalize_signed_quote — auto-conversion on signing
CREATE OR REPLACE FUNCTION public.finalize_signed_quote(_quote_id UUID)
RETURNS TABLE(invoice_id UUID, contract_id UUID, client_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  _q public.quotes%ROWTYPE;
  _req public.client_requirements%ROWTYPE;
  _client UUID;
  _project UUID;
  _contract UUID;
  _inv_id UUID;
  _inv_no TEXT;
  _monthly BIGINT := 0;
  _setup BIGINT := 0;
  _title TEXT;
  _start DATE := CURRENT_DATE;
  _client_name TEXT;
  _subtotal BIGINT;
  _vat BIGINT;
  _total BIGINT;
BEGIN
  SELECT * INTO _q FROM public.quotes WHERE id = _quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found'; END IF;
  IF _q.signed_at IS NULL THEN RAISE EXCEPTION 'Quote not signed'; END IF;

  -- Prefer requirements if attached to the lead
  IF _q.lead_id IS NOT NULL THEN
    SELECT * INTO _req FROM public.client_requirements WHERE lead_id = _q.lead_id LIMIT 1;
  END IF;
  IF FOUND THEN
    _monthly := _req.recurring_cents;
    _setup := _req.one_time_cents;
  ELSE
    -- Fallback: everything as one-time
    _setup := (COALESCE(_q.total_amount, 0) * 100)::BIGINT;
  END IF;

  _title := COALESCE(_q.title, 'Overeenkomst');

  -- If quote has a lead, use existing convert_lead_to_customer
  IF _q.lead_id IS NOT NULL THEN
    SELECT out_client_id, out_project_id, out_contract_id
      INTO _client, _project, _contract
      FROM public.convert_lead_to_customer(_q.lead_id, _monthly, _setup, _start, _title);
  ELSIF _q.client_id IS NOT NULL THEN
    _client := _q.client_id;
    INSERT INTO public.contracts (organization_id, client_id, quote_id, title, status, start_date, monthly_amount_cents, setup_fee_cents, next_invoice_date, created_by)
    VALUES (_q.organization_id, _client, _q.id, _title, 'active', _start, _monthly, _setup, _start, _q.created_by)
    RETURNING id INTO _contract;
    IF _monthly > 0 THEN
      INSERT INTO public.contract_lines (contract_id, description, quantity, unit_price_cents, vat_rate, position)
      VALUES (_contract, _title || ' — maandelijks abonnement', 1, _monthly, 21, 0);
    END IF;
  ELSE
    RAISE EXCEPTION 'Quote has no lead or client';
  END IF;

  -- Link quote to contract
  UPDATE public.quotes SET status = 'approved_paid' WHERE id = _q.id AND status <> 'approved_paid';

  -- Create one-time invoice for setup fee (if any)
  IF _setup > 0 THEN
    SELECT name INTO _client_name FROM public.clients WHERE id = _client;
    SELECT app_private.next_invoice_number(_q.organization_id) INTO _inv_no;
    _subtotal := _setup;
    _vat := (_setup * 21 / 100)::BIGINT;
    _total := _subtotal + _vat;

    INSERT INTO public.invoices (
      organization_id, client_id, client_name, contract_id, project_id, quote_id,
      invoice_number, status, issue_date, due_date,
      subtotal_cents, vat_cents, total_cents, amount, currency
    )
    VALUES (
      _q.organization_id, _client, _client_name, _contract, _project, _q.id,
      _inv_no, 'sent', CURRENT_DATE, CURRENT_DATE + 14,
      _subtotal, _vat, _total, (_total::numeric/100), COALESCE(_q.payer_company, 'EUR')
    )
    RETURNING id INTO _inv_id;

    INSERT INTO public.invoice_lines (invoice_id, description, quantity, unit_price_cents, vat_rate, subtotal_cents, vat_cents, total_cents, position)
    VALUES (_inv_id, 'Eenmalige implementatiekosten — ' || _title, 1, _setup, 21, _subtotal, _vat, _total, 0);
  END IF;

  INSERT INTO public.quote_status_events (quote_id, organization_id, event_type, metadata)
  VALUES (_q.id, _q.organization_id, 'converted',
          jsonb_build_object('client_id', _client, 'contract_id', _contract, 'invoice_id', _inv_id));

  invoice_id := _inv_id;
  contract_id := _contract;
  client_id := _client;
  RETURN NEXT;
END $$;

-- 3. Trigger on quotes when signed_at transitions to non-null
CREATE OR REPLACE FUNCTION public.trg_finalize_signed_quote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (OLD.signed_at IS NULL) AND (NEW.signed_at IS NOT NULL) THEN
    BEGIN
      PERFORM public.finalize_signed_quote(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- Never block sign action; log via quote_status_events
      INSERT INTO public.quote_status_events (quote_id, organization_id, event_type, metadata)
      VALUES (NEW.id, NEW.organization_id, 'convert_error', jsonb_build_object('error', SQLERRM));
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_quote_signed_finalize ON public.quotes;
CREATE TRIGGER trg_quote_signed_finalize
  AFTER UPDATE OF signed_at ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.trg_finalize_signed_quote();
