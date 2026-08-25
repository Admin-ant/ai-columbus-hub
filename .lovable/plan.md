# Berichten testen, filteren en templaten

## Doel
Breid de bestaande SMS- en WhatsApp-schermen uit met testverzending, directe statuscontrole, veilige webhookconfiguratie, filters/CSV-export en herbruikbare berichttemplates.

## Uitwerking

### 1. Testbericht en directe status
- Voeg op zowel SMS als WhatsApp een aparte **Testbericht versturen**-actie toe.
- Laat de gebruiker een telefoonnummer en testtekst kiezen en toon na verzending direct de status (`in wachtrij`, `verzonden`, `afgeleverd` of `mislukt`).
- Werk de status kort automatisch bij zodat webhook-updates zichtbaar worden zonder handmatig verversen.
- Toon begrijpelijke foutmeldingen zonder technische providerdetails.

### 2. Veilige webhook-instellingen
- Voeg binnen **AI van Columbus-instellingen** een webhookgedeelte toe met de volledige webhook-URL, een kopieerknop en een invoerveld voor het webhook-geheim.
- Sla uitsluitend een SHA-256-hash van het geheim per organisatie op; het oorspronkelijke geheim wordt nooit teruggelezen of in gewone tekst opgeslagen.
- Laat de webhook het ontvangen geheim veilig vergelijken met de opgeslagen hash en daarna pas berichten/statusupdates verwerken.
- Toon alleen of een geheim is ingesteld, plus een actie om het te vervangen.

### 3. Verzendhistorie filteren en exporteren
- Voeg filters toe voor begindatum, einddatum en status.
- Pas filters server-side toe op de bestaande berichtgeschiedenis.
- Voeg **CSV downloaden** toe met datum, richting, afzender, ontvanger, status en berichttekst van de huidige gefilterde selectie.
- Zorg voor correcte CSV-escaping en een herkenbare bestandsnaam per kanaal en datum.

### 4. Berichttemplates
- Voeg een organisatiegebonden templatebibliotheek toe voor SMS en WhatsApp met naam, kanaal en berichttekst.
- Ondersteun variabelen in de vorm `{{naam}}`, `{{bedrijf}}` en `{{telefoon}}`.
- Voeg maken, wijzigen en verwijderen toe in de berichtenpagina.
- Laat een template selecteren bij het opstellen en bied invoervelden voor gevonden variabelen; vul de preview/berichttekst direct in.

### 5. Database en beveiliging
- Breid de organisatie-instellingen uit met de webhook-secret-hash.
- Voeg een tabel voor berichttemplates toe met expliciete grants, RLS en organisatiegebonden policies.
- Beperk webhookmatching tot de organisatie die bij het ontvangende afzendernummer hoort.
- Houd provider- en tabelnamen intern; in de interface blijft uitsluitend **AI van Columbus** zichtbaar.

## Technische details
- Bestaande TanStack server functions blijven de grens voor app-acties; de webhook blijft een beveiligde publieke serverroute.
- Server-functionbestanden blijven dun: schema’s/helpers staan in aparte modules.
- De bestaande SMS- en WhatsApp-route hergebruiken één gedeelde berichtencomponent.
- Na implementatie worden beide routes in de preview gecontroleerd, inclusief filters, template-invulling en statusweergave.
