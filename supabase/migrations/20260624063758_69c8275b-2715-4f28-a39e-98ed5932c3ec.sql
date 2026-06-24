-- Booking status + error op uitgaven
ALTER TABLE public.expenses 
  ADD COLUMN IF NOT EXISTS journal_status text NOT NULL DEFAULT 'not_posted'
    CHECK (journal_status IN ('not_posted','pending','posted','reversed','error')),
  ADD COLUMN IF NOT EXISTS journal_error text;

-- Reversal-relaties op journaalposten
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS reverses_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_by_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;

-- Sync bestaande status
UPDATE public.expenses e
SET journal_status = 'posted'
WHERE journal_status = 'not_posted'
  AND EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.expense_id = e.id);

-- Vervang post_expense_journal: optionele tegenrekening + statusupdate + foutopvang
CREATE OR REPLACE FUNCTION public.post_expense_journal(_expense_id uuid, _counter_code text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _exp public.expenses%ROWTYPE;
  _entry_id uuid;
  _kosten uuid; _btw uuid; _tegen uuid;
  _code text;
BEGIN
  SELECT * INTO _exp FROM public.expenses WHERE id = _expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Uitgave niet gevonden'; END IF;
  IF auth.role() <> 'service_role' AND NOT app_private.has_org_access(auth.uid(), _exp.organization_id) THEN
    RAISE EXCEPTION 'Geen toegang';
  END IF;

  -- Bestaande actieve boeking? Hergebruik.
  SELECT id INTO _entry_id FROM public.journal_entries
   WHERE expense_id = _expense_id AND reverses_entry_id IS NULL AND reversed_by_entry_id IS NULL LIMIT 1;
  IF _entry_id IS NOT NULL THEN RETURN _entry_id; END IF;

  SELECT id INTO _kosten FROM public.chart_of_accounts WHERE organization_id = _exp.organization_id AND code = '4000' LIMIT 1;
  SELECT id INTO _btw    FROM public.chart_of_accounts WHERE organization_id = _exp.organization_id AND code = '1500' LIMIT 1;

  _code := COALESCE(_counter_code,
                    CASE WHEN _exp.paid_at IS NOT NULL OR _exp.status = 'paid' THEN '1100' ELSE '1700' END);
  SELECT id INTO _tegen FROM public.chart_of_accounts
    WHERE organization_id = _exp.organization_id AND code = _code LIMIT 1;

  IF _kosten IS NULL OR _btw IS NULL OR _tegen IS NULL THEN
    UPDATE public.expenses SET journal_status='error', journal_error='Grootboekrekening ontbreekt' WHERE id=_expense_id;
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
  VALUES (_entry_id, _tegen, 0, _exp.total_cents, 'Tegenrekening');

  UPDATE public.expenses SET journal_status='posted', journal_error=NULL WHERE id=_expense_id;
  RETURN _entry_id;
END $$;

-- Reverse-functie: kopieert lijnen met omgedraaide debit/credit en koppelt terug
CREATE OR REPLACE FUNCTION public.reverse_expense_journal(_expense_id uuid, _reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _exp public.expenses%ROWTYPE;
  _orig_id uuid;
  _new_id uuid;
  _line record;
BEGIN
  SELECT * INTO _exp FROM public.expenses WHERE id = _expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Uitgave niet gevonden'; END IF;
  IF auth.role() <> 'service_role' AND NOT app_private.has_org_access(auth.uid(), _exp.organization_id) THEN
    RAISE EXCEPTION 'Geen toegang';
  END IF;

  SELECT id INTO _orig_id FROM public.journal_entries
    WHERE expense_id = _expense_id AND reverses_entry_id IS NULL AND reversed_by_entry_id IS NULL LIMIT 1;
  IF _orig_id IS NULL THEN RAISE EXCEPTION 'Geen actieve journaalpost om terug te boeken'; END IF;

  INSERT INTO public.journal_entries (organization_id, description, expense_id, source, reverses_entry_id, created_by)
  VALUES (_exp.organization_id,
          'Terugboeking — ' || _exp.supplier || COALESCE(' — ' || _reason, ''),
          _expense_id, 'expense', _orig_id, auth.uid())
  RETURNING id INTO _new_id;

  FOR _line IN SELECT * FROM public.journal_lines WHERE entry_id = _orig_id LOOP
    INSERT INTO public.journal_lines (entry_id, account_id, debit_cents, credit_cents, description)
    VALUES (_new_id, _line.account_id, _line.credit_cents, _line.debit_cents, 'Terug: ' || COALESCE(_line.description,''));
  END LOOP;

  UPDATE public.journal_entries SET reversed_by_entry_id = _new_id WHERE id = _orig_id;
  UPDATE public.expenses SET journal_status='reversed' WHERE id = _expense_id;
  RETURN _new_id;
END $$;