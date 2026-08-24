
REVOKE EXECUTE ON FUNCTION public.announce_new_lead() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.announce_lead_stage_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.announce_new_client() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_app_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::public.app_role)
$$;
REVOKE EXECUTE ON FUNCTION public.is_app_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Members can manage invoice sequences" ON public.invoice_number_sequences;
DROP POLICY IF EXISTS "Admins can manage invoice sequences" ON public.invoice_number_sequences;
CREATE POLICY "Admins can manage invoice sequences"
ON public.invoice_number_sequences FOR ALL TO authenticated
USING (app_private.has_org_access(auth.uid(), organization_id) AND public.is_app_admin(auth.uid()))
WITH CHECK (app_private.has_org_access(auth.uid(), organization_id) AND public.is_app_admin(auth.uid()));

REVOKE ALL ON public.invoice_payment_events FROM anon;
REVOKE ALL ON public.recurring_invoice_runs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.invoice_payment_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.recurring_invoice_runs FROM authenticated;
GRANT SELECT ON public.invoice_payment_events TO authenticated;
GRANT SELECT ON public.recurring_invoice_runs TO authenticated;
GRANT ALL ON public.invoice_payment_events TO service_role;
GRANT ALL ON public.recurring_invoice_runs TO service_role;
