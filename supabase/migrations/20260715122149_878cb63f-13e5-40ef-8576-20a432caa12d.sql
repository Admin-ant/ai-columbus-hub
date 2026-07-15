
-- Revoke direct EXECUTE from public/anon/authenticated on SECURITY DEFINER functions.
-- These are called only from server-side code via the service role.
REVOKE EXECUTE ON FUNCTION public.accept_quote_by_token(text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.track_quote_view(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_invoice_journal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_expense_journal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_expense_journal(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_expense_journal(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_campaign_task_event() FROM PUBLIC, anon, authenticated;
