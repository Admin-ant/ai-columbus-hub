# Plan: Projecten → Uitvoering / Delivery

Doel: Sales Workflow blijft de verkoopfunnel (lead → offerte → contract). Projecten wordt de plek voor lopende projecten *ná* de handtekening: opleveren, notities, doelmaand, on-hold, statusgeschiedenis.

## 1. Database — nieuwe delivery-statussen

Nieuwe enum `project_delivery_status` toevoegen naast de bestaande `project_status`:

- `nieuw` — contract getekend, nog niet gestart
- `in_uitvoering` — actief werk
- `wacht_op_klant` — wacht op input klant
- `on_hold` — gepauzeerd
- `opgeleverd` — klaar / live
- `geannuleerd` — gestopt na tekenen

Kolom `delivery_status` toevoegen aan `public.projects` (default `nieuw`). Bestaande `status`-kolom blijft staan voor backwards compat en voor de DB-trigger die 'm nu vult bij lead-conversie. Nieuwe kolom is leidend voor de UI van Projecten.

Bestaande rijen migreren:
- `contract_getekend` → `delivery_status = 'nieuw'`
- `on_hold` → `delivery_status = 'on_hold'`
- alles daarvoor (`contact_gezocht`, `afspraak_geboekt`, `offerte_verstuurd`, `contract_verstuurd`) → `delivery_status = 'nieuw'` én er komt een filter zodat ze standaard niet in de nieuwe Projecten-lijst verschijnen (alleen projecten met een contract of expliciete delivery-status ≠ default).

Statushistorie: bestaande `project_status_history` blijft werken voor `status`. Een nieuwe tabel `project_delivery_status_history` + trigger logt wijzigingen van `delivery_status` (zelfde vorm: old/new/changed_by/changed_at).

## 2. UI — Projecten-lijst (`/ai-columbus/projecten`)

- Titel wordt **"Projecten (uitvoering)"** met korte uitleg: *"Lopende projecten na contractondertekening. Voor de verkoopfunnel: Sales Workflow."*
- Standaardfilter: alleen projecten met een gekoppeld actief contract of met `delivery_status` ≠ null. Toggle "Toon alle projecten" voor de oude weergave.
- Statuskolom + kleuren gebruiken `delivery_status` in plaats van `status`.
- Filterdropdown vervangt sales-statussen door delivery-statussen.
- KPI's boven de tabel:
  - Aantal in uitvoering
  - Aantal on hold / wacht op klant
  - Aantal opgeleverd deze maand
  - Totaal MRR van actieve projecten (via gekoppelde contracten)
- Kolom "Contract" toegevoegd → link naar `/contracten/$id` als aanwezig.
- Knop "Nieuw project" blijft, maar formulier vraagt om `delivery_status` (niet meer sales-status).
- Link naar Sales Workflow bovenaan: *"Nog geen contract? → Sales Workflow"*.

## 3. UI — Projectdetail (`/ai-columbus/projecten/$projectId`)

- Statusveld toont `delivery_status` met de nieuwe waarden.
- Statusgeschiedenis-blok toont geschiedenis van `delivery_status` (nieuwe tabel).
- Nieuwe sectie **"Gerelateerd"**: links naar Klant, Contract, Facturen, en (als aanwezig) originele Lead / Offerte.
- Sales-status (`status`) wordt read-only getoond als "Herkomst" (bv. "Contract getekend via lead X op 12-05-2026") maar niet meer bewerkbaar hier.

## 4. Sales Workflow — kleine aanvulling

- Rij in de pipeline waar `contract` actief is: knop **"Naar project"** die linkt naar de bijbehorende `/ai-columbus/projecten/$id`.
- Zo is de overgang van verkoop → uitvoering één klik.

## 5. Sidebar / navigatie

- Label "Projecten" wordt **"Projecten (uitvoering)"** voor duidelijkheid.
- Positie blijft in de "Algemeen"-groep, direct onder Sales Workflow — dat leest als de logische volgorde: eerst verkopen, dan uitvoeren.

## 6. Uit scope (nu niet)

- Geen nieuwe taken/subtaken per project (kan later).
- Geen tijdregistratie of urenboeking.
- Oude `project_status` enum niet verwijderen — blijft bestaan zodat DB-triggers en bestaande data intact blijven.

## Technische details

```text
public.projects
  + delivery_status project_delivery_status NOT NULL DEFAULT 'nieuw'

public.project_delivery_status_history
  id, project_id, organization_id, old_status, new_status,
  changed_by, changed_at

trigger log_project_delivery_status_change (analoog aan bestaande)

enum project_delivery_status:
  nieuw | in_uitvoering | wacht_op_klant | on_hold | opgeleverd | geannuleerd
```

Front-end raakt alleen:
- `src/routes/_authenticated/ai-columbus.projecten.tsx`
- `src/routes/_authenticated/ai-columbus.projecten.$projectId.tsx`
- `src/routes/_authenticated/sales-workflow.tsx` (knop "Naar project")
- `src/components/app-sidebar.tsx` (label)

Geen wijzigingen aan de bestaande lead-conversie-functies of aan Sales Workflow-logica zelf.
