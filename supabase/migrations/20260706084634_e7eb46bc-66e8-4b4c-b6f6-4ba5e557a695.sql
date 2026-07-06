
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS pdf_filename text,
  ADD COLUMN IF NOT EXISTS last_emailed_at timestamptz;

-- Email log
CREATE TABLE IF NOT EXISTS public.invoice_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  cc_emails text[] NOT NULL DEFAULT '{}',
  subject text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  mail_message_id uuid,
  provider_message_id text,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_email_log TO authenticated;
GRANT ALL ON public.invoice_email_log TO service_role;

ALTER TABLE public.invoice_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read invoice_email_log"
  ON public.invoice_email_log FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "org members write invoice_email_log"
  ON public.invoice_email_log FOR ALL TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE INDEX IF NOT EXISTS invoice_email_log_invoice_idx ON public.invoice_email_log(invoice_id, created_at DESC);

-- Attachments
CREATE TABLE IF NOT EXISTS public.invoice_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_attachments TO authenticated;
GRANT ALL ON public.invoice_attachments TO service_role;

ALTER TABLE public.invoice_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read invoice_attachments"
  ON public.invoice_attachments FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "org members write invoice_attachments"
  ON public.invoice_attachments FOR ALL TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE INDEX IF NOT EXISTS invoice_attachments_invoice_idx ON public.invoice_attachments(invoice_id, created_at DESC);

-- Storage policies on invoice-attachments bucket.
-- Path convention: <organization_id>/<invoice_id>/<uuid>-<filename>
CREATE POLICY "org members read invoice-attachments objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-attachments'
    AND app_private.has_org_access(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "org members insert invoice-attachments objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-attachments'
    AND app_private.has_org_access(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "org members update invoice-attachments objects"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'invoice-attachments'
    AND app_private.has_org_access(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "org members delete invoice-attachments objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoice-attachments'
    AND app_private.has_org_access(auth.uid(), (split_part(name, '/', 1))::uuid)
  );
