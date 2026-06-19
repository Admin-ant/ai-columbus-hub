
-- Products table
CREATE TYPE public.pricing_type AS ENUM ('one_time', 'monthly_recurring', 'per_credit');

CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  unit_price_cents bigint NOT NULL DEFAULT 0,
  pricing_type public.pricing_type NOT NULL DEFAULT 'one_time',
  vat_rate numeric NOT NULL DEFAULT 21,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view products" ON public.products
  FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Members can manage products" ON public.products
  FOR ALL TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS potential_monthly_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_start_date date;

-- Extend invoice_lines to optionally reference a product
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
