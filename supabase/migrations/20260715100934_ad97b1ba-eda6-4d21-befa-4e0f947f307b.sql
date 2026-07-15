
-- Add status/result/error tracking to campaign flow tasks + audit trail
ALTER TABLE public.campaign_flow_tasks
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS result text,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

-- Backfill status for existing rows based on done flag
UPDATE public.campaign_flow_tasks
   SET status = CASE WHEN done THEN 'done' ELSE 'pending' END
 WHERE status = 'pending' AND done = true;

-- Add CHECK-like enforcement via trigger to keep values sane (avoid CHECK for future flexibility)
CREATE OR REPLACE FUNCTION public.validate_campaign_task_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('pending','in_progress','done','failed','cancelled') THEN
    RAISE EXCEPTION 'Ongeldige taak status: %', NEW.status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_campaign_task_status ON public.campaign_flow_tasks;
CREATE TRIGGER trg_validate_campaign_task_status
BEFORE INSERT OR UPDATE ON public.campaign_flow_tasks
FOR EACH ROW EXECUTE FUNCTION public.validate_campaign_task_status();

-- Event log table
CREATE TABLE IF NOT EXISTS public.campaign_flow_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.campaign_flow_tasks(id) ON DELETE CASCADE,
  user_id uuid,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  message text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.campaign_flow_task_events TO authenticated;
GRANT ALL ON public.campaign_flow_task_events TO service_role;

ALTER TABLE public.campaign_flow_task_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners kunnen taak events zien"
ON public.campaign_flow_task_events FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.campaign_flow_tasks t
    WHERE t.id = campaign_flow_task_events.task_id
      AND t.user_id = auth.uid()
  )
);

CREATE POLICY "Owners kunnen taak events aanmaken"
ON public.campaign_flow_task_events FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.campaign_flow_tasks t
    WHERE t.id = campaign_flow_task_events.task_id
      AND t.user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS idx_campaign_flow_task_events_task
  ON public.campaign_flow_task_events(task_id, created_at DESC);

-- Auto-log lifecycle: insert = 'created', update of status = 'status_changed'
CREATE OR REPLACE FUNCTION public.log_campaign_task_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.campaign_flow_task_events(task_id, user_id, event_type, to_status, message)
    VALUES (NEW.id, NEW.user_id, 'created', NEW.status, NEW.reason);
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.campaign_flow_task_events(task_id, user_id, event_type, from_status, to_status, message)
    VALUES (NEW.id, NEW.user_id, 'status_changed', OLD.status, NEW.status,
            CASE
              WHEN NEW.status = 'failed' THEN NEW.error
              WHEN NEW.status = 'done' THEN NEW.result
              ELSE NULL
            END);
  ELSIF NEW.result IS DISTINCT FROM OLD.result OR NEW.error IS DISTINCT FROM OLD.error THEN
    INSERT INTO public.campaign_flow_task_events(task_id, user_id, event_type, to_status, message)
    VALUES (NEW.id, NEW.user_id, 'note', NEW.status, COALESCE(NEW.error, NEW.result));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_campaign_task_event ON public.campaign_flow_tasks;
CREATE TRIGGER trg_log_campaign_task_event
AFTER INSERT OR UPDATE ON public.campaign_flow_tasks
FOR EACH ROW EXECUTE FUNCTION public.log_campaign_task_event();
