
-- ===== ENUMS =====
DO $$ BEGIN
  CREATE TYPE public.account_type AS ENUM ('asset','liability','equity','revenue','expense','vat');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.sync_status AS ENUM ('pending','success','failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===== CHART OF ACCOUNTS =====
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  type public.account_type NOT NULL,
  vat_rate numeric(5,2),
  is_vat_account boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_of_accounts TO authenticated;
GRANT ALL ON public.chart_of_accounts TO service_role;
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read chart_of_accounts"
  ON public.chart_of_accounts FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "holding admins write chart_of_accounts"
  ON public.chart_of_accounts FOR ALL TO authenticated
  USING (app_private.is_holding_admin(auth.uid()))
  WITH CHECK (app_private.is_holding_admin(auth.uid()));

CREATE TRIGGER update_chart_of_accounts_updated_at
  BEFORE UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== INVOICES: add cents columns + client + currency =====
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS subtotal_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Backfill cents from legacy amount column (euros)
UPDATE public.invoices
SET total_cents = ROUND(amount * 100)::bigint,
    subtotal_cents = ROUND(amount / 1.21 * 100)::bigint,
    vat_cents = ROUND((amount - amount / 1.21) * 100)::bigint
WHERE total_cents = 0 AND amount > 0;

-- ===== INVOICE LINES =====
CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  unit_price_cents bigint NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 21,
  subtotal_cents bigint NOT NULL DEFAULT 0,
  vat_cents bigint NOT NULL DEFAULT 0,
  total_cents bigint NOT NULL DEFAULT 0,
  revenue_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_lines TO authenticated;
GRANT ALL ON public.invoice_lines TO service_role;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read invoice_lines"
  ON public.invoice_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i
                 WHERE i.id = invoice_id
                 AND app_private.has_org_access(auth.uid(), i.organization_id)));
CREATE POLICY "members write invoice_lines"
  ON public.invoice_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i
                 WHERE i.id = invoice_id
                 AND app_private.has_org_access(auth.uid(), i.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i
                      WHERE i.id = invoice_id
                      AND app_private.has_org_access(auth.uid(), i.organization_id)));

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON public.invoice_lines(invoice_id);

-- ===== JOURNAL ENTRIES =====
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'invoice',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read journal_entries"
  ON public.journal_entries FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "members insert journal_entries"
  ON public.journal_entries FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_date
  ON public.journal_entries(organization_id, entry_date DESC);

-- ===== JOURNAL LINES =====
CREATE TABLE IF NOT EXISTS public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  debit_cents bigint NOT NULL DEFAULT 0 CHECK (debit_cents >= 0),
  credit_cents bigint NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
  description text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_lines TO authenticated;
GRANT ALL ON public.journal_lines TO service_role;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read journal_lines"
  ON public.journal_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_entries j
                 WHERE j.id = entry_id
                 AND app_private.has_org_access(auth.uid(), j.organization_id)));
CREATE POLICY "members insert journal_lines"
  ON public.journal_lines FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_entries j
                      WHERE j.id = entry_id
                      AND app_private.has_org_access(auth.uid(), j.organization_id)));

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON public.journal_lines(entry_id);

-- ===== BALANCE TRIGGER =====
CREATE OR REPLACE FUNCTION public.validate_journal_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _entry uuid;
  _debit bigint;
  _credit bigint;
BEGIN
  _entry := COALESCE(NEW.entry_id, OLD.entry_id);
  SELECT COALESCE(SUM(debit_cents),0), COALESCE(SUM(credit_cents),0)
  INTO _debit, _credit
  FROM public.journal_lines WHERE entry_id = _entry;
  IF _debit <> _credit THEN
    RAISE EXCEPTION 'Journaalpost niet in balans: debet=% credit=%', _debit, _credit;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_journal_lines_balance ON public.journal_lines;
CREATE CONSTRAINT TRIGGER trg_journal_lines_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_journal_balance();

