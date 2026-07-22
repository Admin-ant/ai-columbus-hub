
CREATE TABLE public.client_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  size_bytes BIGINT,
  description TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX client_documents_client_idx ON public.client_documents(client_id, created_at DESC);
CREATE INDEX client_documents_org_idx ON public.client_documents(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_documents TO authenticated;
GRANT ALL ON public.client_documents TO service_role;

ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read client documents"
  ON public.client_documents FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members insert client documents"
  ON public.client_documents FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members update client documents"
  ON public.client_documents FOR UPDATE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members delete client documents"
  ON public.client_documents FOR DELETE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE TRIGGER update_client_documents_updated_at
  BEFORE UPDATE ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies for client-documents bucket
-- Path convention: <organization_id>/<client_id>/<uuid>-<filename>
CREATE POLICY "Org members read client-documents storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND app_private.has_org_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Org members upload client-documents storage"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND app_private.has_org_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Org members delete client-documents storage"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND app_private.has_org_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
