#!/usr/bin/env node
/**
 * Controleert dat sjabloon "Afspraak bevestiging AVC" in de database staat,
 * als HTML is gemarkeerd, alle variabelen bevat en dat het logo meegaat.
 *
 * Draaien: bun run test:appointment-template   (of node scripts/check-appointment-template.mjs)
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const NAME = "Afspraak bevestiging AVC";

const psql = (sql) =>
  execFileSync("psql", ["-tAX", "-F", "|", "-c", sql], { encoding: "utf8" }).trim();

const rows = psql(
  `SELECT count(*), bool_and(is_html), max(length(body))
     FROM public.outreach_message_templates
    WHERE name = '${NAME}' AND channel = 'email'`,
);
const [count, allHtml, bodyLen] = rows.split("|");

const problems = [];
if (count === "0") problems.push("sjabloon staat niet in de database");
if (count !== "0" && allHtml !== "t") problems.push("sjabloon is niet als HTML gemarkeerd");
if (count !== "0" && Number(bodyLen) < 5000) problems.push("sjablooninhoud is te kort (HTML ontbreekt)");

if (count !== "0") {
  const body = psql(
    `SELECT body FROM public.outreach_message_templates WHERE name = '${NAME}' AND channel = 'email' LIMIT 1`,
  );
  for (const token of ["{{contact_name}}", "{{appointment_date}}", "{{appointment_time}}", "{{appointment_link}}"]) {
    if (!body.includes(token)) problems.push(`variabele ${token} ontbreekt`);
  }
  if (!body.includes("<img")) problems.push("logo ontbreekt in de sjabloonhtml");
}

if (problems.length) {
  console.error(`✗ Afspraak-sjabloon controle faalde:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`✓ Sjabloon "${NAME}" staat in de database als HTML (${bodyLen} tekens), met logo en variabelen.`);
