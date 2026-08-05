ALTER TABLE public.announcements REPLICA IDENTITY FULL;
ALTER TABLE public.announcement_reads REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'announcement_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.announcement_reads;
  END IF;
END $$;