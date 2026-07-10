ALTER TABLE public.mail_settings
  ADD COLUMN IF NOT EXISTS invite_subject TEXT,
  ADD COLUMN IF NOT EXISTS invite_body TEXT;