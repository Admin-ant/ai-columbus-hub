-- Quote templates: opgeslagen layouts/sjablonen voor de offerte-studio
CREATE TABLE public.quote_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  cover_image_url text,
  theme jsonb NOT NULL DEFAULT '{"accent":"#ff2bd6","bg":"#0a0a0a","fg":"#ffffff"}'::jsonb,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_templates TO authenticated;
GRANT ALL ON public.quote_templates TO service_role;

ALTER TABLE public.quote_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read templates in their orgs"
  ON public.quote_templates FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Members can insert templates in their orgs"
  ON public.quote_templates FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Members can update templates in their orgs"
  ON public.quote_templates FOR UPDATE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Members can delete templates in their orgs"
  ON public.quote_templates FOR DELETE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE INDEX quote_templates_org_idx ON public.quote_templates(organization_id, created_at DESC);

CREATE TRIGGER update_quote_templates_updated_at
  BEFORE UPDATE ON public.quote_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Studio documents: een concrete offerte in studio-formaat (los van de bestaande quotes-tabel)
CREATE TABLE public.studio_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.quote_templates(id) ON DELETE SET NULL,
  title text NOT NULL,
  client_name text,
  cover_image_url text,
  theme jsonb NOT NULL DEFAULT '{"accent":"#ff2bd6","bg":"#0a0a0a","fg":"#ffffff"}'::jsonb,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  approved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_quotes TO authenticated;
GRANT ALL ON public.studio_quotes TO service_role;

ALTER TABLE public.studio_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read studio quotes in their orgs"
  ON public.studio_quotes FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Members can insert studio quotes in their orgs"
  ON public.studio_quotes FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Members can update studio quotes in their orgs"
  ON public.studio_quotes FOR UPDATE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Members can delete studio quotes in their orgs"
  ON public.studio_quotes FOR DELETE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE INDEX studio_quotes_org_idx ON public.studio_quotes(organization_id, created_at DESC);

CREATE TRIGGER update_studio_quotes_updated_at
  BEFORE UPDATE ON public.studio_quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();