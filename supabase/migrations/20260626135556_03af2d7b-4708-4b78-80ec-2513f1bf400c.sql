
CREATE OR REPLACE FUNCTION public.snapshot_outreach_template_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _next int;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.name IS NOT DISTINCT FROM OLD.name
       AND NEW.description IS NOT DISTINCT FROM OLD.description
       AND NEW.subject IS NOT DISTINCT FROM OLD.subject
       AND NEW.body IS NOT DISTINCT FROM OLD.body THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO _next
  FROM public.outreach_template_versions WHERE template_id = NEW.id;

  INSERT INTO public.outreach_template_versions
    (template_id, organization_id, version, name, description, subject, body, created_by)
  VALUES
    (NEW.id, NEW.organization_id, _next, NEW.name, NEW.description, NEW.subject, NEW.body, auth.uid());

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.snapshot_outreach_template_version() FROM PUBLIC, anon, authenticated;
