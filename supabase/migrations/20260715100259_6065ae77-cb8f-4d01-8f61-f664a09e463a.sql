
CREATE TABLE public.campaign_tracking_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  lead_ref TEXT,
  lead_name TEXT,
  company TEXT,
  destination_url TEXT NOT NULL,
  click_count INTEGER NOT NULL DEFAULT 0,
  first_visited_at TIMESTAMPTZ,
  last_visited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaign_tracking_links_user ON public.campaign_tracking_links(user_id);
CREATE INDEX idx_campaign_tracking_links_lead_ref ON public.campaign_tracking_links(user_id, lead_ref);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_tracking_links TO authenticated;
GRANT ALL ON public.campaign_tracking_links TO service_role;

ALTER TABLE public.campaign_tracking_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own tracking links"
  ON public.campaign_tracking_links FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_campaign_tracking_links_updated_at
  BEFORE UPDATE ON public.campaign_tracking_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.campaign_link_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES public.campaign_tracking_links(id) ON DELETE CASCADE,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  referer TEXT,
  ip_hash TEXT
);
CREATE INDEX idx_campaign_link_visits_link ON public.campaign_link_visits(link_id, visited_at DESC);

GRANT SELECT ON public.campaign_link_visits TO authenticated;
GRANT ALL ON public.campaign_link_visits TO service_role;

ALTER TABLE public.campaign_link_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view visits on their own links"
  ON public.campaign_link_visits FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.campaign_tracking_links l
    WHERE l.id = campaign_link_visits.link_id AND l.user_id = auth.uid()
  ));
