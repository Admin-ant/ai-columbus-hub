
REVOKE EXECUTE ON FUNCTION public.post_expense_journal(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.post_invoice_journal(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_default_chart(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(uuid) FROM PUBLIC, anon;
