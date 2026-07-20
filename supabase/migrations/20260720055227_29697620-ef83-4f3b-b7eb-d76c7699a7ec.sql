GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_backgrounds TO authenticated;
GRANT ALL ON public.mail_backgrounds TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_background_versions TO authenticated;
GRANT ALL ON public.mail_background_versions TO service_role;