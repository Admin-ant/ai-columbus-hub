
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS intro_video_url text,
  ADD COLUMN IF NOT EXISTS intro_message text,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_after_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS followup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_followup_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notify_email text,
  ADD COLUMN IF NOT EXISTS client_email text;

-- Update accept_quote_by_token to honour revoked links
CREATE OR REPLACE FUNCTION public.accept_quote_by_token(_token text, _name text, _signature_svg text, _terms boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
  _revoked timestamptz;
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

  SELECT id, revoked_at INTO _id, _revoked FROM public.quotes WHERE public_token = _token LIMIT 1;
  IF _id IS NULL THEN RAISE EXCEPTION 'Offerte niet gevonden'; END IF;
  IF _revoked IS NOT NULL THEN RAISE EXCEPTION 'Deze offertelink is ingetrokken'; END IF;

  UPDATE public.quotes
     SET accepted_at = now(),
         accepted_by_name = btrim(_name),
         signature_svg = _signature_svg,
         terms_accepted_at = now(),
         status = 'signed',
         signed_at = now()
   WHERE id = _id
     AND accepted_at IS NULL;

  RETURN _id;
END $function$;

-- Track view (safe SECURITY DEFINER) called from public page
CREATE OR REPLACE FUNCTION public.track_quote_view(_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.quotes
     SET last_viewed_at = now(),
         view_count = view_count + 1,
         status = CASE WHEN status = 'sent' THEN 'viewed'::quote_status ELSE status END
   WHERE public_token = _token
     AND revoked_at IS NULL
     AND accepted_at IS NULL;
END $function$;

GRANT EXECUTE ON FUNCTION public.track_quote_view(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_quote_by_token(text, text, text, boolean) TO anon, authenticated;
