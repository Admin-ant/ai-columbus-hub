
-- 1. External source columns on core tables
ALTER TABLE public.clients   ADD COLUMN IF NOT EXISTS external_source text, ADD COLUMN IF NOT EXISTS external_id text, ADD COLUMN IF NOT EXISTS external_url text;
ALTER TABLE public.invoices  ADD COLUMN IF NOT EXISTS external_source text, ADD COLUMN IF NOT EXISTS external_id text, ADD COLUMN IF NOT EXISTS external_url text;
ALTER TABLE public.quotes    ADD COLUMN IF NOT EXISTS external_source text, ADD COLUMN IF NOT EXISTS external_id text, ADD COLUMN IF NOT EXISTS external_url text;
ALTER TABLE public.leads     ADD COLUMN IF NOT EXISTS external_source text, ADD COLUMN IF NOT EXISTS external_id text, ADD COLUMN IF NOT EXISTS external_url text;

CREATE UNIQUE INDEX IF NOT EXISTS clients_external_uidx  ON public.clients  (organization_id, external_source, external_id) WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_external_uidx ON public.invoices (organization_id, external_source, external_id) WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS quotes_external_uidx   ON public.quotes   (organization_id, external_source, external_id) WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS leads_external_uidx    ON public.leads    (organization_id, external_source, external_id) WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

-- 2. Audit log for inbound events
CREATE TABLE IF NOT EXISTS public.integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  source text NOT NULL,
  event  text NOT NULL,
  external_id text,
  status text NOT NULL DEFAULT 'received',
  error_message text,
  payload jsonb NOT NULL,
  result jsonb,
  created_invoice_id uuid,
  created_quote_id uuid,
  created_client_id uuid,
  created_lead_id uuid,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_events_org_idx    ON public.integration_events (organization_id, received_at DESC);
CREATE INDEX IF NOT EXISTS integration_events_source_idx ON public.integration_events (source, received_at DESC);

GRANT SELECT ON public.integration_events TO authenticated;
GRANT ALL    ON public.integration_events TO service_role;

ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own org integration events"
  ON public.integration_events FOR SELECT
  TO authenticated
  USING (
    organization_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = integration_events.organization_id
        AND m.user_id = auth.uid()
    )
  );
