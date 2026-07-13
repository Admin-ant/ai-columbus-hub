CREATE OR REPLACE FUNCTION public.create_customer_from_lead(_lead_id uuid, _monthly_cents bigint, _setup_cents bigint, _start_date date, _title text)
 RETURNS TABLE(out_client_id uuid, out_project_id uuid, out_contract_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private'
AS $function$
DECLARE
  _lead public.leads%ROWTYPE;
  _client_id uuid;
  _project_id uuid;
  _contract_id uuid;
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead niet gevonden'; END IF;
  IF auth.role() <> 'service_role' AND NOT app_private.has_org_access(auth.uid(), _lead.organization_id) THEN
    RAISE EXCEPTION 'Geen toegang';
  END IF;

  IF _lead.converted_client_id IS NOT NULL THEN
    _client_id := _lead.converted_client_id;
  ELSE
    INSERT INTO public.clients (organization_id, name, contact_person, email, phone, monthly_value, start_date, created_by)
    VALUES (_lead.organization_id, COALESCE(NULLIF(_lead.company,''), _lead.name), _lead.name, _lead.email, _lead.phone, (_monthly_cents::numeric/100), _start_date, auth.uid())
    RETURNING id INTO _client_id;
  END IF;

  INSERT INTO public.projects (organization_id, client_id, name, status, value_cents, created_by)
  VALUES (_lead.organization_id, _client_id, _title, 'contract_getekend'::project_status, _monthly_cents, auth.uid())
  RETURNING id INTO _project_id;

  INSERT INTO public.contracts (organization_id, client_id, project_id, title, status, start_date, monthly_amount_cents, setup_fee_cents, next_invoice_date, created_by)
  VALUES (_lead.organization_id, _client_id, _project_id, _title, 'active', _start_date, _monthly_cents, _setup_cents, _start_date, auth.uid())
  RETURNING id INTO _contract_id;

  IF _monthly_cents > 0 THEN
    INSERT INTO public.contract_lines (contract_id, description, quantity, unit_price_cents, vat_rate, position)
    VALUES (_contract_id, _title || ' — maandelijks abonnement', 1, _monthly_cents, 21, 0);
  END IF;
  IF _setup_cents > 0 THEN
    INSERT INTO public.contract_lines (contract_id, description, quantity, unit_price_cents, vat_rate, position)
    VALUES (_contract_id, 'Eenmalige implementatiekosten', 1, _setup_cents, 21, 1);
  END IF;

  -- Koppel de lead aan de aangemaakte records, maar wijzig de stage NIET
  UPDATE public.leads
     SET converted_client_id = _client_id,
         converted_project_id = _project_id,
         converted_contract_id = _contract_id
   WHERE id = _lead_id;

  out_client_id := _client_id;
  out_project_id := _project_id;
  out_contract_id := _contract_id;
  RETURN NEXT;
END $function$;