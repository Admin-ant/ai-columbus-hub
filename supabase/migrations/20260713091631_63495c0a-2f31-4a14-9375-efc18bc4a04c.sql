
-- Mollie fields on invoices for pay-links
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS mollie_payment_id text,
  ADD COLUMN IF NOT EXISTS mollie_checkout_url text,
  ADD COLUMN IF NOT EXISTS payment_link_url text;

-- Optional line type so we can render service fees / discounts / shipping
-- separately in the invoice template. Defaults to 'item' for existing rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'invoice_line_type'
  ) THEN
    CREATE TYPE public.invoice_line_type AS ENUM ('item','service_fee','discount','shipping');
  END IF;
END $$;

ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS line_type public.invoice_line_type NOT NULL DEFAULT 'item';