-- ===== POST INVOICE JOURNAL =====
CREATE OR REPLACE FUNCTION public.post_invoice_journal(_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv public.invoices%ROWTYPE;
  _entry_id uuid;
  _debiteuren uuid;
  _omzet uuid;
  _btw uuid;
BEGIN
  SELECT * INTO _inv FROM public.invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factuur niet gevonden'; END IF;

  IF NOT app_private.has_org_access(auth.uid(), _inv.organization_id) THEN
    RAISE EXCEPTION 'Geen toegang';
  END IF;

  -- Skip if already posted
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE invoice_id = _invoice_id) THEN
    SELECT id INTO _entry_id FROM public.journal_entries WHERE invoice_id = _invoice_id LIMIT 1;
    RETURN _entry_id;
  END IF;

  SELECT id INTO _debiteuren FROM public.chart_of_accounts
    WHERE organization_id = _inv.organization_id AND code = '1300' LIMIT 1;
  SELECT id INTO _omzet FROM public.chart_of_accounts
    WHERE organization_id = _inv.organization_id AND code = '8000' LIMIT 1;
  SELECT id INTO _btw FROM public.chart_of_accounts
    WHERE organization_id = _inv.organization_id AND code = '1600' LIMIT 1;

  IF _debiteuren IS NULL OR _omzet IS NULL OR _btw IS NULL THEN
    RAISE EXCEPTION 'Standaard grootboekrekeningen ontbreken voor organisatie';
  END IF;

  INSERT INTO public.journal_entries (organization_id, description, invoice_id, source, created_by)
  VALUES (_inv.organization_id,
          'Factuur ' || _inv.invoice_number || COALESCE(' — ' || _inv.client_name, ''),
          _invoice_id, 'invoice', auth.uid())
  RETURNING id INTO _entry_id;

  -- Debet: debiteuren totaal
  INSERT INTO public.journal_lines (entry_id, account_id, debit_cents, credit_cents, description)
  VALUES (_entry_id, _debiteuren, _inv.total_cents, 0, 'Debiteuren');
  -- Credit: omzet subtotaal
  INSERT INTO public.journal_lines (entry_id, account_id, debit_cents, credit_cents, description)
  VALUES (_entry_id, _omzet, 0, _inv.subtotal_cents, 'Omzet');
  -- Credit: btw
  INSERT INTO public.journal_lines (entry_id, account_id, debit_cents, credit_cents, description)
  VALUES (_entry_id, _btw, 0, _inv.vat_cents, 'Af te dragen BTW');

  RETURN _entry_id;
END $$;

GRANT EXECUTE ON FUNCTION public.post_invoice_journal(uuid) TO authenticated;

-- ===== ACCOUNTANT SYNC EVENTS =====
CREATE TABLE IF NOT EXISTS public.accountant_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  target text NOT NULL DEFAULT 'mock',
  status public.sync_status NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL,
  response jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accountant_sync_events TO authenticated;
GRANT ALL ON public.accountant_sync_events TO service_role;
ALTER TABLE public.accountant_sync_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read sync events"
  ON public.accountant_sync_events FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "members write sync events"
  ON public.accountant_sync_events FOR ALL TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE INDEX IF NOT EXISTS idx_sync_org_created
  ON public.accountant_sync_events(organization_id, created_at DESC);

-- ===== SEED DEFAULT CHART OF ACCOUNTS PER ORG =====
CREATE OR REPLACE FUNCTION public.seed_default_chart(_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.chart_of_accounts (organization_id, code, name, type, vat_rate, is_vat_account)
  VALUES
    (_org, '1000', 'Kas',                       'asset',     NULL, false),
    (_org, '1100', 'Bank',                      'asset',     NULL, false),
    (_org, '1300', 'Debiteuren',                'asset',     NULL, false),
    (_org, '1600', 'Af te dragen BTW 21%',      'vat',       21,   true),
    (_org, '1610', 'Af te dragen BTW 9%',       'vat',       9,    true),
    (_org, '1620', 'Af te dragen BTW 0%',       'vat',       0,    true),
    (_org, '8000', 'Omzet',                     'revenue',   NULL, false),
    (_org, '4000', 'Kosten algemeen',           'expense',   NULL, false)
  ON CONFLICT (organization_id, code) DO NOTHING;
END $$;

GRANT EXECUTE ON FUNCTION public.seed_default_chart(uuid) TO authenticated;

-- Seed for existing organizations
DO $$
DECLARE _o uuid;
BEGIN
  FOR _o IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_default_chart(_o);
  END LOOP;
END $$;

-- Auto-seed for future organizations
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_default_chart(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_seed_chart_on_org ON public.organizations;
CREATE TRIGGER trg_seed_chart_on_org
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization();
