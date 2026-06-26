
CREATE POLICY "mail_attach_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'mail-attachments'
  AND EXISTS (SELECT 1 FROM public.organization_members m
              WHERE m.user_id = auth.uid()
                AND m.organization_id::text = (storage.foldername(name))[1])
);

CREATE POLICY "mail_attach_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'mail-attachments'
  AND EXISTS (SELECT 1 FROM public.organization_members m
              WHERE m.user_id = auth.uid()
                AND m.organization_id::text = (storage.foldername(name))[1])
);

CREATE POLICY "mail_attach_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'mail-attachments'
  AND EXISTS (SELECT 1 FROM public.organization_members m
              WHERE m.user_id = auth.uid()
                AND m.organization_id::text = (storage.foldername(name))[1])
);
