
-- Seed starter Studio templates for AI van Columbus and Netqloud
DO $$
DECLARE
  _aic uuid;
  _nq uuid;
  _sections_aic jsonb := '[
    {"key":"cover","label":"Cover","heading":"Voorstel — AI van Columbus","body":"Slim. Schaalbaar. Op maat. Een AI-aanpak die werkt voor jouw organisatie.","image_url":null},
    {"key":"details","label":"Details","heading":"Offerte details","body":"Offertenummer, datum en geldigheid worden hier samengevat.","image_url":null},
    {"key":"introductie","label":"Introductie","heading":"Welkom aan boord","body":"Bedankt voor je interesse in AI van Columbus. In dit document delen we ons voorstel om jullie processen te versterken met AI.","image_url":null},
    {"key":"voorstel","label":"Het voorstel","heading":"Ons voorstel","body":"Een geïntegreerde AI-oplossing die naadloos meebeweegt met jouw werkwijze: van prompts tot productie.","image_url":null},
    {"key":"plan-van-aanpak","label":"Plan van aanpak","heading":"Plan van aanpak","body":"Fase 1 — Discovery\nFase 2 — Prototype\nFase 3 — Implementatie\nFase 4 — Opschaling","image_url":null},
    {"key":"investering","label":"Investering","heading":"Investering","body":"Kies het pakket dat past bij jullie ambitie. Transparant en zonder verrassingen.","image_url":null},
    {"key":"over-ons","label":"Over ons","heading":"Over AI van Columbus","body":"Wij ontdekken nieuwe werelden met AI — pragmatisch, veilig en menselijk.","image_url":null},
    {"key":"contact","label":"Contact","heading":"Contact","body":"Vragen? Ons team denkt graag mee.","image_url":null},
    {"key":"afsluiter","label":"Afsluiter","heading":"Tot snel","body":"We kijken ernaar uit jullie reis te begeleiden.","image_url":null}
  ]'::jsonb;
  _packages_aic jsonb := '[
    {"id":"aic-start","name":"Verkennen","price_eur":1500,"billing":"eenmalig","features":["AI Discovery workshop","Use-case selectie","Roadmap"],"highlighted":false},
    {"id":"aic-groei","name":"Groeien","price_eur":4500,"billing":"per maand","features":["Custom AI assistant","Integraties","Support 9x5","Maandelijkse optimalisatie"],"highlighted":true},
    {"id":"aic-schaal","name":"Schalen","price_eur":9500,"billing":"per maand","features":["Multi-agent platform","SLA 24/7","Dedicated AI engineer","Custom modellen"],"highlighted":false}
  ]'::jsonb;
  _sections_nq jsonb := '[
    {"key":"cover","label":"Cover","heading":"Voorstel — Netqloud","body":"Cloud-infrastructuur die meebeweegt met je business.","image_url":null},
    {"key":"details","label":"Details","heading":"Offerte details","body":"Offertenummer, datum en geldigheid.","image_url":null},
    {"key":"introductie","label":"Introductie","heading":"Welkom bij Netqloud","body":"In dit voorstel delen we hoe wij jullie cloud-omgeving veilig, snel en kostenefficiënt maken.","image_url":null},
    {"key":"voorstel","label":"Het voorstel","heading":"Ons voorstel","body":"Een managed cloud-aanpak met monitoring, backups en 24/7 support.","image_url":null},
    {"key":"plan-van-aanpak","label":"Plan van aanpak","heading":"Plan van aanpak","body":"Fase 1 — Audit\nFase 2 — Migratie\nFase 3 — Optimalisatie\nFase 4 — Beheer","image_url":null},
    {"key":"investering","label":"Investering","heading":"Investering","body":"Heldere pakketten, voorspelbare kosten.","image_url":null},
    {"key":"over-ons","label":"Over ons","heading":"Over Netqloud","body":"Een team van cloud-engineers met passie voor stabiele platformen.","image_url":null},
    {"key":"contact","label":"Contact","heading":"Contact","body":"Stel gerust je vragen — wij denken mee.","image_url":null},
    {"key":"afsluiter","label":"Afsluiter","heading":"Tot snel","body":"We bouwen graag aan jullie cloud-toekomst.","image_url":null}
  ]'::jsonb;
  _packages_nq jsonb := '[
    {"id":"nq-essential","name":"Essential","price_eur":295,"billing":"per maand","features":["Managed hosting","Daily backups","Monitoring 8x5"],"highlighted":false},
    {"id":"nq-business","name":"Business","price_eur":695,"billing":"per maand","features":["High availability","Backups + DR","Monitoring 24/7","Security patching"],"highlighted":true},
    {"id":"nq-enterprise","name":"Enterprise","price_eur":1495,"billing":"per maand","features":["Multi-region","SLA 99,99%","Dedicated engineer","Compliance reporting"],"highlighted":false}
  ]'::jsonb;
BEGIN
  SELECT id INTO _aic FROM public.organizations WHERE slug = 'ai-columbus' LIMIT 1;
  SELECT id INTO _nq  FROM public.organizations WHERE slug = 'netqloud'    LIMIT 1;

  IF _aic IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.quote_templates WHERE organization_id = _aic AND name = 'AI van Columbus — Starter'
  ) THEN
    INSERT INTO public.quote_templates (organization_id, name, description, theme, sections, packages, is_default)
    VALUES (
      _aic,
      'AI van Columbus — Starter',
      'Demo template met cover, voorstel, plan van aanpak, pakketten en afsluiter.',
      '{"bg":"#0a0a0a","fg":"#ffffff","accent":"#7c5cff"}'::jsonb,
      _sections_aic,
      _packages_aic,
      true
    );
  END IF;

  IF _nq IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.quote_templates WHERE organization_id = _nq AND name = 'Netqloud — Starter'
  ) THEN
    INSERT INTO public.quote_templates (organization_id, name, description, theme, sections, packages, is_default)
    VALUES (
      _nq,
      'Netqloud — Starter',
      'Demo template voor cloud-voorstellen met pakketten Essential/Business/Enterprise.',
      '{"bg":"#0b1020","fg":"#ffffff","accent":"#22d3ee"}'::jsonb,
      _sections_nq,
      _packages_nq,
      true
    );
  END IF;
END $$;
