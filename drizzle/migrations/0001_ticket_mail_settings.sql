ALTER TABLE public.mail_settings
  ADD COLUMN IF NOT EXISTS ticket_notify_email text,
  ADD COLUMN IF NOT EXISTS ticket_reply_to text,
  ADD COLUMN IF NOT EXISTS ticket_status_notify boolean NOT NULL DEFAULT true;