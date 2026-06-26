ALTER TABLE public.outreach_targets
  ADD COLUMN IF NOT EXISTS personalized_subject text,
  ADD COLUMN IF NOT EXISTS personalized_body text,
  ADD COLUMN IF NOT EXISTS personalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS active_variant_id text;

ALTER TABLE public.outreach_campaigns
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Europe/Amsterdam',
  ADD COLUMN IF NOT EXISTS send_window_start smallint DEFAULT 8,
  ADD COLUMN IF NOT EXISTS send_window_end smallint DEFAULT 18;

ALTER TABLE public.outreach_messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS snooze_until timestamptz,
  ADD COLUMN IF NOT EXISTS handled_at timestamptz,
  ADD COLUMN IF NOT EXISTS handled_by uuid,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS variant_id text;

CREATE INDEX IF NOT EXISTS idx_outreach_messages_inbox
  ON public.outreach_messages(organization_id, direction, received_at DESC)
  WHERE direction = 'inbound';

ALTER PUBLICATION supabase_realtime ADD TABLE public.outreach_messages;