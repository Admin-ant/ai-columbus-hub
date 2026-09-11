CREATE OR REPLACE FUNCTION public.handle_invoice_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _line record;
  _net numeric;
  _reserved boolean;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  _reserved := NEW.status IN ('sent', 'paid', 'overdue');

  SELECT COALESCE(SUM(CASE WHEN movement_type = 'out' THEN quantity ELSE -quantity END), 0)
    INTO _net
    FROM public.product_stock_movements
   WHERE reference_id = NEW.id
     AND reference_type IN ('invoice', 'invoice_cancel');

  IF _reserved AND _net <= 0 THEN
    FOR _line IN
      SELECT il.product_id, il.quantity
      FROM public.invoice_lines il
      WHERE il.invoice_id = NEW.id
        AND il.product_id IS NOT NULL
    LOOP
      IF EXISTS (SELECT 1 FROM public.products WHERE id = _line.product_id AND track_stock = true) THEN
        INSERT INTO public.product_stock_movements
          (organization_id, product_id, movement_type, quantity, reference_type, reference_id, note, created_by)
        VALUES
          (NEW.organization_id, _line.product_id, 'out', _line.quantity, 'invoice', NEW.id, 'Factuur ' || COALESCE(NEW.invoice_number, ''), NEW.created_by);
      END IF;
    END LOOP;
  ELSIF NOT _reserved AND _net > 0 THEN
    FOR _line IN
      SELECT il.product_id, il.quantity
      FROM public.invoice_lines il
      WHERE il.invoice_id = NEW.id
        AND il.product_id IS NOT NULL
    LOOP
      IF EXISTS (SELECT 1 FROM public.products WHERE id = _line.product_id AND track_stock = true) THEN
        INSERT INTO public.product_stock_movements
          (organization_id, product_id, movement_type, quantity, reference_type, reference_id, note, created_by)
        VALUES
          (NEW.organization_id, _line.product_id, 'in', _line.quantity, 'invoice_cancel', NEW.id, 'Voorraad teruggeboekt factuur ' || COALESCE(NEW.invoice_number, ''), NEW.created_by);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_invoice_stock() FROM PUBLIC, anon, authenticated;