# Verschiloverzicht per opgeslagen scan-aanpassing

Voeg in het paneel **"Opgeslagen scan-aanpassingen"** (in `src/components/outreach/campaign-flow-tab.tsx`) per entry een knop **"Verschil"** toe die een inline overzicht opent van wat er per veld is gewijzigd t.o.v. de originele scan — zonder de entry eerst te hoeven laden.

## Gedrag

- Knop **Verschil** naast **Laden** / **Verwijder** in elk item.
- Klik → toggle een uitklapbaar blok onder het item.
- Toont per veld (Branche, Specialisatie, Toon, Samenvatting) alleen de rijen die verschillen:
  - links: originele scan-waarde (rood/doorgestreept)
  - rechts: opgeslagen aanpassing (groen)
- Als er geen verschillen zijn: "Geen verschillen — opgeslagen waarden zijn identiek aan de scan."
- Onder in het blok een teller ("3 van 4 velden aangepast") en een knop **Kopieer als tekst** die het diff-overzicht als platte tekst naar het klembord zet.

## UI-details

- Slechts één entry tegelijk uitgeklapt (`openDiffUrl: string | null`-state).
- ChevronRight-icoon roteert naar ChevronDown wanneer open.
- Gebruikt dezelfde stijl als het bestaande `scanChanges`-overzicht in de scan-kaart (compact grid, muted background).

## Technische details

- Nieuwe helper `computeScanDiff(original, edited)` naast bestaande `scanChanges`-logica, hergebruikt de veldenlijst (`industry` / `specialisation` / `tone` / `summary`).
- Geen nieuwe dependencies.
- Alleen frontend — geen server-fn of DB-wijziging.

## Bestanden

- `src/components/outreach/campaign-flow-tab.tsx` (enige wijziging)
