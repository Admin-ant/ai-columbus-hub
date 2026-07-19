
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS contact_permissions JSONB NOT NULL DEFAULT
    '{"create":"admin","update":"admin","delete":"admin"}'::jsonb;

CREATE OR REPLACE FUNCTION public.can_manage_client_contact(_org_id UUID, _action TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  _uid UUID := auth.uid();
  _required TEXT;
BEGIN
  IF _uid IS NULL THEN RETURN FALSE; END IF;
  IF NOT app_private.has_org_access(_uid, _org_id) THEN RETURN FALSE; END IF;
  IF app_private.has_role(_uid, 'admin'::app_role) THEN RETURN TRUE; END IF;

  SELECT COALESCE(contact_permissions->>_action, 'admin')
    INTO _required
    FROM public.organizations WHERE id = _org_id;

  RETURN _required = 'medewerker'
     AND app_private.has_role(_uid, 'medewerker'::app_role);
END $$;

REVOKE EXECUTE ON FUNCTION public.can_manage_client_contact(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_client_contact(UUID, TEXT) TO authenticated;

DROP POLICY IF EXISTS "client_contacts_insert_members" ON public.client_contacts;
DROP POLICY IF EXISTS "client_contacts_update_members" ON public.client_contacts;
DROP POLICY IF EXISTS "client_contacts_delete_members" ON public.client_contacts;

CREATE POLICY "client_contacts_insert_by_role" ON public.client_contacts
  FOR INSERT WITH CHECK (public.can_manage_client_contact(organization_id, 'create'));

CREATE POLICY "client_contacts_update_by_role" ON public.client_contacts
  FOR UPDATE USING (public.can_manage_client_contact(organization_id, 'update'))
  WITH CHECK (public.can_manage_client_contact(organization_id, 'update'));

CREATE POLICY "client_contacts_delete_by_role" ON public.client_contacts
  FOR DELETE USING (public.can_manage_client_contact(organization_id, 'delete'));
