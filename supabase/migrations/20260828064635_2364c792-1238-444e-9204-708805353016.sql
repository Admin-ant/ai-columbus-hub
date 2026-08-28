CREATE TABLE public.mollie_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  mollie_payment_id text,
  outcome text NOT NULL CHECK (outcome IN ('accepted','rejected')),
  reason text,
  http_status integer,
  payment_status text,
  amount_cents bigint,
  method text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mollie_webhook_events_created_idx ON public.mollie_webhook_events (created_at DESC);
CREATE INDEX mollie_webhook_events_org_idx ON public.mollie_webhook_events (organization_id, created_at DESC);
CREATE INDEX mollie_webhook_events_invoice_idx ON public.mollie_webhook_events (invoice_id);

GRANT SELECT ON public.mollie_webhook_events TO authenticated;
GRANT ALL ON public.mollie_webhook_events TO service_role;

ALTER TABLE public.mollie_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view mollie webhook events"
  ON public.mollie_webhook_events FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "No client inserts on mollie webhook events"
  ON public.mollie_webhook_events FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "No client updates on mollie webhook events"
  ON public.mollie_webhook_events FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY "No client deletes on mollie webhook events"
  ON public.mollie_webhook_events FOR DELETE TO authenticated USING (false);