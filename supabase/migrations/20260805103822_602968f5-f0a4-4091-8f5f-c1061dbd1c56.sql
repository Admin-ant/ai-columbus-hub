ALTER TABLE public.announcement_reads
  ADD COLUMN IF NOT EXISTS starred boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Users manage own announcement reads" ON public.announcement_reads;
CREATE POLICY "Users manage own announcement reads"
ON public.announcement_reads FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcement_reads TO authenticated;
GRANT ALL ON public.announcement_reads TO service_role;