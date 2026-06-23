-- Link projects to clients
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects(client_id);

-- Best-effort backfill: match by exact (case-insensitive) name within the same organization
UPDATE public.projects p
SET client_id = c.id
FROM public.clients c
WHERE p.client_id IS NULL
  AND p.organization_id = c.organization_id
  AND lower(trim(p.name)) = lower(trim(c.name));
