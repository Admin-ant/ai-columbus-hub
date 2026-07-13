
-- 1. Enum voor delivery status
CREATE TYPE public.project_delivery_status AS ENUM (
  'nieuw',
  'in_uitvoering',
  'wacht_op_klant',
  'on_hold',
  'opgeleverd',
  'geannuleerd'
);

-- 2. Kolom toevoegen aan projects
ALTER TABLE public.projects
  ADD COLUMN delivery_status public.project_delivery_status NOT NULL DEFAULT 'nieuw';

-- 3. Bestaande data migreren
UPDATE public.projects SET delivery_status = 'on_hold' WHERE status = 'on_hold';
UPDATE public.projects SET delivery_status = 'nieuw' WHERE status = 'contract_getekend';

-- 4. Historietabel voor delivery status
CREATE TABLE public.project_delivery_status_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  old_status public.project_delivery_status,
  new_status public.project_delivery_status NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.project_delivery_status_history TO authenticated;
GRANT ALL ON public.project_delivery_status_history TO service_role;

ALTER TABLE public.project_delivery_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view delivery history for their org"
  ON public.project_delivery_status_history
  FOR SELECT
  TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Members can insert delivery history for their org"
  ON public.project_delivery_status_history
  FOR INSERT
  TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE INDEX idx_pdsh_project ON public.project_delivery_status_history(project_id, changed_at DESC);

-- 5. Trigger om wijzigingen te loggen
CREATE OR REPLACE FUNCTION public.log_project_delivery_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.project_delivery_status_history(project_id, organization_id, old_status, new_status, changed_by)
    VALUES (NEW.id, NEW.organization_id, NULL, NEW.delivery_status, COALESCE(NEW.last_modified_by, NEW.created_by, auth.uid()));
  ELSIF (TG_OP = 'UPDATE') AND (NEW.delivery_status IS DISTINCT FROM OLD.delivery_status) THEN
    INSERT INTO public.project_delivery_status_history(project_id, organization_id, old_status, new_status, changed_by)
    VALUES (NEW.id, NEW.organization_id, OLD.delivery_status, NEW.delivery_status, COALESCE(NEW.last_modified_by, auth.uid()));
  END IF;
  RETURN NEW;
END $function$;

CREATE TRIGGER trg_log_project_delivery_status_change
AFTER INSERT OR UPDATE OF delivery_status ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.log_project_delivery_status_change();
