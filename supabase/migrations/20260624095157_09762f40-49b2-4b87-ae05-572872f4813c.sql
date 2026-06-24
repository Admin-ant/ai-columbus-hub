
-- Outreach campagnes
CREATE TABLE public.outreach_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','linkedin','cold-call','multi')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed')),
  goal text,
  daily_limit int NOT NULL DEFAULT 20,
  ai_pitch text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_campaigns TO authenticated;
GRANT ALL ON public.outreach_campaigns TO service_role;

ALTER TABLE public.outreach_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members view outreach campaigns"
  ON public.outreach_campaigns FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "org members insert outreach campaigns"
  ON public.outreach_campaigns FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "org members update outreach campaigns"
  ON public.outreach_campaigns FOR UPDATE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "org members delete outreach campaigns"
  ON public.outreach_campaigns FOR DELETE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE TRIGGER update_outreach_campaigns_updated_at
  BEFORE UPDATE ON public.outreach_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Outreach targets (prospects in pipeline)
CREATE TABLE public.outreach_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.outreach_campaigns(id) ON DELETE SET NULL,
  company text NOT NULL,
  contact_name text,
  email text,
  phone text,
  linkedin_url text,
  stage text NOT NULL DEFAULT 'nieuw' CHECK (stage IN ('nieuw','aangeschreven','reactie','gesprek','gewonnen','verloren')),
  last_contact_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_targets TO authenticated;
GRANT ALL ON public.outreach_targets TO service_role;

ALTER TABLE public.outreach_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members view outreach targets"
  ON public.outreach_targets FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "org members insert outreach targets"
  ON public.outreach_targets FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "org members update outreach targets"
  ON public.outreach_targets FOR UPDATE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "org members delete outreach targets"
  ON public.outreach_targets FOR DELETE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE TRIGGER update_outreach_targets_updated_at
  BEFORE UPDATE ON public.outreach_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX outreach_targets_campaign_idx ON public.outreach_targets(campaign_id);
CREATE INDEX outreach_targets_org_stage_idx ON public.outreach_targets(organization_id, stage);
