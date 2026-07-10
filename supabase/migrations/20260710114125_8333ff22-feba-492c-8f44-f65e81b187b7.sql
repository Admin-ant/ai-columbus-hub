-- Rules table
CREATE TABLE public.call_recorder_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  action_kind TEXT NOT NULL CHECK (action_kind IN ('create_task','set_stage')),
  task_title TEXT,
  task_body TEXT,
  task_due_days INTEGER NOT NULL DEFAULT 3,
  target_stage TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_recorder_rules TO authenticated;
GRANT ALL ON public.call_recorder_rules TO service_role;

ALTER TABLE public.call_recorder_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read rules" ON public.call_recorder_rules
  FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "org members can insert rules" ON public.call_recorder_rules
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "org members can update rules" ON public.call_recorder_rules
  FOR UPDATE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "org members can delete rules" ON public.call_recorder_rules
  FOR DELETE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE TRIGGER trg_call_recorder_rules_updated_at
  BEFORE UPDATE ON public.call_recorder_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend call_recordings
ALTER TABLE public.call_recordings
  ADD COLUMN IF NOT EXISTS pending_tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_transcript TEXT,
  ADD COLUMN IF NOT EXISTS progress_stage TEXT;
