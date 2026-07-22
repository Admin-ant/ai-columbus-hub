
ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS client_documents_tags_gin ON public.client_documents USING GIN (tags);
