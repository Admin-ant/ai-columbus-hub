-- Run against the database in one transaction; all fixtures are rolled back.
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$
DECLARE
  org uuid;
  expense uuid;
  entry uuid;
  booking_status text;
  booking_error text;
  open_date date;
  closed_date date;
  blocked boolean := false;
BEGIN
  SELECT id INTO org FROM public.organizations ORDER BY created_at LIMIT 1;
  IF org IS NULL THEN RAISE EXCEPTION 'Test requires an organization'; END IF;
  SELECT d::date INTO open_date FROM generate_series(DATE '2090-01-01', DATE '2095-01-01', INTERVAL '3 months') d
    WHERE NOT public.is_period_closed(org, d::date) LIMIT 1;
  IF open_date IS NULL THEN RAISE EXCEPTION 'Test requires an open quarter'; END IF;
  closed_date := (open_date + INTERVAL '3 months')::date;
  -- Posting currently uses CURRENT_DATE for the journal entry.
  IF public.is_period_closed(org, CURRENT_DATE) THEN
    RAISE EXCEPTION 'Current journal quarter is closed; use an isolated test organization';
  END IF;
  INSERT INTO public.expenses(organization_id, supplier, expense_date, amount_cents, vat_cents, total_cents)
    VALUES(org, 'Quarter guard regression (rollback)', open_date, 10000, 2100, 12100)
    RETURNING id INTO expense;
  entry := public.post_expense_journal(expense, NULL);
  SELECT journal_status, journal_error INTO booking_status, booking_error FROM public.expenses WHERE id=expense;
  IF entry IS NULL OR booking_status IS DISTINCT FROM 'posted' OR booking_error IS NOT NULL THEN
    RAISE EXCEPTION 'Open-quarter invoice must become posted with no error';
  END IF;
  IF (SELECT count(*) FROM public.journal_lines WHERE entry_id=entry) <> 3 THEN
    RAISE EXCEPTION 'Expected cost, VAT and creditor journal lines';
  END IF;
  IF public.post_expense_journal(expense, NULL) IS DISTINCT FROM entry THEN
    RAISE EXCEPTION 'Reposting must reuse the existing journal entry';
  END IF;
  IF public.is_period_closed(org, closed_date) THEN
    -- Choose a different open quarter before closing it only inside this transaction.
    SELECT d::date INTO closed_date FROM generate_series(DATE '2096-01-01', DATE '2100-01-01', INTERVAL '3 months') d
      WHERE NOT public.is_period_closed(org, d::date) LIMIT 1;
  END IF;
  IF closed_date IS NULL THEN RAISE EXCEPTION 'No closed-quarter test date available'; END IF;
  INSERT INTO public.expenses(organization_id, supplier, expense_date, amount_cents, vat_cents, total_cents)
    VALUES(org, 'Closed quarter regression (rollback)', closed_date, 10000, 2100, 12100)
    RETURNING id INTO expense;
  INSERT INTO public.accounting_periods(organization_id, year, quarter)
    VALUES(org, EXTRACT(YEAR FROM closed_date)::int, EXTRACT(QUARTER FROM closed_date)::int);
  BEGIN
    PERFORM public.post_expense_journal(expense, NULL);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Dit kwartaal is afgesloten%' THEN RAISE; END IF;
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Closed-quarter invoice booking was not blocked'; END IF;
  IF EXISTS(SELECT 1 FROM public.journal_entries WHERE expense_id=expense) THEN
    RAISE EXCEPTION 'Blocked booking left a partial journal entry';
  END IF;
  IF (SELECT journal_status FROM public.expenses WHERE id=expense) IS DISTINCT FROM 'not_posted' THEN
    RAISE EXCEPTION 'Blocked invoice must not become posted';
  END IF;
  blocked := false;
  BEGIN
    INSERT INTO public.journal_entries(organization_id, entry_date, description)
      VALUES(org, closed_date, 'Closed journal regression (rollback)');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Dit kwartaal is afgesloten%' THEN RAISE; END IF;
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Direct journal insertion in a closed quarter was not blocked'; END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
END $$;
ROLLBACK;