
-- mail_settings: per-organization send config & template defaults
CREATE TABLE IF NOT EXISTS public.mail_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_email text,
  from_name text,
  reply_to text,
  signature text,
  default_email_template_id uuid REFERENCES public.outreach_message_templates(id) ON DELETE SET NULL,
  default_linkedin_template_id uuid REFERENCES public.outreach_message_templates(id) ON DELETE SET NULL,
  default_whatsapp_template_id uuid REFERENCES public.outreach_message_templates(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_settings TO authenticated;
GRANT ALL ON public.mail_settings TO service_role;

ALTER TABLE public.mail_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mail_settings_select_org" ON public.mail_settings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = mail_settings.organization_id AND m.user_id = auth.uid()));

CREATE POLICY "mail_settings_modify_org" ON public.mail_settings FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = mail_settings.organization_id AND m.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = mail_settings.organization_id AND m.user_id = auth.uid()));

CREATE TRIGGER mail_settings_set_updated_at
BEFORE UPDATE ON public.mail_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- add status timestamp/reason columns for bounce handling
ALTER TABLE public.mail_messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS complained_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounce_type text,
  ADD COLUMN IF NOT EXISTS bounce_reason text;
