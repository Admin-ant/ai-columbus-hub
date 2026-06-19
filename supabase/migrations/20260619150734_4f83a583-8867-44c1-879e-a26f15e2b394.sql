ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS setup_fee_cents bigint NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS products_org_sku_uniq
  ON public.products (organization_id, sku) WHERE sku IS NOT NULL;