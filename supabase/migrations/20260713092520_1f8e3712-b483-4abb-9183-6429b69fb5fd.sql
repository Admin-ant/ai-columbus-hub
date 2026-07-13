-- 1) Add preferred payment method column
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS preferred_payment_method text;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_preferred_payment_method_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_preferred_payment_method_check
  CHECK (preferred_payment_method IS NULL OR preferred_payment_method IN
    ('ideal','creditcard','bancontact','paypal','banktransfer','applepay','sofort','klarnapaylater','klarnasliceit'));

-- 2) Create invoice_payment_events table
CREATE TABLE IF NOT EXISTS public.invoice_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  event_type text NOT NULL,
  mollie_payment_id text,
  status text,
  amount_cents bigint,
  method text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.invoice_payment_events TO authenticated;
GRANT ALL ON public.invoice_payment_events TO service_role;

ALTER TABLE public.invoice_payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can read invoice payment events" ON public.invoice_payment_events;
CREATE POLICY "org members can read invoice payment events"
  ON public.invoice_payment_events FOR SELECT
  TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE INDEX IF NOT EXISTS invoice_payment_events_invoice_created_idx
  ON public.invoice_payment_events (invoice_id, created_at DESC);