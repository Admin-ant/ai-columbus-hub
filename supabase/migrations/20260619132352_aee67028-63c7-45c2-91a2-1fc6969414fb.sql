
REVOKE EXECUTE ON FUNCTION public.is_holding_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_org_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_holding_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_access(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO authenticated, service_role;
