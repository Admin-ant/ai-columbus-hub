-- Make append-only log tables explicitly read-only for app users.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.client_audit_log FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.invoice_payment_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.recurring_invoice_runs FROM anon, authenticated;

GRANT SELECT ON public.client_audit_log TO authenticated;
GRANT SELECT ON public.invoice_payment_events TO authenticated;
GRANT SELECT ON public.recurring_invoice_runs TO authenticated;

GRANT ALL ON public.client_audit_log TO service_role;
GRANT ALL ON public.invoice_payment_events TO service_role;
GRANT ALL ON public.recurring_invoice_runs TO service_role;

-- Explicit deny policies so intent is unambiguous (no USING/WITH CHECK true anywhere).
DROP POLICY IF EXISTS "client_audit_log_no_client_writes" ON public.client_audit_log;
CREATE POLICY "client_audit_log_no_client_writes"
  ON public.client_audit_log FOR INSERT TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "client_audit_log_no_client_updates" ON public.client_audit_log;
CREATE POLICY "client_audit_log_no_client_updates"
  ON public.client_audit_log FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "client_audit_log_no_client_deletes" ON public.client_audit_log;
CREATE POLICY "client_audit_log_no_client_deletes"
  ON public.client_audit_log FOR DELETE TO authenticated, anon
  USING (false);

DROP POLICY IF EXISTS "invoice_payment_events_no_client_writes" ON public.invoice_payment_events;
CREATE POLICY "invoice_payment_events_no_client_writes"
  ON public.invoice_payment_events FOR INSERT TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "invoice_payment_events_no_client_updates" ON public.invoice_payment_events;
CREATE POLICY "invoice_payment_events_no_client_updates"
  ON public.invoice_payment_events FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "invoice_payment_events_no_client_deletes" ON public.invoice_payment_events;
CREATE POLICY "invoice_payment_events_no_client_deletes"
  ON public.invoice_payment_events FOR DELETE TO authenticated, anon
  USING (false);

DROP POLICY IF EXISTS "recurring_invoice_runs_no_client_writes" ON public.recurring_invoice_runs;
CREATE POLICY "recurring_invoice_runs_no_client_writes"
  ON public.recurring_invoice_runs FOR INSERT TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "recurring_invoice_runs_no_client_updates" ON public.recurring_invoice_runs;
CREATE POLICY "recurring_invoice_runs_no_client_updates"
  ON public.recurring_invoice_runs FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "recurring_invoice_runs_no_client_deletes" ON public.recurring_invoice_runs;
CREATE POLICY "recurring_invoice_runs_no_client_deletes"
  ON public.recurring_invoice_runs FOR DELETE TO authenticated, anon
  USING (false);