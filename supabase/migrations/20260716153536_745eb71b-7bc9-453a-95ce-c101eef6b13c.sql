DROP POLICY IF EXISTS "Users manage their own campaign flow leads" ON public.campaign_flow_leads;
CREATE POLICY "Users manage their own campaign flow leads"
  ON public.campaign_flow_leads FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage their own campaign flow tasks" ON public.campaign_flow_tasks;
CREATE POLICY "Users manage their own campaign flow tasks"
  ON public.campaign_flow_tasks FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage their own tracking links" ON public.campaign_tracking_links;
CREATE POLICY "Users manage their own tracking links"
  ON public.campaign_tracking_links FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view visits on their own links" ON public.campaign_link_visits;
CREATE POLICY "Users view visits on their own links"
  ON public.campaign_link_visits FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaign_tracking_links l
    WHERE l.id = campaign_link_visits.link_id AND l.user_id = auth.uid()
  ));