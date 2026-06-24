
ALTER TABLE public.outreach_targets
  ADD COLUMN IF NOT EXISTS research_summary text,
  ADD COLUMN IF NOT EXISTS research_at timestamptz,
  ADD COLUMN IF NOT EXISTS pitch_variant_id text;

ALTER TABLE public.outreach_campaigns
  ADD COLUMN IF NOT EXISTS pitch_variants jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.studio_quotes
  ADD COLUMN IF NOT EXISTS ai_brief text;
