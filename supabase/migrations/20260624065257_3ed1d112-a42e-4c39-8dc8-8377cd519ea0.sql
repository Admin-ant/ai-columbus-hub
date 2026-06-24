
CREATE TABLE public.expense_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expense_attachments_expense_idx ON public.expense_attachments(expense_id);
CREATE INDEX expense_attachments_org_idx ON public.expense_attachments(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_attachments TO authenticated;
GRANT ALL ON public.expense_attachments TO service_role;

ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read attachments"
  ON public.expense_attachments FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members insert attachments"
  ON public.expense_attachments FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members update attachments"
  ON public.expense_attachments FOR UPDATE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members delete attachments"
  ON public.expense_attachments FOR DELETE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

-- Storage policies for bucket 'expense-attachments'
-- Path convention: {organization_id}/{expense_id}/{filename}
CREATE POLICY "Org members read expense files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-attachments'
    AND app_private.has_org_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Org members upload expense files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-attachments'
    AND app_private.has_org_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Org members delete expense files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-attachments'
    AND app_private.has_org_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
