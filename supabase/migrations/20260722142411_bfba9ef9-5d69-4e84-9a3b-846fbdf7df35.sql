
CREATE TABLE public.client_document_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL,
  document_id UUID,
  document_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('upload','download','delete')),
  actor_id UUID,
  actor_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX client_document_audit_log_client_idx ON public.client_document_audit_log(client_id, created_at DESC);

GRANT SELECT, INSERT ON public.client_document_audit_log TO authenticated;
GRANT ALL ON public.client_document_audit_log TO service_role;

ALTER TABLE public.client_document_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view document audit log"
  ON public.client_document_audit_log FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can insert document audit log"
  ON public.client_document_audit_log FOR INSERT TO authenticated
  WITH CHECK (
    app_private.has_org_access(auth.uid(), organization_id)
    AND actor_id = auth.uid()
  );
