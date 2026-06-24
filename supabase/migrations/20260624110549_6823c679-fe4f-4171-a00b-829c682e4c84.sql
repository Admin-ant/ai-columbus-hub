
-- Replace blanket UPDATE with column-scoped grant so anon can only set
-- the acceptance fields when signing the shared quote.
REVOKE UPDATE ON public.studio_quotes FROM anon;
GRANT UPDATE (accepted_at, accepted_by_name, accepted_signature)
  ON public.studio_quotes TO anon;
