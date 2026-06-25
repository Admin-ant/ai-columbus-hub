REVOKE EXECUTE ON FUNCTION public.next_invoice_number(uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_invoice_journal(uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_expense_journal(uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_expense_journal(uuid, text) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reverse_expense_journal(uuid, text) FROM authenticated, anon, PUBLIC;