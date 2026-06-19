CREATE OR REPLACE FUNCTION public.next_invoice_number(_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  _result text;
BEGIN
  IF NOT app_private.has_org_access(auth.uid(), _org_id) AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Geen toegang tot organisatie';
  END IF;
  SELECT app_private.next_invoice_number(_org_id) INTO _result;
  RETURN _result;
END
$$;

GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO authenticated, service_role;