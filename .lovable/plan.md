# Sales Workflow — implementatieplan

Veel bouwstenen bestaan al (leads, quotes met publieke signeer-link, contracts, invoices, `generate_recurring_invoices` cron, Mollie iDEAL webhook, `convert_lead_to_customer` RPC). Ik voeg de ontbrekende schakels toe zonder bestaande logica te breken.

## Wat je krijgt

### 1. Nieuwe pagina `/sales-workflow`
Één overzicht met de 5-stappen pipeline per lead:

```text
[ Nieuwe leads ] → [ Klantwensen ] → [ Offerte/Contract ] → [ Ondertekend ] → [ Facturen & Abo ]
```

- Kolommen als kanban of tabel met filter (bron, status, periode).
- Per lead-rij: knop naar bijbehorende Klantwensen / Offerte / Contract / Facturen.
- KPI-strip bovenaan: aantal per fase, MRR uit lopende contracten, openstaand op eenmalige facturen.

### 2. Klantwensen-stap (nieuw)
Nieuwe tabel `client_requirements` (1-op-1 met lead) met:
- `scope` (tekst, editable),
- `one_time_cents`, `recurring_cents`, `currency`, `notes`.

UI: knop op leaddetail "Klantwensen opstellen" → editable form (velden voorinvullen met AI-samenvatting uit `lead.transcript`/`description` via bestaande Lovable AI helper). Vanuit dit scherm knop **"Genereer offerte & contract"** → maakt quote + contract-concept met de bedragen uit deze requirements.

### 3. Auto-conversie bij ondertekening (nu pas bij paid)
Nieuwe SECURITY DEFINER-functie `finalize_signed_quote(_quote_id)`:
- Roept `convert_lead_to_customer` aan (client + project + contract).
- Maakt direct één **eenmalige factuur** voor `one_time_cents` (status `sent`, Mollie iDEAL link via bestaande flow).
- Activeert contract met `next_invoice_date = start_date` zodat bestaande `generate_recurring_invoices` cron de maandfacturen genereert (interne recurring, iDEAL per factuur — géén SEPA, per jouw keuze).
- Trigger op `quotes` na UPDATE waarbij `signed_at` van NULL → gevuld, roept deze functie aan.

### 4. Behoud huidige Mollie iDEAL flow
- Mollie subscriptions/SEPA blijven **uit**.
- Elke maandfactuur uit de cron krijgt zoals nu een iDEAL-betaallink; klant betaalt handmatig per factuur.
- Bestaande webhook `/api/public/hooks/mollie` blijft ongewijzigd.

## Technisch

**Nieuwe migratie:**
- `client_requirements` tabel + GRANT + RLS (org-scoped via `has_org_access`).
- `finalize_signed_quote(uuid)` RPC (SECURITY DEFINER).
- Trigger `trg_quote_signed_finalize` op `quotes` AFTER UPDATE OF `signed_at`.

**Nieuwe server functions (`src/lib/sales-workflow.functions.ts`):**
- `listSalesPipeline` — leads + requirements + quote + contract joined.
- `upsertRequirements` — save Klantwensen.
- `aiDraftRequirements` — Lovable AI genereert scope/bedragen uit lead-tekst.
- `generateQuoteFromRequirements` — maakt quote + contract-concept.

**Nieuwe route:** `/_authenticated/sales-workflow.tsx` + sidebar-link.
**Uitbreiding leaddetail:** knop "Klantwensen" op bestaande leads-pagina.

## Wat NIET verandert
- Bestaande quote-, contract-, factuur- en Mollie-code blijft intact.
- Geen wijzigingen aan `client.ts`, `types.ts` handmatig — types worden na migratie hergegenereerd.
- Geen edge functions; alles via TanStack `createServerFn`.

Akkoord? Dan ga ik bouwen.