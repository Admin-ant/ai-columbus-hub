
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS public_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by_name text,
  ADD COLUMN IF NOT EXISTS signature_svg text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_ip text;

-- Genereer tokens voor bestaande rijen
UPDATE public.quotes
   SET public_token = encode(gen_random_bytes(18), 'hex')
 WHERE public_token IS NULL;

-- Publieke leesregel via token (alleen op token, geen org leak)
DROP POLICY IF EXISTS "Public can view quote via token" ON public.quotes;
CREATE POLICY "Public can view quote via token"
  ON public.quotes FOR SELECT
  TO anon, authenticated
  USING (public_token IS NOT NULL);

GRANT SELECT ON public.quotes TO anon;

-- Publieke RPC om te ondertekenen (security definer)
CREATE OR REPLACE FUNCTION public.accept_quote_by_token(
  _token text,
  _name text,
  _signature_svg text,
  _terms boolean
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF _token IS NULL OR length(_token) < 12 THEN
    RAISE EXCEPTION 'Ongeldig token';
  END IF;
  IF _name IS NULL OR length(btrim(_name)) < 2 THEN
    RAISE EXCEPTION 'Naam is verplicht';
  END IF;
  IF _signature_svg IS NULL OR length(_signature_svg) < 10 THEN
    RAISE EXCEPTION 'Handtekening is verplicht';
  END IF;
  IF _terms IS NOT TRUE THEN
    RAISE EXCEPTION 'Akkoord met voorwaarden is verplicht';
  END IF;

  SELECT id INTO _id FROM public.quotes WHERE public_token = _token LIMIT 1;
  IF _id IS NULL THEN RAISE EXCEPTION 'Offerte niet gevonden'; END IF;

  UPDATE public.quotes
     SET accepted_at = now(),
         accepted_by_name = btrim(_name),
         signature_svg = _signature_svg,
         terms_accepted_at = now(),
         status = 'signed'
   WHERE id = _id
     AND accepted_at IS NULL;

  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.accept_quote_by_token(text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_quote_by_token(text, text, text, boolean) TO anon, authenticated;
