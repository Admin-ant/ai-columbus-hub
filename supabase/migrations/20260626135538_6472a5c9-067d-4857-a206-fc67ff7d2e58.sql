
-- Template version history
CREATE TABLE public.outreach_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.outreach_message_templates(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version int NOT NULL,
  name text NOT NULL,
  description text,
  subject text,
  body text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

GRANT SELECT, INSERT, DELETE ON public.outreach_template_versions TO authenticated;
GRANT ALL ON public.outreach_template_versions TO service_role;

ALTER TABLE public.outreach_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members view template versions"
  ON public.outreach_template_versions FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "org members insert template versions"
  ON public.outreach_template_versions FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "org members delete template versions"
  ON public.outreach_template_versions FOR DELETE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE INDEX outreach_template_versions_template_idx
  ON public.outreach_template_versions(template_id, version DESC);

-- Auto-snapshot a version whenever the template content changes
CREATE OR REPLACE FUNCTION public.snapshot_outreach_template_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next int;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.name IS NOT DISTINCT FROM OLD.name
       AND NEW.description IS NOT DISTINCT FROM OLD.description
       AND NEW.subject IS NOT DISTINCT FROM OLD.subject
       AND NEW.body IS NOT DISTINCT FROM OLD.body THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO _next
  FROM public.outreach_template_versions WHERE template_id = NEW.id;

  INSERT INTO public.outreach_template_versions
    (template_id, organization_id, version, name, description, subject, body, created_by)
  VALUES
    (NEW.id, NEW.organization_id, _next, NEW.name, NEW.description, NEW.subject, NEW.body, auth.uid());

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_outreach_template_version_insert
  AFTER INSERT ON public.outreach_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_outreach_template_version();

CREATE TRIGGER trg_outreach_template_version_update
  AFTER UPDATE ON public.outreach_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_outreach_template_version();

-- Seed initial v1 for existing templates that have no history yet
INSERT INTO public.outreach_template_versions
  (template_id, organization_id, version, name, description, subject, body)
SELECT t.id, t.organization_id, 1, t.name, t.description, t.subject, t.body
FROM public.outreach_message_templates t
WHERE NOT EXISTS (
  SELECT 1 FROM public.outreach_template_versions v WHERE v.template_id = t.id
);
