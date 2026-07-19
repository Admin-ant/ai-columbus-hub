
-- Recreate can_manage_client_contact in app_private (not exposed via PostgREST API)
CREATE OR REPLACE FUNCTION app_private.can_manage_client_contact(_org_id uuid, _action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'app_private'
AS $function$
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
END $function$;

GRANT EXECUTE ON FUNCTION app_private.can_manage_client_contact(uuid, text) TO authenticated;

-- Update policies to reference app_private version
DROP POLICY IF EXISTS client_contacts_insert_by_role ON public.client_contacts;
DROP POLICY IF EXISTS client_contacts_update_by_role ON public.client_contacts;
DROP POLICY IF EXISTS client_contacts_delete_by_role ON public.client_contacts;

CREATE POLICY client_contacts_insert_by_role ON public.client_contacts
  FOR INSERT TO authenticated
  WITH CHECK (app_private.can_manage_client_contact(organization_id, 'create'));

CREATE POLICY client_contacts_update_by_role ON public.client_contacts
  FOR UPDATE TO authenticated
  USING (app_private.can_manage_client_contact(organization_id, 'update'))
  WITH CHECK (app_private.can_manage_client_contact(organization_id, 'update'));

CREATE POLICY client_contacts_delete_by_role ON public.client_contacts
  FOR DELETE TO authenticated
  USING (app_private.can_manage_client_contact(organization_id, 'delete'));

-- Drop the public-schema function so it's no longer callable via the Data API
DROP FUNCTION IF EXISTS public.can_manage_client_contact(uuid, text);
