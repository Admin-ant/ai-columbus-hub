## Doel
Cold Outreach uitbreiden naar een provincie-gebaseerde recruitment-pipeline met herbruikbare mail/LinkedIn/WhatsApp templates, drag-and-drop kanban, en een demo-planner.

## 1. Database (1 migratie)

**Nieuwe tabel `outreach_message_templates`** (per organization):
- `name`, `channel` (email/linkedin/whatsapp), `subject`, `body`, `is_default` (bool, per channel)
- RLS + GRANTs op org-membership

**Uitbreiden bestaande tabellen:**
- `outreach_targets`: `province` (text), `demo_type` (online/onsite/null), `demo_at` (timestamptz)
- `outreach_campaigns`: `province` (text, optioneel)

**Seed** (in migratie): 3 default templates per nieuwe organisatie via een trigger op `organizations` insert, en backfill voor bestaande orgs:
- Sjabloon 1 — Email recruitment ("Halveer de screeningstijd voor {{company}} in {{province}} 🚀")
- Sjabloon 2 — LinkedIn ("…sterk vertegenwoordigd in de {{province}} recruitmentmarkt…")
- Sjabloon 3 — WhatsApp opvolging

## 2. Templates pagina (nieuw)

**Route**: `src/routes/_authenticated/outreach.templates.tsx`
- Sidebar-item "Templates" onder Outreach
- Lijst per kanaal (email / linkedin / whatsapp) met aanmaken/bewerken/verwijderen
- Tokens-picker: `{{contact_name}}` `{{company}}` `{{province}}` `{{sender_name}}`
- Live preview met sample vars
- Knop "Markeer als standaard" per kanaal

## 3. Pipeline UX (uitbreiden `outreach.index.tsx`)

### "+ Prospect" modal uitbreiden
Bestaande `NewTargetDialog` krijgt:
- **Provincie**-dropdown (12 NL provincies, verplicht als gekoppelde campagne een provincie heeft)
- **Telefoonnummer** veld (al deels aanwezig, zichtbaar maken)
- Sectie **"Demo inplannen"** (optioneel): demo-type select (Teams/Op locatie) + datetime-input

### Drag-and-drop kanban
- `@dnd-kit/core` toevoegen (`bun add @dnd-kit/core @dnd-kit/sortable`)
- Kolommen worden `<DroppableColumn>`, kaarten `<DraggableCard>`
- Drop op nieuwe stage → `moveTarget()` (bestaat al)

### Move-to-AANGESCHREVEN dialog
- Bij drop op "aangeschreven": open `<SendOutreachDialog>` met:
  - Tabs: Email / LinkedIn
  - Templates voor org geladen, tokens (`{{province}}` etc.) automatisch ingevuld vanuit target
  - "Kopieer tekst" knop per kanaal
  - Email: directe `mailto:` link, knop "Verstuur via systeem" (gebruikt bestaande `sendOutreachEmail`)
  - LinkedIn: open `linkedin_url` in nieuwe tab

### Move-to-GESPREK
- Als geen demo gepland → prompt voor demo-type + datum
- Kaart toont prominent badge: `📹 Teams — di 30 jun 14:00` of `📍 Op locatie — …`

### "+ Provinciale campagne" snelactie
Nieuwe knop naast "Nieuwe campagne": opent dropdown met 12 provincies → maakt campagne `"Recruitment {{Provincie}}"` met `province` ingevuld en koppelt automatisch de 3 default templates als `sequence_steps`.

## 4. Bestanden

**Nieuw:**
- `supabase/migrations/<ts>_outreach_templates_province.sql`
- `src/routes/_authenticated/outreach.templates.tsx`
- `src/components/outreach/templates-manager.tsx`
- `src/components/outreach/send-outreach-dialog.tsx`
- `src/components/outreach/pipeline-board.tsx` (dnd wrapper)
- `src/lib/outreach-templates.ts` (render-tokens helper, constants NL_PROVINCES)

**Bewerken:**
- `src/routes/_authenticated/outreach.index.tsx` (kanban → DnD, prospect-modal uitbreiden, gesprek-badge)
- `src/components/app-sidebar.tsx` (Templates sub-item)
- `src/lib/outreach.functions.ts` (`createProvincialCampaign` server fn)

## 5. Buiten scope
- Geen aparte WhatsApp-verzending (alleen template + "kopieer" + `wa.me/` link)
- Geen calendar-sync voor demo's (alleen opslaan + tonen op kaart); export naar `crm_activities` mag

Eerst de migratie indienen voor goedkeuring, daarna code.
