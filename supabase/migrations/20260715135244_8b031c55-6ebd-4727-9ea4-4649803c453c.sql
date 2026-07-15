ALTER TABLE public.studio_quotes
  ADD COLUMN IF NOT EXISTS mail_template_id uuid REFERENCES public.outreach_message_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mail_background_id uuid REFERENCES public.mail_backgrounds(id) ON DELETE SET NULL;

ALTER TABLE public.quote_templates
  ADD COLUMN IF NOT EXISTS mail_template_id uuid REFERENCES public.outreach_message_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mail_background_id uuid REFERENCES public.mail_backgrounds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_studio_quotes_mail_template ON public.studio_quotes(mail_template_id);
CREATE INDEX IF NOT EXISTS idx_studio_quotes_mail_background ON public.studio_quotes(mail_background_id);
CREATE INDEX IF NOT EXISTS idx_quote_templates_mail_template ON public.quote_templates(mail_template_id);
CREATE INDEX IF NOT EXISTS idx_quote_templates_mail_background ON public.quote_templates(mail_background_id);