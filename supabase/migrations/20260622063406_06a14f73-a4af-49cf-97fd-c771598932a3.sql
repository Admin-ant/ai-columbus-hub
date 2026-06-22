
CREATE TYPE public.project_status AS ENUM (
  'contact_gezocht','afspraak_geboekt','offerte_verstuurd','contract_verstuurd','contract_getekend','on_hold'
);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  value_cents bigint NOT NULL DEFAULT 0,
  target_month date,
  status public.project_status NOT NULL DEFAULT 'contact_gezocht',
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  last_modified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_modified_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_org ON public.projects(organization_id);
CREATE INDEX idx_projects_status ON public.projects(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view projects"
ON public.projects FOR SELECT TO authenticated
USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can insert projects"
ON public.projects FOR INSERT TO authenticated
WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can update projects"
ON public.projects FOR UPDATE TO authenticated
USING (app_private.has_org_access(auth.uid(), organization_id))
WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can delete projects"
ON public.projects FOR DELETE TO authenticated
USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE TRIGGER trg_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial 13 rows for AI van Columbus
INSERT INTO public.projects (organization_id, name, value_cents, target_month) VALUES
  ('d30d790a-7167-4ede-94b4-ad6b7d408a8a','nzet',200000,'2026-06-01'),
  ('d30d790a-7167-4ede-94b4-ad6b7d408a8a','Creditsafe',40000,'2026-06-01'),
  ('d30d790a-7167-4ede-94b4-ad6b7d408a8a','Florian',120000,'2026-08-01'),
  ('d30d790a-7167-4ede-94b4-ad6b7d408a8a','Hollandse glorie',35000,'2026-04-01'),
  ('d30d790a-7167-4ede-94b4-ad6b7d408a8a','Self reliance',85000,'2026-08-01'),
  ('d30d790a-7167-4ede-94b4-ad6b7d408a8a','PCES nv',37500,'2026-08-01'),
  ('d30d790a-7167-4ede-94b4-ad6b7d408a8a','XX (whatsapp)',27000,'2026-08-01'),
  ('d30d790a-7167-4ede-94b4-ad6b7d408a8a','Project SUR',0,'2026-09-01'),
  ('d30d790a-7167-4ede-94b4-ad6b7d408a8a','Kredietbank',250000,'2027-01-01'),
  ('d30d790a-7167-4ede-94b4-ad6b7d408a8a','Arbo Anders',90000,'2026-08-01'),
  ('d30d790a-7167-4ede-94b4-ad6b7d408a8a','De Haan person',150000,'2026-07-01'),
  ('d30d790a-7167-4ede-94b4-ad6b7d408a8a','Mployee',150000,'2026-07-01'),
  ('d30d790a-7167-4ede-94b4-ad6b7d408a8a','Young Cap',250000,'2026-09-01');
