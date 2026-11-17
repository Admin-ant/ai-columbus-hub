CREATE OR REPLACE FUNCTION public.resolve_mail_attachments(_ids uuid[])
RETURNS TABLE(id uuid, name text, size bigint, mime text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, storage
AS $$
  SELECT o.id, o.name, COALESCE((o.metadata->>'size')::bigint, 0), o.metadata->>'mimetype'
  FROM storage.objects o
  WHERE o.bucket_id = 'mail-attachments'
    AND o.id = ANY(_ids)
    AND EXISTS (SELECT 1 FROM public.organization_members m
                WHERE m.user_id = auth.uid()
                  AND m.organization_id::text = (storage.foldername(o.name))[1]);
$$;
REVOKE ALL ON FUNCTION public.resolve_mail_attachments(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_mail_attachments(uuid[]) TO authenticated;