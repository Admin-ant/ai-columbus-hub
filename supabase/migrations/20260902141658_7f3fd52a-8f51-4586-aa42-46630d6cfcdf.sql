-- Allow org members to update their organisation's messages (needed to link messages to a client)
GRANT UPDATE ON public.telnyx_messages TO authenticated;
DROP POLICY IF EXISTS telnyx_messages_update_org ON public.telnyx_messages;
CREATE POLICY telnyx_messages_update_org ON public.telnyx_messages
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = telnyx_messages.organization_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = telnyx_messages.organization_id AND m.user_id = auth.uid()));

-- Allow org members to write audit entries for their own organisation
GRANT INSERT ON public.messaging_link_audit TO authenticated;
DROP POLICY IF EXISTS "org members insert messaging link audit" ON public.messaging_link_audit;
CREATE POLICY "org members insert messaging link audit" ON public.messaging_link_audit
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id) AND actor_id = auth.uid());