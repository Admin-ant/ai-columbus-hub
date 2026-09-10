# Voorraadbeheer

## Doel
Een eenvoudig maar uitbreidbaar voorraadbeheer waarbij je per product het huidige aantal ziet, mutaties kunt teruglezen, automatisch voorraad wordt afgeboekt bij verzonden facturen, en een waarschuwing krijgt als een product onder het ingestelde drempel komt.

## Wat je straks kunt doen
- Per product aangeven of je voorraad wilt bijhouden, inclusief huidig aantal en eigen drempel voor lage voorraad.
- Handmatig voorraad corrigeren (bijv. na telling of retour) met een reden.
- Automatisch voorraadmutaties zien die ontstaan door facturen.
- Op de productenpagina en in de factuurregels direct zien of een product op voorraad is.
- Een apart "Voorraad"-overzicht openen vanuit het menu om snel alle lage-voorraad producten en recente mutaties te bekijken.

## Technische aanpak

### Database
1. Uitbreiding van `public.products`:
   - `track_stock boolean NOT NULL DEFAULT false`
   - `stock_quantity numeric NOT NULL DEFAULT 0`
   - `low_stock_threshold numeric NOT NULL DEFAULT 0`
2. Nieuwe tabel `public.product_stock_movements`:
   - `id`, `organization_id`, `product_id`, `movement_type` enum (`in`, `out`, `correction`), `quantity` (positief getal), `reference_type` (`invoice`, `manual`, `correction`), `reference_id`, `note`, `created_by`, `created_at`, `updated_at`.
   - RLS: leden van de organisatie mogen mutaties binnen hun organisatie inzien; alleen admins/mede­werkers met schrijfrechten kunnen handmatige mutaties toevoegen.
   - Grants voor `authenticated` en `service_role`.
3. Trigger op `public.invoices`:
   - Bij statuswijziging naar `sent` of `paid` wordt per `invoice_lines` regel met een gekoppeld `product_id` een `out`-mutatie aangemaakt, mits het product `track_stock = true`.
   - Bij annuleren/crediteren van een factuur wordt dezelfde hoeveelheid teruggeboekt als `in`-mutatie.

### Backend / server functions
- `recordStockMovement`: voegt een handmatige correctie toe.
- `listStockMovements`: haalt mutaties op voor een product of organisatie.
- `getLowStockProducts`: geeft producten waar `stock_quantity <= low_stock_threshold` en `track_stock = true`.

### UI
- Productenpagina (`/producten`):
  - Nieuwe velden in het product-formulier: "Voorraad bijhouden", "Huidige voorraad", "Waarschuwingsdrempel".
  - Extra kolommen in de tabel: voorraad + een rood/oranje badge bij lage voorraad.
  - Knop "Mutaties" om het mutatiehistorie van een product te bekijken.
- Nieuwe route `/voorraad`:
  - Overzicht van producten met voorraad, gefilterd op lage voorraad.
  - Tabel met recente mutaties over alle producten.
  - Handmatige correctie-knop.
  - Toegevoegd aan het menu onder **Administratie**.
- Factuur-/offertepagina:
  - In de product-autocomplete wordt het huidige voorraadaantal getoond.
  - Factuurregels tonen een klein "op voorraad / laag / niet op voorraad" indicatortje.

### Beveiliging
- RLS op `product_stock_movements` scopet alles tot de organisatie.
- Server functions gebruiken `requireSupabaseAuth` zodat alleen ingelogde gebruikers van de juiste organisatie mutaties kunnen doen.
- De automatische factuur-trigger draait als security definer binnen de organisatie van de factuur.

## Niet in deze versie
- Inkooporders / leveranciersvoorraad (alleen handmatige `in`-mutaties).
- Meerdere magazijnlocaties.
- Voorraadreserveringen op offertes.
- Barcode-scan integratie.
