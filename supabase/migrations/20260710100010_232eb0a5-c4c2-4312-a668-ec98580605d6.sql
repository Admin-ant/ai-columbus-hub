
REVOKE EXECUTE ON FUNCTION public.convert_lead_to_customer(uuid, bigint, bigint, date, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_invoices(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_client_monthly_value() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_customer(uuid, bigint, bigint, date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_recurring_invoices(uuid) TO service_role;
