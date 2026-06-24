ALTER TABLE public.quote_templates
  ADD COLUMN IF NOT EXISTS preview_token text,
  ADD COLUMN IF NOT EXISTS preview_token_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS quote_templates_preview_token_key
  ON public.quote_templates (preview_token)
  WHERE preview_token IS NOT NULL;