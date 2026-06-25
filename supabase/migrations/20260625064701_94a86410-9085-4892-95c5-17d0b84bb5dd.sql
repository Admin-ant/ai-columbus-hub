DROP POLICY IF EXISTS "Public can view quote via token" ON public.quotes;
DROP POLICY IF EXISTS "Public can view shared studio quotes" ON public.studio_quotes;
REVOKE SELECT ON public.quotes FROM anon;
REVOKE SELECT ON public.studio_quotes FROM anon;