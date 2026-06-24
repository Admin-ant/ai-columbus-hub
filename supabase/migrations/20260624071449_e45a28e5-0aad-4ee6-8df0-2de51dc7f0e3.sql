
CREATE TABLE public.expense_attachment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  attachment_id uuid,
  action text NOT NULL CHECK (action IN ('uploaded','replaced','deleted')),
  file_name text,
  storage_path text,
  previous_file_name text,
  previous_storage_path text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX expense_attachment_audit_expense_idx ON public.expense_attachment_audit(expense_id, created_at DESC);

GRANT SELECT, INSERT ON public.expense_attachment_audit TO authenticated;
GRANT ALL ON public.expense_attachment_audit TO service_role;

ALTER TABLE public.expense_attachment_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view attachment audit"
  ON public.expense_attachment_audit FOR SELECT
  TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can insert attachment audit"
  ON public.expense_attachment_audit FOR INSERT
  TO authenticated
  WITH CHECK (
    app_private.has_org_access(auth.uid(), organization_id)
    AND actor_id = auth.uid()
  );
