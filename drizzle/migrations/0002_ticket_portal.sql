ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS portal_token text;

UPDATE public.tickets
SET portal_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE portal_token IS NULL;

ALTER TABLE public.tickets
  ALTER COLUMN portal_token SET DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

CREATE UNIQUE INDEX IF NOT EXISTS tickets_portal_token_key ON public.tickets (portal_token);

CREATE TABLE IF NOT EXISTS public.ticket_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  email text NOT NULL,
  code_hash text,
  code_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  session_token text,
  session_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_portal_sessions_token_idx ON public.ticket_portal_sessions (session_token);
CREATE INDEX IF NOT EXISTS ticket_portal_sessions_email_idx ON public.ticket_portal_sessions (organization_id, lower(email));

GRANT ALL ON public.ticket_portal_sessions TO service_role;
ALTER TABLE public.ticket_portal_sessions ENABLE ROW LEVEL SECURITY;