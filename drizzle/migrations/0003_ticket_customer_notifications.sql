ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS customer_notify_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS customer_seen_at timestamptz;