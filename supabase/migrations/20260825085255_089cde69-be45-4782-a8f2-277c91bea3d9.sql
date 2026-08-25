ALTER TABLE public.telnyx_settings
  ADD COLUMN IF NOT EXISTS webhook_secret_hash text,
  ADD COLUMN IF NOT EXISTS webhook_secret_configured_at timestamptz;

CREATE TABLE public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('sms', 'whatsapp')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, channel, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY message_templates_select_org ON public.message_templates
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = message_templates.organization_id
      AND m.user_id = auth.uid()
  ));
CREATE POLICY message_templates_insert_org_admin ON public.message_templates
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = message_templates.organization_id
      AND m.user_id = auth.uid()
      AND m.role = 'holding_admin'
  ));
CREATE POLICY message_templates_update_org_admin ON public.message_templates
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = message_templates.organization_id
      AND m.user_id = auth.uid()
      AND m.role = 'holding_admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = message_templates.organization_id
      AND m.user_id = auth.uid()
      AND m.role = 'holding_admin'
  ));
CREATE POLICY message_templates_delete_org_admin ON public.message_templates
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = message_templates.organization_id
      AND m.user_id = auth.uid()
      AND m.role = 'holding_admin'
  ));
CREATE INDEX message_templates_org_channel_idx ON public.message_templates (organization_id, channel, name);
CREATE TRIGGER message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();