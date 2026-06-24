-- 1. Uitbreidingen op studio_quotes
ALTER TABLE public.studio_quotes
  ADD COLUMN IF NOT EXISTS intro_video_url text,
  ADD COLUMN IF NOT EXISTS packages jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_package_id text,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS followup_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_count integer NOT NULL DEFAULT 0;

-- 2. Events tabel voor heatmap + tracking
CREATE TABLE IF NOT EXISTS public.studio_quote_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.studio_quotes(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  event_type text NOT NULL,
  section_key text,
  duration_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.studio_quote_events TO authenticated;
GRANT ALL ON public.studio_quote_events TO service_role;

ALTER TABLE public.studio_quote_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read studio events"
  ON public.studio_quote_events FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Service role full access studio events"
  ON public.studio_quote_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS studio_quote_events_quote_idx
  ON public.studio_quote_events(quote_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS studio_quote_events_type_idx
  ON public.studio_quote_events(quote_id, event_type, section_key);
