# Plan: Kanban-view voor /leads

## Doel
Vervang (of vul aan) de huidige leads-tabel door een visuele Kanban-pipeline met sleep-en-los kolommen, zodat je leads snel tussen fases kunt verplaatsen.

## Huidige situatie
- `/leads` toont nu een tabel met filters, zoeken, sorteren, create/edit/win/lose dialogs.
- `leads` tabel heeft al een `position` kolom (integer, default 0).
- `@dnd-kit/core` + `@dnd-kit/sortable` zijn al geïnstalleerd en worden al gebruikt in `/outreach`.
- Server functions `winLead` en `loseLead` bestaan al in `src/lib/pipeline.functions.ts`.

## Wat we bouwen

### 1. View-toggle op /leads
- Twee tabs/knoppen boven de huidige filterbalk: **Tabel** (huidig) en **Kanban** (nieuw).
- Standaard start op **Kanban** voor de visuele pipeline-ervaring.
- Bestaande tabel blijft beschikbaar onder de Tabel-tab.

### 2. Kanban kolommen
We groeperen de bestaande `lead_stage` waarden in 6 logische kolommen:

| Kolom | Stages die erin vallen | Primaire stage bij drop |
|-------|------------------------|-------------------------|
| Nieuw | `nieuwe` | `nieuwe` |
| Kwalificatie | `contact_opgenomen`, `in_contact` | `in_contact` |
| Afspraak | `op_afspraak` | `op_afspraak` |
| Offerte | `offerte_verzonden`, `in_afwachting`, `even_on_hold` | `offerte_verzonden` |
| Gewonnen | `klant`, `gewonnen`, `ai_columbus` | `gewonnen` |
| Verloren | `verloren` | `verloren` |

- Per kolom: header met naam + aantal leads + kleurindicator.
- Lege kolom toont een dashed "Sleep hier" placeholder.

### 3. Lead-kaarten
Elke kaart toont:
- Naam (bold)
- Bedrijf (indien aanwezig)
- Geschatte waarde (€ p/m)
- Bron-badge
- Contacthint (e-mail en/of telefoon icoon)
- Snelle actie-knoppen: Bewerken, Gewonnen, Verloren, Details

### 4. Drag-and-drop gedrag
- **Tussen kolommen slepen**: update `stage` naar de primaire stage van de doelkolom en `position` naar het einde van die kolom.
- **Binnen kolom slepen**: herorden kaarten door `position` opnieuw toe te wijzen (stap van 1000, zodat er later makkelijk tussen geplaatst kan worden).
- **Optimistic UI**: kaart verplaatst direct visueel; database update op de achtergrond. Bij fout wordt de lijst herladen.
- **Sensor**: `PointerSensor` met 4px activation constraint (zoals in `/outreach`).

### 5. Filters blijven werken
- Zoeken, bron-filter, periode-filter en status-filter werken ook in Kanban-view.
- Sorteeroptie is alleen relevant in Tabel-view; in Kanban-view wordt op `position` binnen de kolom gesorteerd.

### 6. Behoud bestaande functionaliteit
- "Nieuwe lead" knop, Create/Edit dialogs, Win/Lose dialogs en Detail-dialog blijven exact zoals ze nu zijn.
- Realtime Supabase subscription blijft actief, zodat wijzigingen vanuit andere pagina's direct zichtbaar zijn.

### 7. Technische aanpak
- Hergebruik `@dnd-kit/core` componenten (`DndContext`, `useDraggable`, `useDroppable`) volgens het patroon in `src/routes/_authenticated/outreach.index.tsx`.
- Geen nieuwe server functions nodig voor het verplaatsen; we gebruiken direct `supabase.from("leads").update()` (zoals de huidige `changeStage` al doet).
- Voor herordening binnen een kolom voegen we een kleine helper toe die `position` herberekent.
- Geen database-migratie nodig: `position` bestaat al.

### 8. Bestanden die wijzigen
- `src/routes/_authenticated/leads.tsx` — uitbreiden met Kanban-view, view-toggle en DnD helpers.

## Niet in deze fase
- Volledig herontwerp van de kaart-styling (we houden het compact en functioneel).
- Automatische acties bij stage-wijziging (zoals e-mail versturen) — dat komt later.

## Acceptatie
- Gebruiker kan schakelen tussen Tabel en Kanban.
- Gebruiker kan een lead van de ene kolom naar de andere slepen; stage wordt opgeslagen.
- Gebruiker kan kaarten binnen een kolom herordenen.
- Zoeken en filters werken in beide views.
- TypeScript build en lint blijven groen.

Reageer met "start build" of geef aan wat je aangepast wil zien.