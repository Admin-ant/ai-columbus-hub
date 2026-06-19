DO $$ BEGIN
  CREATE TYPE public.discount_type AS ENUM ('none', 'one_time', 'recurring');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) NOT NULL DEFAULT 0
    CHECK (discount_percent >= 0 AND discount_percent <= 100),
  ADD COLUMN IF NOT EXISTS discount_type public.discount_type NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS contract_months integer
    CHECK (contract_months IS NULL OR contract_months > 0);