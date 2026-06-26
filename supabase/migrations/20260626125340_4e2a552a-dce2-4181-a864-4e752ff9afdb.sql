
-- 1) outreach_message_templates table
CREATE TABLE public.outreach_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','linkedin','whatsapp')),
  subject text,
  body text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_message_templates TO authenticated;
GRANT ALL ON public.outreach_message_templates TO service_role;

ALTER TABLE public.outreach_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members view outreach templates"
  ON public.outreach_message_templates FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "org members insert outreach templates"
  ON public.outreach_message_templates FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "org members update outreach templates"
  ON public.outreach_message_templates FOR UPDATE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "org members delete outreach templates"
  ON public.outreach_message_templates FOR DELETE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE INDEX outreach_msg_templates_org_idx
  ON public.outreach_message_templates(organization_id, channel);

CREATE TRIGGER update_outreach_msg_templates_updated_at
  BEFORE UPDATE ON public.outreach_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) New columns
ALTER TABLE public.outreach_targets
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS demo_type text CHECK (demo_type IN ('online','onsite')),
  ADD COLUMN IF NOT EXISTS demo_at timestamptz;

ALTER TABLE public.outreach_campaigns
  ADD COLUMN IF NOT EXISTS province text;

-- 3) Seed default templates function + trigger on org insert + backfill
CREATE OR REPLACE FUNCTION public.seed_outreach_default_templates(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.outreach_message_templates
    WHERE organization_id = p_org_id AND is_default = true
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.outreach_message_templates
    (organization_id, name, channel, subject, body, is_default)
  VALUES
    (
      p_org_id,
      'Recruitment — Email (provincie)',
      'email',
      'Halveer de screeningstijd voor {{company}} in {{province}} 🚀',
      E'Beste {{contact_name}},\n\nTerwijl de druk op de uitzendmarkt in {{province}} toeneemt, zijn consultants wekelijks uren kwijt aan het handmatig doorspitten van cv-databases.\n\nOnze AI-recruitment software lost dit op. De tool screent, matcht en rangschikt kandidaten volautomatisch binnen enkele seconden op basis van de exacte vacature-eisen.\n\nJe kunt de technologie direct testen via ons Stingry Dashboard: ondigitalocean.app\n\nIk heb een op maat gemaakte digitale offerte klaargezet om te laten zien hoe we dit voor jullie kunnen inrichten. Mag ik je deze vrijblijvend toesturen, of zullen we deze week 10 minuten bellen?\n\nMet vriendelijke groet,\n{{sender_name}}',
      true
    ),
    (
      p_org_id,
      'Recruitment — LinkedIn (provincie)',
      'linkedin',
      NULL,
      E'Beste {{contact_name}},\n\nIk zie dat jullie met {{company}} sterk vertegenwoordigd zijn in de {{province}} recruitmentmarkt. Als directeur weet je als geen ander hoeveel tijd je consultants kwijt zijn aan het handmatig screenen van cv''s.\n\nMet onze AI-Recruiter automatiseren we dit proces en halveren we de ''Time-to-Hire''. Je kunt dit gratis testen met 10 van jullie eigen cv''s via ons Stingry Dashboard: ondigitalocean.app\n\nSparren we hier deze week 10 minuutjes over?\n\nGroet,\n{{sender_name}}',
      true
    ),
    (
      p_org_id,
      'Recruitment — WhatsApp opvolging',
      'whatsapp',
      NULL,
      E'Hi {{contact_name}}, {{sender_name}} hier. Zoals net besproken aan de telefoon, is hier de directe link naar ons platform om het gratis te testen: ondigitalocean.app. Succes! 👍',
      true
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_outreach_default_templates(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_seed_outreach_templates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_outreach_default_templates(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_seed_outreach_templates ON public.organizations;
CREATE TRIGGER organizations_seed_outreach_templates
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_outreach_templates();

-- Backfill existing orgs
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_outreach_default_templates(r.id);
  END LOOP;
END $$;
