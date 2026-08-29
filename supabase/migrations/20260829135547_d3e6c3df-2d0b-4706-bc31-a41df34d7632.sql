CREATE TABLE public.client_phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  phone text NOT NULL,
  label text,
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, phone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_phone_numbers TO authenticated;
GRANT ALL ON public.client_phone_numbers TO service_role;
ALTER TABLE public.client_phone_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members manage client phone numbers"
  ON public.client_phone_numbers FOR ALL TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE TRIGGER client_phone_numbers_updated_at BEFORE UPDATE ON public.client_phone_numbers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.messaging_link_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone text NOT NULL,
  action text NOT NULL,
  old_client_id uuid,
  old_client_name text,
  new_client_id uuid,
  new_client_name text,
  message_count integer NOT NULL DEFAULT 0,
  actor_id uuid,
  actor_email text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.messaging_link_audit TO authenticated;
GRANT ALL ON public.messaging_link_audit TO service_role;
ALTER TABLE public.messaging_link_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read messaging link audit"
  ON public.messaging_link_audit FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE TABLE public.messaging_match_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  match_digits integer NOT NULL DEFAULT 9,
  lookback_days integer NOT NULL DEFAULT 365,
  auto_create_client boolean NOT NULL DEFAULT true,
  block_duplicate_numbers boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_digits_range CHECK (match_digits BETWEEN 6 AND 15),
  CONSTRAINT lookback_days_range CHECK (lookback_days BETWEEN 1 AND 3650)
);
GRANT SELECT, INSERT, UPDATE ON public.messaging_match_settings TO authenticated;
GRANT ALL ON public.messaging_match_settings TO service_role;
ALTER TABLE public.messaging_match_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read match settings"
  ON public.messaging_match_settings FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "org members write match settings"
  ON public.messaging_match_settings FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "org members update match settings"
  ON public.messaging_match_settings FOR UPDATE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE TRIGGER messaging_match_settings_updated_at BEFORE UPDATE ON public.messaging_match_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.client_phone_numbers (organization_id, client_id, phone, label, is_primary)
SELECT c.organization_id, c.id, c.phone, 'Hoofdnummer', true
FROM public.clients c
WHERE c.phone IS NOT NULL AND btrim(c.phone) <> ''
ON CONFLICT (organization_id, phone) DO NOTHING;

CREATE INDEX idx_client_phone_numbers_client ON public.client_phone_numbers(client_id);
CREATE INDEX idx_messaging_link_audit_org_created ON public.messaging_link_audit(organization_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.client_phone_numbers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messaging_link_audit;