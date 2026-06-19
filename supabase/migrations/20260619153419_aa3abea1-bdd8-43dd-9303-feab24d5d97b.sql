
DO $$ BEGIN
  CREATE TYPE public.quote_event_type AS ENUM ('viewed','signed','paid','invoice_created');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.quote_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type public.quote_event_type NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quote_status_events_quote_idx
  ON public.quote_status_events(quote_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS quote_status_events_org_idx
  ON public.quote_status_events(organization_id, occurred_at DESC);

GRANT SELECT ON public.quote_status_events TO authenticated;
GRANT ALL ON public.quote_status_events TO service_role;

ALTER TABLE public.quote_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view quote events" ON public.quote_status_events;
CREATE POLICY "Org members can view quote events"
  ON public.quote_status_events
  FOR SELECT
  TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));
