
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS payment_link_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_link_url text;

CREATE OR REPLACE FUNCTION public.generate_recurring_invoices(_only_contract_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(contract_id uuid, invoice_id uuid, status text, error text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private'
AS $function$
DECLARE
  _c public.contracts%ROWTYPE;
  _inv_id uuid;
  _inv_no text;
  _line record;
  _period_start date;
  _period_end date;
  _subtotal bigint;
  _vat bigint;
  _total bigint;
  _client_name text;
  _pay_link text;
BEGIN
  FOR _c IN
    SELECT * FROM public.contracts
    WHERE status = 'active' AND auto_invoice = true
      AND (_only_contract_id IS NULL OR id = _only_contract_id)
      AND next_invoice_date IS NOT NULL
      AND next_invoice_date <= CURRENT_DATE
  LOOP
    _period_start := _c.next_invoice_date;
    _period_end := NULL;
    BEGIN
      _period_end := CASE _c.billing_frequency
        WHEN 'monthly' THEN (_period_start + INTERVAL '1 month')::date - 1
        WHEN 'quarterly' THEN (_period_start + INTERVAL '3 months')::date - 1
        WHEN 'yearly' THEN (_period_start + INTERVAL '1 year')::date - 1
      END;

      SELECT name INTO _client_name FROM public.clients WHERE id = _c.client_id;
      _inv_no := app_private.next_invoice_number(_c.organization_id);

      SELECT COALESCE(SUM((quantity*unit_price_cents)::bigint),0),
             COALESCE(SUM(((quantity*unit_price_cents*vat_rate)/100)::bigint),0)
        INTO _subtotal, _vat
        FROM public.contract_lines WHERE contract_id = _c.id;
      _total := _subtotal + _vat;

      _pay_link := CASE WHEN _c.payment_link_enabled AND _c.payment_link_url IS NOT NULL AND length(btrim(_c.payment_link_url)) > 0
                        THEN btrim(_c.payment_link_url) ELSE NULL END;

      INSERT INTO public.invoices (organization_id, client_id, client_name, contract_id, project_id, invoice_number, status, issue_date, due_date, subtotal_cents, vat_cents, total_cents, amount, currency, payment_link_url)
      VALUES (_c.organization_id, _c.client_id, _client_name, _c.id, _c.project_id, _inv_no, 'draft'::invoice_status, CURRENT_DATE, CURRENT_DATE + _c.payment_terms_days, _subtotal, _vat, _total, (_total::numeric/100), _c.currency, _pay_link)
      RETURNING id INTO _inv_id;

      FOR _line IN SELECT * FROM public.contract_lines WHERE contract_id = _c.id ORDER BY position LOOP
        INSERT INTO public.invoice_lines (invoice_id, description, quantity, unit_price_cents, vat_rate, subtotal_cents, vat_cents, total_cents, position)
        VALUES (
          _inv_id,
          _line.description || ' (' || to_char(_period_start,'DD-MM-YYYY') || ' t/m ' || to_char(_period_end,'DD-MM-YYYY') || ')',
          _line.quantity, _line.unit_price_cents, _line.vat_rate,
          (_line.quantity*_line.unit_price_cents)::bigint,
          ((_line.quantity*_line.unit_price_cents*_line.vat_rate)/100)::bigint,
          ((_line.quantity*_line.unit_price_cents) + (_line.quantity*_line.unit_price_cents*_line.vat_rate)/100)::bigint,
          _line.position
        );
      END LOOP;

      UPDATE public.contracts
         SET last_invoiced_at = now(),
             next_invoice_date = CASE billing_frequency
               WHEN 'monthly' THEN (next_invoice_date + INTERVAL '1 month')::date
               WHEN 'quarterly' THEN (next_invoice_date + INTERVAL '3 months')::date
               WHEN 'yearly' THEN (next_invoice_date + INTERVAL '1 year')::date
             END
       WHERE id = _c.id;

      INSERT INTO public.recurring_invoice_runs (organization_id, contract_id, invoice_id, period_start, period_end, status)
      VALUES (_c.organization_id, _c.id, _inv_id, _period_start, _period_end, 'ok');

      contract_id := _c.id; invoice_id := _inv_id; status := 'ok'; error := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.recurring_invoice_runs (organization_id, contract_id, period_start, period_end, status, error)
      VALUES (_c.organization_id, _c.id, COALESCE(_period_start, CURRENT_DATE), COALESCE(_period_end, CURRENT_DATE), 'error', SQLERRM);
      contract_id := _c.id; invoice_id := NULL; status := 'error'; error := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END $function$;
