
-- Extend outreach_message_templates with visual layout fields
ALTER TABLE public.outreach_message_templates
  ADD COLUMN IF NOT EXISTS background_color text,
  ADD COLUMN IF NOT EXISTS background_image_url text,
  ADD COLUMN IF NOT EXISTS header_html text,
  ADD COLUMN IF NOT EXISTS footer_html text,
  ADD COLUMN IF NOT EXISTS mail_background_id uuid;

-- Reusable mail backgrounds (skins) per organization
CREATE TABLE IF NOT EXISTS public.mail_backgrounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  background_color text,
  background_image_url text,
  header_html text,
  footer_html text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_backgrounds TO authenticated;
GRANT ALL ON public.mail_backgrounds TO service_role;

ALTER TABLE public.mail_backgrounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mail_backgrounds_org_select" ON public.mail_backgrounds
  FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "mail_backgrounds_org_insert" ON public.mail_backgrounds
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "mail_backgrounds_org_update" ON public.mail_backgrounds
  FOR UPDATE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "mail_backgrounds_org_delete" ON public.mail_backgrounds
  FOR DELETE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE TRIGGER mail_backgrounds_updated_at
  BEFORE UPDATE ON public.mail_backgrounds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Optional soft link (no strict FK because backgrounds may be deleted independently)
CREATE INDEX IF NOT EXISTS idx_outreach_message_templates_mail_background
  ON public.outreach_message_templates(mail_background_id);
