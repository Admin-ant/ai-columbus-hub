
CREATE TABLE IF NOT EXISTS public.outreach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.outreach_targets(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.outreach_campaigns(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'email',
  direction text NOT NULL DEFAULT 'outbound',
  step_index int,
  subject text,
  body text,
  status text NOT NULL DEFAULT 'queued',
  provider_message_id text,
  error text,
  reply_classification text,
  sentiment text,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_messages TO authenticated;
GRANT ALL ON public.outreach_messages TO service_role;

ALTER TABLE public.outreach_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view outreach messages"
  ON public.outreach_messages FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "Org members can insert outreach messages"
  ON public.outreach_messages FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "Org members can update outreach messages"
  ON public.outreach_messages FOR UPDATE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "Org members can delete outreach messages"
  ON public.outreach_messages FOR DELETE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE TRIGGER update_outreach_messages_updated_at
  BEFORE UPDATE ON public.outreach_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS outreach_messages_target_idx ON public.outreach_messages(target_id);
CREATE INDEX IF NOT EXISTS outreach_messages_provider_idx ON public.outreach_messages(provider_message_id);

ALTER TABLE public.outreach_targets
  ADD COLUMN IF NOT EXISTS sequence_step_index int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_send_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS reply_classification text;

CREATE INDEX IF NOT EXISTS outreach_targets_next_send_idx ON public.outreach_targets(next_send_at) WHERE paused = false;

-- Cron: every 15 minutes, run sequence
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'outreach-sequence-runner') THEN
    PERFORM cron.unschedule('outreach-sequence-runner');
  END IF;
END $$;

SELECT cron.schedule(
  'outreach-sequence-runner',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--0addc860-2162-4de8-8a00-3906ef74a397.lovable.app/api/public/hooks/outreach-sequence',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
