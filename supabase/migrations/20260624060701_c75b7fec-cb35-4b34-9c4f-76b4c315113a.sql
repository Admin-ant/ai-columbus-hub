
-- 1) Koppellog voor facturen
CREATE TABLE public.invoice_link_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('auto','name_match','manual','unlink','backfill')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.invoice_link_log TO authenticated;
GRANT ALL ON public.invoice_link_log TO service_role;

ALTER TABLE public.invoice_link_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read invoice link log"
  ON public.invoice_link_log FOR SELECT
  TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can insert invoice link log"
  ON public.invoice_link_log FOR INSERT
  TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE INDEX idx_invoice_link_log_invoice ON public.invoice_link_log(invoice_id);
CREATE INDEX idx_invoice_link_log_org ON public.invoice_link_log(organization_id);

-- 2) Uitgaven (expenses)
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier text NOT NULL,
  description text,
  category text,
  amount_cents bigint NOT NULL DEFAULT 0,
  vat_cents bigint NOT NULL DEFAULT 0,
  total_cents bigint NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) DEFAULT 21,
  payment_method text,
  reference text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  paid_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','reimbursed','cancelled')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read expenses"
  ON public.expenses FOR SELECT
  TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can insert expenses"
  ON public.expenses FOR INSERT
  TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can update expenses"
  ON public.expenses FOR UPDATE
  TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can delete expenses"
  ON public.expenses FOR DELETE
  TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE INDEX idx_expenses_org_date ON public.expenses(organization_id, expense_date DESC);
CREATE INDEX idx_expenses_client ON public.expenses(client_id);
CREATE INDEX idx_expenses_project ON public.expenses(project_id);

CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Functie om een uitgave naar een journaalpost te boeken (4000 kosten / 1500 BTW voorbelasting / 1100 bank)
-- Eerst 1500-rekening toevoegen als die niet bestaat (per org bij seed). Voeg ook seed uitbreiding toe.
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
    (_org, '1500', 'Te vorderen BTW 21%',       'vat',       21,   true),
    (_org, '1600', 'Af te dragen BTW 21%',      'vat',       21,   true),
    (_org, '1610', 'Af te dragen BTW 9%',       'vat',       9,    true),
    (_org, '1620', 'Af te dragen BTW 0%',       'vat',       0,    true),
    (_org, '1700', 'Crediteuren',               'liability', NULL, false),
    (_org, '8000', 'Omzet',                     'revenue',   NULL, false),
    (_org, '4000', 'Kosten algemeen',           'expense',   NULL, false)
  ON CONFLICT (organization_id, code) DO NOTHING;
END $$;

-- Backfill 1500/1700 voor bestaande organisaties
INSERT INTO public.chart_of_accounts (organization_id, code, name, type, vat_rate, is_vat_account)
SELECT o.id, '1500', 'Te vorderen BTW 21%', 'vat', 21, true
FROM public.organizations o
ON CONFLICT (organization_id, code) DO NOTHING;

INSERT INTO public.chart_of_accounts (organization_id, code, name, type, vat_rate, is_vat_account)
SELECT o.id, '1700', 'Crediteuren', 'liability', NULL, false
FROM public.organizations o
ON CONFLICT (organization_id, code) DO NOTHING;

-- Koppel uitgaven aan journal_entries via een nieuwe kolom
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.post_expense_journal(_expense_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _exp public.expenses%ROWTYPE;
  _entry_id uuid;
  _kosten uuid;
  _btw uuid;
  _tegen uuid;
BEGIN
  SELECT * INTO _exp FROM public.expenses WHERE id = _expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Uitgave niet gevonden'; END IF;

  IF auth.role() <> 'service_role'
     AND NOT app_private.has_org_access(auth.uid(), _exp.organization_id) THEN
    RAISE EXCEPTION 'Geen toegang';
  END IF;

  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE expense_id = _expense_id) THEN
    SELECT id INTO _entry_id FROM public.journal_entries WHERE expense_id = _expense_id LIMIT 1;
    RETURN _entry_id;
  END IF;

  SELECT id INTO _kosten FROM public.chart_of_accounts
    WHERE organization_id = _exp.organization_id AND code = '4000' LIMIT 1;
  SELECT id INTO _btw FROM public.chart_of_accounts
    WHERE organization_id = _exp.organization_id AND code = '1500' LIMIT 1;
  -- Betaald = direct via bank, anders crediteuren
  IF _exp.paid_at IS NOT NULL OR _exp.status = 'paid' THEN
    SELECT id INTO _tegen FROM public.chart_of_accounts
      WHERE organization_id = _exp.organization_id AND code = '1100' LIMIT 1;
  ELSE
    SELECT id INTO _tegen FROM public.chart_of_accounts
      WHERE organization_id = _exp.organization_id AND code = '1700' LIMIT 1;
  END IF;

  IF _kosten IS NULL OR _btw IS NULL OR _tegen IS NULL THEN
    RAISE EXCEPTION 'Standaard grootboekrekeningen ontbreken voor organisatie';
  END IF;

  INSERT INTO public.journal_entries (organization_id, description, expense_id, source, created_by)
  VALUES (_exp.organization_id,
          'Uitgave ' || _exp.supplier || COALESCE(' — ' || _exp.description, ''),
          _expense_id, 'expense', auth.uid())
  RETURNING id INTO _entry_id;

  INSERT INTO public.journal_lines (entry_id, account_id, debit_cents, credit_cents, description)
  VALUES (_entry_id, _kosten, _exp.amount_cents, 0, 'Kosten');
  IF _exp.vat_cents > 0 THEN
    INSERT INTO public.journal_lines (entry_id, account_id, debit_cents, credit_cents, description)
    VALUES (_entry_id, _btw, _exp.vat_cents, 0, 'Te vorderen BTW');
  END IF;
  INSERT INTO public.journal_lines (entry_id, account_id, debit_cents, credit_cents, description)
  VALUES (_entry_id, _tegen, 0, _exp.total_cents, CASE WHEN _exp.paid_at IS NOT NULL OR _exp.status='paid' THEN 'Bank' ELSE 'Crediteuren' END);

  RETURN _entry_id;
END $$;
