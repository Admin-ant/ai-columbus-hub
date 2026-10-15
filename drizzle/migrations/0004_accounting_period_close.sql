CREATE TABLE public.accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  year int NOT NULL,
  quarter int NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (organization_id, year, quarter)
);
GRANT SELECT, INSERT, DELETE ON public.accounting_periods TO authenticated;
GRANT ALL ON public.accounting_periods TO service_role;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read periods" ON public.accounting_periods FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = accounting_periods.organization_id AND m.user_id = auth.uid()));
CREATE POLICY "org close periods" ON public.accounting_periods FOR INSERT TO authenticated WITH CHECK (closed_by = auth.uid() AND EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = accounting_periods.organization_id AND m.user_id = auth.uid()));
CREATE POLICY "org reopen periods" ON public.accounting_periods FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = accounting_periods.organization_id AND m.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.is_period_closed(_org uuid, _d date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _d IS NOT NULL AND EXISTS (SELECT 1 FROM public.accounting_periods
    WHERE organization_id = _org AND year = extract(year FROM _d)::int
      AND quarter = extract(quarter FROM _d)::int)
$$;

CREATE OR REPLACE FUNCTION public.guard_closed_period()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE col text := TG_ARGV[0]; d_old date; d_new date;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    EXECUTE format('SELECT ($1).%I::date', col) INTO d_old USING OLD;
    IF public.is_period_closed(OLD.organization_id, d_old) THEN
      RAISE EXCEPTION 'Dit kwartaal is afgesloten; wijzigen is niet meer mogelijk';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    EXECUTE format('SELECT ($1).%I::date', col) INTO d_new USING NEW;
    IF public.is_period_closed(NEW.organization_id, d_new) THEN
      RAISE EXCEPTION 'Dit kwartaal is afgesloten; boeken in deze periode is niet meer mogelijk';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_closed_period() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_guard_period_invoices BEFORE INSERT OR UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_closed_period('issue_date');
CREATE TRIGGER trg_guard_period_expenses BEFORE INSERT OR UPDATE OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.guard_closed_period('expense_date');
CREATE TRIGGER trg_guard_period_journal BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_closed_period('entry_date');