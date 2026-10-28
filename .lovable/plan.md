# Afspraakbevestiging in nieuwe huisstijl

## Wat er al is
- De app stuurt al een afspraakbevestiging bij het inplannen van een afspraak, met een voorbeeldweergave zonder te versturen.
- Onderwerp en intro zijn aan te passen via de template "Afspraak bevestiging".
- Het AI van Columbus-logo voor e-mail staat al in de app.

## Wat ik ga doen
1. **Bestaande mail vervangen** door het nieuwe ontwerp uit je document: zwarte kop met logo, oranje #F2620C, lichtgrijze achtergrond, alleen tabellen en inline opmaak (werkt in Gmail, Outlook en Apple Mail), max. 600px, knoppen onder elkaar op mobiel.
2. **Inhoud volgens je document:** titel, aanhef, afspraakblok met oranje lijn (datum, tijd, locatie, onderwerp), knop "Zet in mijn agenda", "Wat bespreken we?", blok "Afspraak verzetten?" met Mail/Bel/WhatsApp-knoppen, afsluiting Anton Hogervorst, contactblok en grijze voettekst met KvK. Geen namen van leveranciers, geen sociale iconen, geen afmeldlink.
3. **Automatisch invullen:** voornaam, datum, tijd, locatie en onderwerp komen uit de afspraak. "Zet in mijn agenda" krijgt een echte agendalink. Gesprekspunten worden een nieuw invulveld bij de afspraak (2–4 punten); leeg = blok verbergen.
4. **Los bestand + voorbeeld:** het kale HTML-bestand met {{placeholders}} en een voorbeeldpagina met de voorbeeldwaarden (Sierd, 27 november) zet ik in je Bestanden.
5. **Controleren:** voorbeeld bekijken op desktop- en mobielbreedte en een testmail naar info@aivancolumbus.com sturen.

## Open punt
- Locatie in het voorbeeld blijft "[adres invullen]" tot je het echte adres geeft.

## Technisch
- `renderAppointmentHtml` in `src/lib/appointments.functions.ts` herschrijven; geannuleerde-variant behoudt dezelfde stijl.
- Logo via bestaande `logo-columbus-email` asset-URL (absoluut).
- Agendalink: Google Calendar-URL + .ics-fallback; datum_url server-side gecodeerd.
- Optioneel veld `agenda_points` op afspraken (migratie) + invoer in afspraakformulier.
