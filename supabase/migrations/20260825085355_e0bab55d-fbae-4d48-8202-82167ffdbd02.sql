CREATE POLICY telnyx_messages_insert_org ON public.telnyx_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    direction = 'outbound'
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = telnyx_messages.organization_id
        AND m.user_id = auth.uid()
    )
  );