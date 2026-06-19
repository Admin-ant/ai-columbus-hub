
REVOKE EXECUTE ON FUNCTION public.seed_default_chart(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_organization() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_invoice_journal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_invoice_journal(uuid) TO authenticated;
