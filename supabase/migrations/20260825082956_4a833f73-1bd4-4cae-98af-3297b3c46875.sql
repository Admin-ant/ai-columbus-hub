CREATE TABLE public.telnyx_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  messaging_profile_id text,
  sms_from_number text,
  whatsapp_from_number text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telnyx_settings TO authenticated;
GRANT ALL ON public.telnyx_settings TO service_role;
ALTER TABLE public.telnyx_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY telnyx_settings_select_org ON public.telnyx_settings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = telnyx_settings.organization_id AND m.user_id = auth.uid()));
CREATE POLICY telnyx_settings_modify_org ON public.telnyx_settings FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = telnyx_settings.organization_id AND m.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = telnyx_settings.organization_id AND m.user_id = auth.uid()));
CREATE TRIGGER telnyx_settings_updated_at BEFORE UPDATE ON public.telnyx_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.telnyx_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('sms','whatsapp')),
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  from_number text,
  to_number text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  error text,
  provider_message_id text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telnyx_messages_org_created_idx ON public.telnyx_messages (organization_id, created_at DESC);
CREATE INDEX telnyx_messages_provider_idx ON public.telnyx_messages (provider_message_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telnyx_messages TO authenticated;
GRANT ALL ON public.telnyx_messages TO service_role;
ALTER TABLE public.telnyx_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY telnyx_messages_select_org ON public.telnyx_messages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = telnyx_messages.organization_id AND m.user_id = auth.uid()));
CREATE POLICY telnyx_messages_delete_org ON public.telnyx_messages FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = telnyx_messages.organization_id AND m.user_id = auth.uid()));
CREATE TRIGGER telnyx_messages_updated_at BEFORE UPDATE ON public.telnyx_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();