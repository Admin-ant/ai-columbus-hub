
ALTER POLICY "client_contacts_select_members" ON public.client_contacts TO authenticated;
ALTER POLICY "ccal_select_members" ON public.client_contact_audit_log TO authenticated;
