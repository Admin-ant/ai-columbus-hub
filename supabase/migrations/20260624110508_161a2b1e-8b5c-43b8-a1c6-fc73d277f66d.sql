
-- studio_quotes: public sharing + outreach link
ALTER TABLE public.studio_quotes
  ADD COLUMN IF NOT EXISTS public_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by_name text,
  ADD COLUMN IF NOT EXISTS accepted_signature text,
  ADD COLUMN IF NOT EXISTS outreach_target_id uuid REFERENCES public.outreach_targets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS studio_quotes_public_token_idx ON public.studio_quotes(public_token);
CREATE INDEX IF NOT EXISTS studio_quotes_outreach_target_idx ON public.studio_quotes(outreach_target_id);

-- outreach_campaigns: AI sequences
ALTER TABLE public.outreach_campaigns
  ADD COLUMN IF NOT EXISTS sequence_steps jsonb NOT NULL DEFAULT '[]'::jsonb;
