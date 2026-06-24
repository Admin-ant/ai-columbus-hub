ALTER TABLE public.quote_comments
  DROP CONSTRAINT IF EXISTS quote_comments_quote_id_fkey;

ALTER TABLE public.quote_comments
  ADD CONSTRAINT quote_comments_quote_id_fkey
  FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE CASCADE;