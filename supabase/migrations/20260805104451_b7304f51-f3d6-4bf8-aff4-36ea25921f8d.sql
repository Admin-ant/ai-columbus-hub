ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS email_frequency text NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS last_digest_sent_at timestamptz;

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_email_frequency_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_email_frequency_check
  CHECK (email_frequency IN ('direct','daily','weekly'));