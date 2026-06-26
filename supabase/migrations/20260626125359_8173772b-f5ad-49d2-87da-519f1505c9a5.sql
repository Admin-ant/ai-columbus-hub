
REVOKE ALL ON FUNCTION public.seed_outreach_default_templates(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_outreach_default_templates(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.trg_seed_outreach_templates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_seed_outreach_templates() TO service_role;
