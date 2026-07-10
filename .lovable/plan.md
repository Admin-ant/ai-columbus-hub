
# Plan: Salespijplijn + contracten + maandelijkse facturatie

Doel: complete flow **Lead → Kwalificatie → Offerte → Gewonnen → automatisch Klant + Project + Contract → elke maand automatisch een factuur**, gebouwd bovenop wat er al staat, zonder dubbele tabellen.

## Wat er al is (blijft, wordt uitgebreid)

- `leads` heeft al een `stage` enum met o.a. `nieuwe`, `in_contact`, `op_afspraak`, `offerte_verzonden`, `gewonnen`, `verloren`, `klant`. Dit is al feitelijk de opportunity-pipeline.
- `clients` heeft al `monthly_value` en `start_date`.
- `projects` bestaat met status-flow inclusief `contract_verstuurd` / `contract_getekend`.
- `quotes`, `invoices` (one-shot), `products`, boekhouding en Mollie zijn er.

## Overlap-beslissingen (samenvoegen i.p.v. dubbel)

- **Geen aparte `opportunities` tabel.** `leads` mét stage-flow doet dat werk al. Ik voeg alleen wat velden toe (`quote_id`, `won_at`, `lost_reason`, `converted_client_id`) en bouw een échte kanban-view.
- **`clients.monthly_value` wordt afgeleide** van actief contract. Blijft bestaan voor bestaande code, maar wordt automatisch bijgewerkt door een trigger op `contracts`. Geen breaking change.
- **Één "wonnen"-actie** i.p.v. losse knoppen. Vanuit lead-kaart of quote-accept: klant + project + contract in één transactie.
- **`projects.status`** blijft leidend voor projectuitvoering. Contract-status leeft in `contracts.status` (aparte assen: project = uitvoering, contract = commercie).

## Nieuwe tabellen

### `contracts`
- `client_id`, `organization_id`, `project_id` (optioneel), `quote_id` (optioneel, herkomst)
- `contract_number` (auto), `title`
- `start_date`, `end_date` (nullable = doorlopend), `notice_period_days`
- `billing_frequency` enum: `monthly` | `quarterly` | `yearly` (start met monthly)
- `next_invoice_date`, `last_invoiced_at`
- `monthly_amount_cents`, `setup_fee_cents`, `vat_rate`, `currency`
- `status` enum: `draft` | `active` | `paused` | `cancelled` | `ended`
- `auto_invoice` bool (default true), `payment_terms_days`

### `contract_lines`
Regels per contract (bijv. "AI Telefonie basis", "Extra 100 gesprekken/mnd", "Hosting").
- `contract_id`, `product_id` (optioneel, koppelt aan `products`), `description`, `quantity`, `unit_price_cents`, `vat_rate`

### `recurring_invoice_runs` (audit)
Wat de cron per keer heeft aangemaakt: `contract_id`, `invoice_id`, `period_start`, `period_end`, `status`, `error`.

Alle drie krijgen RLS via bestaande `app_private.has_org_access(auth.uid(), organization_id)` en GRANTs voor `authenticated` + `service_role`.

## Uitbreidingen op bestaande tabellen

- `leads`: `+ quote_id uuid`, `+ won_at timestamptz`, `+ lost_reason text`, `+ converted_client_id uuid`, `+ converted_project_id uuid`, `+ converted_contract_id uuid`. Enum `lead_stage` blijft.
- `clients.monthly_value` → automatisch bijgewerkt door trigger op `contracts` (`sum(monthly_amount_cents where status='active')`).
- `products`: `+ default_solution_type text` (nullable) om later een AI-catalogus-filter te ondersteunen. Kleine, niet-breaking toevoeging.

## Automatisering

### DB-functies
1. `convert_lead_to_customer(_lead_id, _monthly_cents, _setup_cents, _start_date, _title)` — zet lead op `gewonnen`, maakt (of hergebruikt) `clients`, maakt `projects` met status `contract_getekend`, maakt `contracts` met status `active` en `next_invoice_date = start_date`. Vult `leads.converted_*`. Alles in één transactie, SECURITY DEFINER met `has_org_access` check.
2. `generate_recurring_invoices()` — loopt over `contracts` waar `status='active'` en `auto_invoice=true` en `next_invoice_date <= today`. Per contract:
   - maakt `invoices` row via bestaand `next_invoice_number()`,
   - kopieert `contract_lines` naar `invoice_lines`,
   - logt in `recurring_invoice_runs`,
   - schuift `next_invoice_date` op (+1 maand / kwartaal / jaar), zet `last_invoiced_at`.
   - Roept **niet** `post_invoice_journal` direct aan — dat gebeurt zoals nu bij versturen.
