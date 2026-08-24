
CREATE OR REPLACE FUNCTION app_private.is_app_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::public.app_role)
$$;

DROP POLICY IF EXISTS "Admins can manage invoice sequences" ON public.invoice_number_sequences;
CREATE POLICY "Admins can manage invoice sequences"
ON public.invoice_number_sequences FOR ALL TO authenticated
USING (app_private.has_org_access(auth.uid(), organization_id) AND app_private.is_app_admin(auth.uid()))
WITH CHECK (app_private.has_org_access(auth.uid(), organization_id) AND app_private.is_app_admin(auth.uid()));

DROP FUNCTION IF EXISTS public.is_app_admin(uuid);
