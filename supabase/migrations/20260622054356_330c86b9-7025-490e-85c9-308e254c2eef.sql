
CREATE TABLE public.journal_export_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  exported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_size_bytes integer,
  template_theme text,
  exported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_journal_export_log_entry ON public.journal_export_log(journal_entry_id, exported_at DESC);
CREATE INDEX idx_journal_export_log_org ON public.journal_export_log(organization_id, exported_at DESC);

GRANT SELECT, INSERT ON public.journal_export_log TO authenticated;
GRANT ALL ON public.journal_export_log TO service_role;

ALTER TABLE public.journal_export_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read export log"
  ON public.journal_export_log FOR SELECT
  TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "members insert export log"
  ON public.journal_export_log FOR INSERT
  TO authenticated
  WITH CHECK (
    app_private.has_org_access(auth.uid(), organization_id)
    AND exported_by = auth.uid()
  );
