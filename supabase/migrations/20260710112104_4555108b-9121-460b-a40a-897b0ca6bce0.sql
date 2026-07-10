ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS monthly_value_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS one_time_cents bigint NOT NULL DEFAULT 0;