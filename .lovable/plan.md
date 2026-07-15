# Plan: Centrale template-hub met flow-overzicht, drag & drop editor en import tussen modules

Aanpak in 3 fases. Ik begin met **Fase 1 (flow-pagina) + import-knop**, daarna **Fase 2 (drag & drop editor)** in een tweede ronde. Zo zie je snel de flow en kun je stap voor stap templates verrijken.

---

## Fase 1 — Flow-overzicht + template-beheer per module

### 1a. Nieuwe pagina `/mail/flow` — "Hoe werkt de flow"
Visueel diagram (React Flow / SVG) met alle geautomatiseerde mailmomenten:

```text
 LEAD binnen ──▶ OUTREACH mail 1 ──▶ (geen reply 3d) ──▶ FOLLOW-UP mail 2 ──▶ ...
                       │                                        │
                       ▼                                        ▼
                  REPLY ontvangen                        AFSPRAAK gepland
                       │                                        │
                       ▼                                        ▼
                OFFERTE verstuurd ──▶ QUOTE follow-up ──▶ GETEKEND ──▶ FACTUUR
                                                                │
                                                                ▼
                                                     GEBRUIKER uitgenodigd
```

Elke node toont:
- Module (Outreach / Mail / Offerte Studio / Gebruikers)
- Actieve default template naam
- Knop **"Bewerk sjabloon"** → deep-link naar de juiste template-pagina

### 1b. Template-beheer per module (bestaat deels al)
Vier plekken, allemaal met zelfde UX (lijst + zoeken + kanaal-filter + bewerken):

| Module | Pagina | Bestaat? |
| --- | --- | --- |
| Outreach follow-ups | `/outreach/templates` | ✅ ja |
| Algemene mail | `/mail/templates` | ✅ ja |
| Offerte Studio mails | `/offerte-studio/mail-templates` | 🆕 nieuw |
| Welkomst-/uitnodigingsmail | `/gebruikers/welkomstmail` | 🆕 nieuw (nu hardcoded HTML in `users.functions.ts`) |

### 1c. Import tussen modules
Nieuwe knop **"Importeer uit…"** bovenaan elke template-lijst:
- Kies bron-module → kies template → kopieert naar huidige module als nieuw sjabloon
- Server function `copyTemplateBetweenModules({ sourceId, sourceModule, targetModule })`
- Kopieert: naam, subject, body, body_blocks, background, description

---

## Fase 2 — Drag & drop mail-editor (`MailBuilder`)

Blok-gebaseerde editor die naast de bestaande textarea komt (tab "Visueel" / "Tekst"):

**Blokken:** Header (logo + titel), Hero (afbeelding), Tekst (met tokens `{{contact_name}}` etc.), Button/CTA, Divider, Twee-koloms, Footer (afmeld + adres).

**Achtergrond:**
- Kleur kiezen
- Afbeelding uploaden naar `mail-attachments` bucket → hergebruikbaar als "skin" per organisatie
- Header/footer los instelbaar per template (of "gebruik org-default")

**Opslag (nieuwe kolommen op `outreach_message_templates` en nieuwe tabel `mail_templates`):**
- `body_blocks jsonb` — gestructureerde blokken
- `body_html text` — server-gerenderde HTML voor verzending
- `background jsonb` — `{ color, image_url, header_id, footer_id }`
- Backwards compatible: bestaande `body` text blijft werken

**Render:** `src/lib/mail-builder.ts` → `renderMailBlocks(blocks, vars) → html` (server-side, gebruikt in alle mail-verzenders).

---

## Fase 3 — Wire-through in verzenders

Update `sendWelcomeEmail`, outreach sequence sender, offerte-studio mail-verzender en `mail.functions.ts` zodat ze eerst `body_html` gebruiken als aanwezig, anders fallback naar plain body.

---

## Bouwvolgorde eerste ronde (deze approval)

1. DB-migratie: kolommen `body_blocks`, `body_html`, `background` + nieuwe tabellen `mail_templates`, `mail_backgrounds` met RLS + GRANTs
2. Route `/mail/flow` met statisch flow-diagram + deep-links
3. Nieuwe pagina's `/offerte-studio/mail-templates` en `/gebruikers/welkomstmail` (lijst + tekst-editor, nog geen drag & drop)
4. Server fn `copyTemplateBetweenModules` + "Importeer uit…" knop op alle 4 pagina's
5. `sendWelcomeEmail` leest template uit DB i.p.v. hardcoded HTML

**Fase 2 (drag & drop editor + achtergrond-skins)** komt in een tweede approval-ronde zodra Fase 1 draait — zo blijft deze ronde behapbaar en zie je snel resultaat.

## Technische details

- Geen wijziging aan LinkedIn/WhatsApp templates — die blijven pure textarea (geen HTML zinnig)
- Alle nieuwe tabellen: `organization_id` scope + `has_org_access()` RLS + `GRANT` naar `authenticated` + `service_role`
- Import gebeurt server-side (RLS check per org)
- Flow-diagram is React component, geen extra dep nodig — SVG met TailwindCSS
