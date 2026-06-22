
CREATE TABLE public.project_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  old_status public.project_status,
  new_status public.project_status NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_status_history_project ON public.project_status_history(project_id, changed_at DESC);

GRANT SELECT, INSERT ON public.project_status_history TO authenticated;
GRANT ALL ON public.project_status_history TO service_role;

ALTER TABLE public.project_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view status history of their org projects"
  ON public.project_status_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = project_status_history.organization_id AND m.user_id = auth.uid()));

CREATE POLICY "Members can insert status history for their org"
  ON public.project_status_history FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = project_status_history.organization_id AND m.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.log_project_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.project_status_history(project_id, organization_id, old_status, new_status, changed_by)
    VALUES (NEW.id, NEW.organization_id, NULL, NEW.status, COALESCE(NEW.last_modified_by, NEW.created_by, auth.uid()));
  ELSIF (TG_OP = 'UPDATE') AND (NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.project_status_history(project_id, organization_id, old_status, new_status, changed_by)
    VALUES (NEW.id, NEW.organization_id, OLD.status, NEW.status, COALESCE(NEW.last_modified_by, auth.uid()));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_project_status_change ON public.projects;
CREATE TRIGGER trg_log_project_status_change
AFTER INSERT OR UPDATE OF status ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.log_project_status_change();

-- Seed initial history for existing projects
INSERT INTO public.project_status_history(project_id, organization_id, old_status, new_status, changed_by, changed_at)
SELECT p.id, p.organization_id, NULL, p.status, p.created_by, p.created_at
FROM public.projects p
WHERE NOT EXISTS (SELECT 1 FROM public.project_status_history h WHERE h.project_id = p.id);
