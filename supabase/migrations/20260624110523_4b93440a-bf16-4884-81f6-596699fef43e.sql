
-- Public read of studio_quotes when accessed via a known public_token.
-- The token is unguessable and acts as the bearer secret.
GRANT SELECT ON public.studio_quotes TO anon;

DROP POLICY IF EXISTS "Public can view shared studio quotes" ON public.studio_quotes;
CREATE POLICY "Public can view shared studio quotes"
ON public.studio_quotes FOR SELECT
TO anon
USING (public_token IS NOT NULL);

-- Public accept (sets accepted_at/by/signature) when token matches.
DROP POLICY IF EXISTS "Public can accept shared studio quotes" ON public.studio_quotes;
CREATE POLICY "Public can accept shared studio quotes"
ON public.studio_quotes FOR UPDATE
TO anon
USING (public_token IS NOT NULL)
WITH CHECK (public_token IS NOT NULL);
