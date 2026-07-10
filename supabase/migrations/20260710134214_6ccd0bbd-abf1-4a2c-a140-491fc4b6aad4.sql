
REVOKE EXECUTE ON FUNCTION public.finalize_signed_quote(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_finalize_signed_quote() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_signed_quote(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_finalize_signed_quote() TO service_role;
