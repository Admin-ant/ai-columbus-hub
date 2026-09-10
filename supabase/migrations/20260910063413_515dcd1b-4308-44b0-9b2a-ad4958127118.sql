ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS track_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_quantity numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS low_stock_threshold numeric(12,3) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_movement_type') THEN
    CREATE TYPE public.stock_movement_type AS ENUM ('in', 'out', 'correction');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_reference_type') THEN
    CREATE TYPE public.stock_reference_type AS ENUM ('invoice', 'invoice_cancel', 'manual', 'correction');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.product_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  movement_type public.stock_movement_type NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  reference_type public.stock_reference_type,
  reference_id uuid,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.product_stock_movements TO authenticated;
GRANT ALL ON public.product_stock_movements TO service_role;
ALTER TABLE public.product_stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read product_stock_movements"
  ON public.product_stock_movements FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "members insert product_stock_movements"
  ON public.product_stock_movements FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE TRIGGER update_product_stock_movements_updated_at
  BEFORE UPDATE ON public.product_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.recompute_product_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _product uuid;
BEGIN
  _product := COALESCE(NEW.product_id, OLD.product_id);
  IF _product IS NULL THEN RETURN NULL; END IF;

  UPDATE public.products
     SET stock_quantity = (
       SELECT COALESCE(SUM(
         CASE movement_type
           WHEN 'in' THEN quantity
           WHEN 'out' THEN -quantity
           WHEN 'correction' THEN quantity
           ELSE 0
         END
       ), 0)
       FROM public.product_stock_movements
       WHERE product_id = _product
     )
   WHERE id = _product;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_recompute_product_stock
  AFTER INSERT OR UPDATE OR DELETE ON public.product_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.recompute_product_stock();

CREATE OR REPLACE FUNCTION public.handle_invoice_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _line record;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('sent', 'paid') AND OLD.status NOT IN ('sent', 'paid') THEN
    FOR _line IN
      SELECT il.id, il.product_id, il.quantity
      FROM public.invoice_lines il
      WHERE il.invoice_id = NEW.id
        AND il.product_id IS NOT NULL
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.products
        WHERE id = _line.product_id AND track_stock = true
      ) THEN
        INSERT INTO public.product_stock_movements
          (organization_id, product_id, movement_type, quantity, reference_type, reference_id, note, created_by)
        VALUES
          (NEW.organization_id, _line.product_id, 'out', _line.quantity, 'invoice', NEW.id, 'Factuur ' || COALESCE(NEW.invoice_number, ''), NEW.created_by);
      END IF;
    END LOOP;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IN ('sent', 'paid') THEN
    FOR _line IN
      SELECT il.id, il.product_id, il.quantity
      FROM public.invoice_lines il
      WHERE il.invoice_id = NEW.id
        AND il.product_id IS NOT NULL
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.products
        WHERE id = _line.product_id AND track_stock = true
      ) THEN
        INSERT INTO public.product_stock_movements
          (organization_id, product_id, movement_type, quantity, reference_type, reference_id, note, created_by)
        VALUES
          (NEW.organization_id, _line.product_id, 'in', _line.quantity, 'invoice_cancel', NEW.id, 'Creditnota / annulatie factuur ' || COALESCE(NEW.invoice_number, ''), NEW.created_by);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handle_invoice_stock
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_invoice_stock();