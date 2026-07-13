
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS confirm_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reschedule_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reschedule_note TEXT;

-- Backfill tokens for any existing rows without one
UPDATE public.appointments SET confirm_token = encode(gen_random_bytes(24), 'hex') WHERE confirm_token IS NULL;

ALTER TABLE public.appointments ALTER COLUMN confirm_token SET NOT NULL;

CREATE INDEX IF NOT EXISTS appointments_confirm_token_idx ON public.appointments (confirm_token);

-- Public read policy scoped by token: allow anon to select minimal rows via server (we use service role in the public handler, so no anon policy needed).
