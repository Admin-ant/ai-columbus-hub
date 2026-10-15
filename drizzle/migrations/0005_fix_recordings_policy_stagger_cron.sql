-- Zonder UPDATE-policy is wijzigen al geweigerd; de expliciete "false"-policy is overbodig.
DROP POLICY IF EXISTS "call-recordings are immutable" ON storage.objects;

-- Spreid zware cron-hooks zodat ze niet tegelijk workers opstarten.
SELECT cron.alter_job(jobid, schedule := '3,18,33,48 * * * *') FROM cron.job WHERE jobname = 'outreach-sequence-runner';
SELECT cron.alter_job(jobid, schedule := '10,25,40,55 * * * *') FROM cron.job WHERE jobname = 'campaign-flow-tick';
SELECT cron.alter_job(jobid, schedule := '1-59/5 * * * *') FROM cron.job WHERE jobname = 'announcement-notify';
SELECT cron.alter_job(jobid, schedule := '37 */6 * * *') FROM cron.job WHERE jobname = 'quote-followups-every-6h';
SELECT cron.alter_job(jobid, schedule := '12 9 * * *') FROM cron.job WHERE jobname = 'studio-followups-daily';
SELECT cron.alter_job(jobid, schedule := '22 7 * * 1') FROM cron.job WHERE jobname = 'announcement-digest-weekly';