
CREATE TABLE public.campaign_flow_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  email TEXT NOT NULL,
  website TEXT NOT NULL,
  email_preview TEXT,
  tracking_link_id UUID REFERENCES public.campaign_tracking_links(id) ON DELETE SET NULL,
  tracking_token TEXT,
  email_sent_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  stage SMALLINT NOT NULL DEFAULT 1,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaign_flow_leads_user ON public.campaign_flow_leads(user_id, created_at DESC);
CREATE INDEX idx_campaign_flow_leads_open ON public.campaign_flow_leads(closed_at) WHERE closed_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_flow_leads TO authenticated;
GRANT ALL ON public.campaign_flow_leads TO service_role;

ALTER TABLE public.campaign_flow_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own campaign flow leads"
  ON public.campaign_flow_leads FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_campaign_flow_leads_updated_at
  BEFORE UPDATE ON public.campaign_flow_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.campaign_flow_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.campaign_flow_leads(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('call','followup')),
  reason TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id, action)
);
CREATE INDEX idx_campaign_flow_tasks_user ON public.campaign_flow_tasks(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_flow_tasks TO authenticated;
GRANT ALL ON public.campaign_flow_tasks TO service_role;

ALTER TABLE public.campaign_flow_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own campaign flow tasks"
  ON public.campaign_flow_tasks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_campaign_flow_tasks_updated_at
  BEFORE UPDATE ON public.campaign_flow_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
