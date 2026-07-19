
CREATE TABLE public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text,
  email text,
  phone text,
  mobile text,
  linkedin_url text,
  department text,
  job_title text,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_contacts_client ON public.client_contacts(client_id);
CREATE INDEX idx_client_contacts_org ON public.client_contacts(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contacts TO authenticated;
GRANT ALL ON public.client_contacts TO service_role;

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_contacts_select_members ON public.client_contacts
  FOR SELECT USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY client_contacts_insert_members ON public.client_contacts
  FOR INSERT WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY client_contacts_update_members ON public.client_contacts
  FOR UPDATE USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY client_contacts_delete_members ON public.client_contacts
  FOR DELETE USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE TRIGGER update_client_contacts_updated_at
  BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
