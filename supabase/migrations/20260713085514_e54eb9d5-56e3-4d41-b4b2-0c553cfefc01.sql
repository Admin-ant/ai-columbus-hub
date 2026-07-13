
-- 1. Lock down SECURITY DEFINER functions: revoke EXECUTE from PUBLIC/anon/authenticated,
--    then grant back only where the app truly needs it.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      r.nspname, r.proname, r.args
    );
  END LOOP;
END $$;

-- Grants needed by the app:
-- Public quote view tracking (called from public quote page, anon session)
GRANT EXECUTE ON FUNCTION public.track_quote_view(text) TO anon, authenticated;

-- Public quote acceptance (called from the public accept page)
GRANT EXECUTE ON FUNCTION public.accept_quote_by_token(text, text, text, boolean) TO anon, authenticated;

-- Bookkeeping helpers called from authenticated server functions
GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_invoice_journal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_expense_journal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_expense_journal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_expense_journal(uuid, text) TO authenticated;

-- 2. quote_status_events: make read-only intent explicit for authenticated clients.
--    Writes happen only via SECURITY DEFINER (finalize_signed_quote) / service role.
DROP POLICY IF EXISTS "No client inserts on quote_status_events" ON public.quote_status_events;
DROP POLICY IF EXISTS "No client updates on quote_status_events" ON public.quote_status_events;
DROP POLICY IF EXISTS "No client deletes on quote_status_events" ON public.quote_status_events;

CREATE POLICY "No client inserts on quote_status_events"
  ON public.quote_status_events
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "No client updates on quote_status_events"
  ON public.quote_status_events
  FOR UPDATE
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "No client deletes on quote_status_events"
  ON public.quote_status_events
  FOR DELETE
  TO authenticated, anon
  USING (false);

-- 3. storage: make 'call-recordings' bucket files immutable via an explicit
--    deny-all UPDATE policy on storage.objects.
DROP POLICY IF EXISTS "call-recordings are immutable" ON storage.objects;

CREATE POLICY "call-recordings are immutable"
  ON storage.objects
  FOR UPDATE
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);
