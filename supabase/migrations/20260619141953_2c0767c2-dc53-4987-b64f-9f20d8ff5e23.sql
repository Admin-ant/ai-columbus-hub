CREATE OR REPLACE FUNCTION public.post_invoice_journal(_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _inv public.invoices%ROWTYPE;
  _entry_id uuid;
  _debiteuren uuid;
  _omzet uuid;
  _btw uuid;
BEGIN
  SELECT * INTO _inv FROM public.invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factuur niet gevonden'; END IF;

  IF auth.role() <> 'service_role'
     AND NOT app_private.has_org_access(auth.uid(), _inv.organization_id) THEN
    RAISE EXCEPTION 'Geen toegang';
  END IF;

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

  INSERT INTO public.journal_lines (entry_id, account_id, debit_cents, credit_cents, description)
  VALUES (_entry_id, _debiteuren, _inv.total_cents, 0, 'Debiteuren');
  INSERT INTO public.journal_lines (entry_id, account_id, debit_cents, credit_cents, description)
  VALUES (_entry_id, _omzet, 0, _inv.subtotal_cents, 'Omzet');
  INSERT INTO public.journal_lines (entry_id, account_id, debit_cents, credit_cents, description)
  VALUES (_entry_id, _btw, 0, _inv.vat_cents, 'Af te dragen BTW');

  RETURN _entry_id;
END $function$;

-- Backfill: post journal for the demo invoice we just created
SELECT public.post_invoice_journal(i.id)
FROM public.invoices i
WHERE i.quote_id IN (SELECT id FROM public.quotes WHERE public_token = '969f57eeea7c13c2d5da41aa5c98ac347315737491373aa0')
  AND NOT EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.invoice_id = i.id);