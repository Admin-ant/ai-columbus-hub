ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payer_email text,
  ADD COLUMN IF NOT EXISTS payer_company text,
  ADD COLUMN IF NOT EXISTS payer_kvk text,
  ADD COLUMN IF NOT EXISTS payer_vat text,
  ADD COLUMN IF NOT EXISTS mollie_checkout_url text;

-- Backfill paid_at for already-paid quotes
UPDATE public.quotes SET paid_at = COALESCE(paid_at, now())
 WHERE status = 'approved_paid' AND paid_at IS NULL;