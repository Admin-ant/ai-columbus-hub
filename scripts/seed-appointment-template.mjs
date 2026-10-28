#!/usr/bin/env bun
/**
 * Genereert de migratie die sjabloon "Afspraak bevestiging AVC" in de database zet.
 *
 *   bun run scripts/seed-appointment-template.mjs
 *
 * Leest de HTML uit src/lib/appointment-mail-template.ts (dus altijd synchroon met
 * het ontwerp) en schrijft drizzle/migrations/0009_appointment_avc_template.sql.
 * De SQL zelf wordt daarna via de database-laag toegepast.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { renderAppointmentMail } from "@/lib/appointment-email-template";

const ORG_ID = "d30d790a-7167-4ede-94b4-ad6b7d408a8a"; // AI van Columbus BV
const OUT = resolve("drizzle/migrations/0009_appointment_avc_template.sql");

const html = renderAppointmentMail({
  heading: "Je afspraak is bevestigd",
  firstName: "{{contact_name}}",
  intro:
    "Dank je wel voor het fijne gesprek. Hierbij bevestig ik onze afspraak. Ik kijk ernaar uit!",
  dateStr: "{{appointment_date}}",
  dateUrl: "{{appointment_date}}",
  timeStr: "{{appointment_time}} uur",
  location: "{{appointment_location}}",
  subject: "{{appointment_title}}",
  agendaLink: "{{appointment_link}}",
  agendaPoints: [],
  confirmUrl: null,
  cancelled: false,
});

if (!html.includes("<img") || !html.includes("{{contact_name}}")) {
  console.error("✗ Gegenereerde HTML mist het logo of de variabelen");
  process.exit(1);
}

const TAG = "$avc$";
if (html.includes(TAG)) {
  console.error("✗ HTML bevat de dollar-quote-markering; kies een andere tag");
  process.exit(1);
}

const NAME = "Afspraak bevestiging AVC";
const SUBJECT = "Afspraak {{appointment_title}} — {{appointment_date}}";
const DESCRIPTION =
  "Afspraakbevestiging in AI van Columbus-huisstijl: logo op zwarte balk, agendaknop en opties om te verzetten.";

const sql = `-- Sjabloon "Afspraak bevestiging AVC": huisstijl-mail als bewerkbaar e-mailsjabloon.
-- Wordt gegenereerd door scripts/seed-appointment-template.mjs (niet handmatig aanpassen).
ALTER TABLE public.mail_settings ADD COLUMN IF NOT EXISTS appointment_template_id uuid;
COMMENT ON COLUMN public.mail_settings.appointment_template_id IS 'Sjabloon dat de afspraakbevestiging als HTML verstuurt; leeg = standaardontwerp van de app.';

DO $avcdoc$
BEGIN
  EXECUTE $avc$UPDATE public.outreach_message_templates
     SET subject = '${SUBJECT}',
         body = ${TAG}${html}${TAG},
         is_html = true,
         description = '${DESCRIPTION}',
         channel = 'email',
         updated_at = now()
   WHERE organization_id = '${ORG_ID}'::uuid
     AND name = '${NAME}'$avc$;

  IF NOT FOUND THEN
    EXECUTE $avc$INSERT INTO public.outreach_message_templates
        (organization_id, name, description, channel, subject, body, is_default, is_html)
        VALUES ('${ORG_ID}'::uuid, '${NAME}', '${DESCRIPTION}', 'email', '${SUBJECT}',
                ${TAG}${html}${TAG}, false, true)$avc$;
  END IF;
END
$avcdoc$;

-- Alleen voor AI van Columbus: dit sjabloon voortaan voor afspraakbevestigingen gebruiken.
UPDATE public.mail_settings
   SET appointment_template_id = (
         SELECT id FROM public.outreach_message_templates
          WHERE organization_id = '${ORG_ID}'::uuid AND name = '${NAME}'
       )
 WHERE organization_id = '${ORG_ID}'::uuid;
`;

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, sql, "utf8");
console.log(`✓ ${OUT} geschreven (${sql.length} tekens)`);
