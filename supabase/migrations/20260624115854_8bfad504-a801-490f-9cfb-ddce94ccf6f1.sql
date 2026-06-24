
-- Sprint 4: Enterprise

-- CRM activities (notes, calls, meetings, tasks)
CREATE TABLE public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  target_id uuid REFERENCES public.outreach_targets(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES public.studio_quotes(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('note','call','meeting','task','email')),
  title text,
  body text,
  due_at timestamptz,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activities TO authenticated;
GRANT ALL ON public.crm_activities TO service_role;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_activities org access" ON public.crm_activities
  FOR ALL TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE TRIGGER trg_crm_activities_updated BEFORE UPDATE ON public.crm_activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_crm_activities_target ON public.crm_activities(target_id);
CREATE INDEX idx_crm_activities_quote ON public.crm_activities(quote_id);
CREATE INDEX idx_crm_activities_client ON public.crm_activities(client_id);

-- Team comments with @mentions on studio quotes
CREATE TABLE public.quote_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.studio_quotes(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  mentions uuid[] NOT NULL DEFAULT '{}',
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_comments TO authenticated;
GRANT ALL ON public.quote_comments TO service_role;
ALTER TABLE public.quote_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quote_comments org access" ON public.quote_comments
  FOR ALL TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE TRIGGER trg_quote_comments_updated BEFORE UPDATE ON public.quote_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_quote_comments_quote ON public.quote_comments(quote_id);

-- Win/Loss analysis for quotes
ALTER TABLE public.studio_quotes
  ADD COLUMN IF NOT EXISTS outcome text CHECK (outcome IN ('won','lost','no_decision')),
  ADD COLUMN IF NOT EXISTS outcome_reason text,
  ADD COLUMN IF NOT EXISTS outcome_at timestamptz,
  ADD COLUMN IF NOT EXISTS win_probability numeric(5,2),
  ADD COLUMN IF NOT EXISTS ai_winloss jsonb;

-- White-label branding per organization
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS brand_primary_color text,
  ADD COLUMN IF NOT EXISTS brand_logo_url text,
  ADD COLUMN IF NOT EXISTS brand_accent_color text,
  ADD COLUMN IF NOT EXISTS brand_font text,
  ADD COLUMN IF NOT EXISTS brand_custom_domain text;

-- Forecast snapshots (cached weighted pipeline by period)
CREATE TABLE public.forecast_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  weighted_value_cents bigint NOT NULL DEFAULT 0,
  best_case_cents bigint NOT NULL DEFAULT 0,
  commit_cents bigint NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forecast_snapshots TO authenticated;
GRANT ALL ON public.forecast_snapshots TO service_role;
ALTER TABLE public.forecast_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forecast_snapshots org access" ON public.forecast_snapshots
  FOR ALL TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE TRIGGER trg_forecast_snapshots_updated BEFORE UPDATE ON public.forecast_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
