DROP POLICY IF EXISTS "Authenticated read cron job runs" ON public.cron_job_runs;
DROP POLICY IF EXISTS "cron_job_runs_read" ON public.cron_job_runs;
DROP POLICY IF EXISTS "Anyone authenticated can read cron_job_runs" ON public.cron_job_runs;
CREATE POLICY "Admins can read cron job runs" ON public.cron_job_runs FOR SELECT TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::app_role));