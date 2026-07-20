
CREATE TABLE public.cron_job_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  processed INT NOT NULL DEFAULT 0,
  sent INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  error TEXT,
  metadata JSONB
);
CREATE INDEX cron_job_runs_job_started_idx ON public.cron_job_runs (job_name, started_at DESC);
GRANT SELECT ON public.cron_job_runs TO authenticated;
GRANT ALL ON public.cron_job_runs TO service_role;
ALTER TABLE public.cron_job_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read cron runs" ON public.cron_job_runs FOR SELECT TO authenticated USING (true);
