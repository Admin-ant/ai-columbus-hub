
CREATE TABLE public.mail_background_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  background_id uuid NOT NULL REFERENCES public.mail_backgrounds(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  version int NOT NULL,
  name text NOT NULL,
  background_color text,
  background_image_url text,
  header_html text,
  footer_html text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (background_id, version)
);

GRANT SELECT, INSERT ON public.mail_background_versions TO authenticated;
GRANT ALL ON public.mail_background_versions TO service_role;

ALTER TABLE public.mail_background_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read skin versions"
  ON public.mail_background_versions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = mail_background_versions.organization_id
      AND m.user_id = auth.uid()
  ));

CREATE POLICY "Org members can insert skin versions"
  ON public.mail_background_versions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = mail_background_versions.organization_id
      AND m.user_id = auth.uid()
  ));

CREATE INDEX mail_background_versions_bg_idx
  ON public.mail_background_versions (background_id, version DESC);

CREATE OR REPLACE FUNCTION public.snapshot_mail_background_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _next int;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.name IS NOT DISTINCT FROM OLD.name
       AND NEW.background_color IS NOT DISTINCT FROM OLD.background_color
       AND NEW.background_image_url IS NOT DISTINCT FROM OLD.background_image_url
       AND NEW.header_html IS NOT DISTINCT FROM OLD.header_html
       AND NEW.footer_html IS NOT DISTINCT FROM OLD.footer_html THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO _next
    FROM public.mail_background_versions WHERE background_id = NEW.id;

  INSERT INTO public.mail_background_versions
    (background_id, organization_id, version, name, background_color, background_image_url, header_html, footer_html, created_by)
  VALUES
    (NEW.id, NEW.organization_id, _next, NEW.name, NEW.background_color, NEW.background_image_url, NEW.header_html, NEW.footer_html, auth.uid());

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS mail_background_snapshot ON public.mail_backgrounds;
CREATE TRIGGER mail_background_snapshot
  AFTER INSERT OR UPDATE ON public.mail_backgrounds
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_mail_background_version();

-- Seed initiële versie voor bestaande skins
INSERT INTO public.mail_background_versions
  (background_id, organization_id, version, name, background_color, background_image_url, header_html, footer_html)
SELECT id, organization_id, 1, name, background_color, background_image_url, header_html, footer_html
FROM public.mail_backgrounds
WHERE NOT EXISTS (
  SELECT 1 FROM public.mail_background_versions v WHERE v.background_id = mail_backgrounds.id
);