3. Trigger `contracts` → herbereken `clients.monthly_value`.

### Cron
- Nieuwe server route `src/routes/api/public/hooks/recurring-invoices.ts` (auth via `apikey` = anon key, bestaande pattern van jullie andere hooks).
- Roept `generate_recurring_invoices()` via `supabaseAdmin` aan en retourneert een JSON-summary.
- `pg_cron` job: dagelijks 06:00 → POST naar die route. Aan te maken via de insert-tool (buiten de migratie zodat de anon-key niet in migraties belandt).

## Server functions (nieuw, allemaal `requireSupabaseAuth` + admin-check waar nodig)

In `src/lib/pipeline.functions.ts`:
- `listPipeline()` — leads gegroepeerd per stage voor kanban.
- `moveLeadStage({ leadId, stage })` — enkel stage bijwerken.
- `winLead({ leadId, monthlyCents, setupCents, startDate, title })` — wrappt DB-fn `convert_lead_to_customer`, retourneert `{ clientId, projectId, contractId }`.
- `loseLead({ leadId, reason })`.

In `src/lib/contracts.functions.ts`:
- `listContracts({ status? })`, `getContract(id)`, `createContract`, `updateContract`, `addContractLine`, `deleteContractLine`.
- `pauseContract` / `resumeContract` / `cancelContract`.
- `generateInvoiceNow(contractId)` — handmatig een periode-factuur draaien (roept dezelfde DB-fn aan voor één contract).

In `src/lib/recurring.functions.ts` (intern):
- `runRecurringInvoices()` — admin-only handmatige trigger vanuit UI ("Nu draaien").

## UI

### `/leads` — omschakelen naar Kanban
- Kolommen op basis van `lead_stage`: Nieuw → In contact → Op afspraak → Offerte verzonden → Gewonnen → Verloren.
- Sleep-en-los tussen kolommen (bestaande `position` kolom gebruiken).
- Kaart-menu: **"Zet op Gewonnen…"** → dialog met bedrag/mnd, setup, startdatum, titel → roept `winLead`, laat succes-toast met deep-links naar de nieuwe klant / project / contract zien.
- **"Verloren"** → reden opgeven.

### `/contracten` (nieuw, onder `_authenticated`)
- Tabel met alle contracten (status, klant, maandbedrag, volgende factuurdatum).
- Detailpagina `/contracten/$id`: hoofdgegevens, regels bewerken, run-historie (uit `recurring_invoice_runs`), knoppen Pauzeer / Hervat / Beëindig / Genereer nu.
- Filter per status.

### `ai-columbus.klanten.$clientId`
- Extra sectie "Contracten & Abonnementen": lijst van contracten, actief maandbedrag, volgende factuur.
- Knop "Nieuw contract" (buiten de lead-conversie om).

### `/invoices`
- Extra badge/filter "Automatisch (contract)" via `invoices.project_id`/nieuwe `invoices.contract_id` kolom (klein veld toevoegen zodat je herkomst ziet).

### Sidebar
- Extra item **Contracten** onder Administratie.

## Migratie-volgorde (één migratie)

1. `ALTER TYPE lead_stage` — bestaande waardes zijn genoeg.
2. `ALTER TABLE leads ADD COLUMN …` (won_at, lost_reason, converted_*).
3. `ALTER TABLE invoices ADD COLUMN contract_id uuid`.
4. `CREATE TABLE contracts` + GRANTs + RLS + policies + `updated_at` trigger.
5. `CREATE TABLE contract_lines` + GRANTs + RLS + policies.
6. `CREATE TABLE recurring_invoice_runs` + GRANTs + RLS + policies (alleen `service_role` insert, org-leden select).
7. `CREATE FUNCTION convert_lead_to_customer(...)`, `generate_recurring_invoices()`, trigger `contracts → clients.monthly_value`.
8. Enable `pg_cron` + `pg_net` (indien nog niet).

Cron-registratie (`cron.schedule`) via de insert-tool ná de migratie, met de anon-key.

## Volgorde van implementeren

1. Migratie (schema + functies).
2. Cron aanmaken.
3. Server-functions + server-route voor cron.
4. Kanban `/leads` + winLead-dialog.
5. `/contracten` + detail.
6. Klantdetail-sectie + invoice-badge + sidebar.
7. Handmatige "Nu draaien" testen tegen 1 contract, daarna cron aanzetten.

Wat er **niet** in dit plan zit (bewust, kunnen we later): AI-oplossingencatalogus (C), tickets/support, verloopwaarschuwingen, prorata bij startdatum-midden-in-de-maand (v1: eerste factuur altijd op `start_date`, geen prorata).

Reageer met "start build" of geef aan wat je aangepast wil zien.
