
CREATE TABLE public.call_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  workflow_stage TEXT,
  title TEXT,
  audio_path TEXT,
  audio_mime TEXT,
  duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  transcript TEXT,
  report_markdown TEXT,
  summary TEXT,
  suggested_stage TEXT,
  tasks_created INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_recordings TO authenticated;
GRANT ALL ON public.call_recordings TO service_role;

ALTER TABLE public.call_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org recordings"
ON public.call_recordings FOR SELECT TO authenticated
USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Members can insert recordings"
ON public.call_recordings FOR INSERT TO authenticated
WITH CHECK (app_private.has_org_access(auth.uid(), organization_id) AND auth.uid() = created_by);

CREATE POLICY "Members can update org recordings"
ON public.call_recordings FOR UPDATE TO authenticated
USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Members can delete org recordings"
ON public.call_recordings FOR DELETE TO authenticated
USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE INDEX call_recordings_org_created_idx ON public.call_recordings (organization_id, created_at DESC);
CREATE INDEX call_recordings_lead_idx ON public.call_recordings (lead_id);
CREATE INDEX call_recordings_client_idx ON public.call_recordings (client_id);

CREATE TRIGGER update_call_recordings_updated_at
BEFORE UPDATE ON public.call_recordings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Org members can read call audio"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'call-recordings'
  AND app_private.has_org_access(auth.uid(), (split_part(name, '/', 1))::uuid)
);

CREATE POLICY "Org members can upload call audio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'call-recordings'
  AND app_private.has_org_access(auth.uid(), (split_part(name, '/', 1))::uuid)
);

CREATE POLICY "Org members can delete call audio"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'call-recordings'
  AND app_private.has_org_access(auth.uid(), (split_part(name, '/', 1))::uuid)
);
