# Volledig uitvoeringsplan

Dit is veel werk (15+ grote features). Ik splits het in **4 rondes** zodat elke ronde getest en gereviewd kan worden voor we doorgaan. Na jouw "ga" pak ik Ronde 1 op; daarna meld ik me terug en starten we de volgende.

---

## Ronde 1 — Offerte-flow afmaken

1. **Statusbadge + datum in admin-quoteslijst** — kleur per status (concept/verzonden/bekeken/ondertekend/verlopen) + relatieve datum.
2. **PDF-download ondertekende offerte** — server function rendert HTML→PDF met handtekening-SVG, naam, akkoord-timestamp, voorwaarden.
3. **E-mailnotificatie bij ondertekening** — via Lovable Emails (app emails), template met bevestiging + downloadlink.
4. **Link vernieuwen / intrekken** — `revoked_at` veld + acties in admin; publieke pagina toont "ingetrokken" status.
5. **Follow-up mails na X dagen** — `quote_followups` config per offerte (dagen + aan/uit), pg_cron job die `/api/public/hooks/quote-followups` triggert, mail bij niet-bekeken/niet-ondertekend, log in `email_send_log`.
6. **Video-intro publieke offerte** — `intro_video_url` veld (Loom/YouTube/MP4 embed) bovenaan `accept.quote.$token`.

## Ronde 1 — Offerte-flow afmaken ✅

Klaar (zie eerdere commit): statusbadge+datum, PDF-download, e-mailnotificatie bij ondertekening, link vernieuwen/intrekken, follow-up mails, video-intro.

## Ronde 2 — Betalen + CRM-samenwerking

7. **iDEAL via Stripe** — wacht op jouw bevestiging om Stripe Payments te activeren.
8. **CRM-activiteiten pagina** ✅ — `/crm/activities` met kanban (Te laat / Vandaag / Komend / Geen datum / Afgerond) + lijstweergave, filters op type/status, CRUD-dialog.
9. **Team comments + @mentions** ✅ — opmerkingen-dialog op elke offerte (acties-menu → "Team-opmerkingen"), `@naam` autocomplete uit org-leden, e-mailnotificatie naar genoemde collega's via Resend, opgelost-markeren.

## Ronde 3 — Enterprise & analytics

10. **RBAC `/enterprise`** — `_authenticated/enterprise` layout met `has_role('admin'|'enterprise')` gate, redirect anders.
11. **Forecast dashboard** — per team & maand op basis van deal-stage × waarschijnlijkheid, grafiek + tabel + CSV-export.
12. **Win/Loss AI formulier + log** — formulier (deal, uitkomst, ruwe notities), Lovable AI vat reden samen, opslag in `win_loss_log`, trends-overzicht.
13. **Heatmap per offerte** — `quote_section_views` (sectie-id + dwell time via IntersectionObserver), admin-view rendert kleurschaal per sectie.

## Ronde 4 — Platform-features

14. **Templates marketplace** — `marketplace_templates` (AI prompts + outreach sequences), org-scoped private + workspace-shared, kopieer-naar-mijn-org actie.
15. **White-label** — `organizations.branding` (logo, kleuren, custom subdomein), middleware detecteert host → laadt branding, publieke offerte/portal respecteren.
16. **Resend outreach-integratie** — connector via gateway, send vanuit sequences, log per campaign + prospect in `outreach_messages` met provider message-id, bounce/complaint webhook.

---

## Belangrijke beslissingen die ik nu voor je maak (zeg het als je liever anders wil)

- **iDEAL provider**: **Stripe built-in** (geen eigen account/keys nodig, snelste). Mollie zou een eigen API key vereisen.
- **Follow-up timing default**: **3 dagen** na verzenden als niet bekeken, **7 dagen** als bekeken maar niet ondertekend. Per offerte aanpasbaar.
- **PDF-rendering**: server function met `@react-pdf/renderer` (werkt in Workers).
- **Video-intro**: ondersteunt Loom/YouTube/Vimeo embed-URL + directe MP4. Geen upload-flow deze ronde.
- **Mentions notificatie**: in-app badge + e-mail (geen push).
- **White-label subdomein**: `*.jouwdomein.nl` patroon; root-domein blijft platform. DNS-instructies krijg je per organisatie.

## Wat ik buiten scope houd

- Marketing/bulk mails (verboden volgens email-richtlijnen — alleen transactioneel).
- De externe DigitalOcean-link die je deelde — geen actie tenzij je zegt wat je daarmee wil.
- Native mobile / app stores.

## Bevestiging

Reageer met **"ga"** dan start ik Ronde 1. Of noem een ronde/feature die je eerst wil.
