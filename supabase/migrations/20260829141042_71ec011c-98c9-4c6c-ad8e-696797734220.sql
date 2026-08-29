CREATE POLICY "Org members can view unassigned webhook events"
ON public.mollie_webhook_events
FOR SELECT
TO authenticated
USING (
  organization_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_members m WHERE m.user_id = auth.uid()
  )
);