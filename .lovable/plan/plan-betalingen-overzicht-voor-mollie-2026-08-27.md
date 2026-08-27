# Plan: Betalingen-overzicht voor Mollie

## Wat er al is (gekoppeld met de API)
- De Mollie-webhook (`/api/public/hooks/mollie`) zet facturen automatisch op **Betaald** zodra de betaling binnen is.
- Elke betaalgebeurtenis (aangemaakt, webhook-signaal, status-check) wordt gelogd in de betaalhistorie van de factuur.
- Op de factuurdetailpagina kun je de actuele status handmatig verversen bij Mollie.

Dus ja: betalingen komen automatisch binnen. Wat nu ontbreekt is **één plek om alles te zien**.

## Wat we toevoegen

### 1. Nieuwe pagina "Betalingen" (onder Administratie)
Een overzichtspagina met:
- Alle facturen met een Mollie-betaallink, met kolommen: factuurnummer, klant, bedrag, status (Open / In behandeling / Betaald / Verlopen / Geannuleerd), betaalmethode en datum.
- Filters op status en periode, plus zoeken op klant/factuurnummer.
- Een knop **"Statussen verversen"** die voor alle openstaande betalingen in één keer de actuele status bij Mollie ophaalt (hergebruikt de bestaande refresh-functie).
- Kleuren-badges: groen = betaald, oranje = open/in behandeling, rood = mislukt/verlopen.
- CSV-export van het overzicht.

### 2. KPI-tegels bovenaan
- Totaal betaald (periode), openstaand bedrag, aantal openstaande betaallinks, aantal verlopen.

### 3. Menu
- Nieuw item **"Betalingen"** onder de sectie Administratie in de zijbalk, met icoon.

## Technische details
- Nieuwe route `src/routes/_authenticated/betalingen.tsx`; data via bestaande serverfuncties (`listInvoicePaymentEvents`, `refreshMollieInvoiceStatus`) aangevuld met een nieuwe lijst-functie in `src/lib/mollie-invoice.functions.ts` die facturen met `mollie_payment_id` ophaalt en per factuur de laatste event-status meegeeft.
- Verversen gebeurt per factuur via de bestaande refresh-functie (parallel, met foutafhandeling per item).
- Geen database-wijzigingen nodig.
