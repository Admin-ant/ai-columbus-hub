# Beveiligingsronde mailmodule

Uiterlijk en andere modules blijven ongewijzigd. Publiceren pas na jouw akkoord.

## 1. Inkomende mail veilig tonen (XSS)
- Nieuw: één veilige mailweergave die HTML opschoont met DOMPurify (scripts, iframes, formulieren, on*-attributen, javascript:-links, externe CSS weg) en toont in een afgeschermd iframe (sandbox zonder scripts en zonder same-origin).
- Externe afbeeldingen standaard geblokkeerd, met knop "Afbeeldingen tonen". Links openen in een nieuw tabblad met rel="noopener noreferrer".
- Toegepast op ontvangen/verzonden mail, concepten, ticketmails en sjabloon-/skinvoorbeelden.
- Bestanden: nieuw `src/lib/mail-html-sanitize.ts`, `src/components/mail/safe-mail-frame.tsx`; aangepast `mail.tsx`, `tickets.$ticketId.tsx`, `mail.skins.tsx`, `templates-manager.tsx`.

## 2. Bijlagen alleen van de eigen organisatie
- Browser stuurt alleen bijlage-id's; server zoekt het opslagpad op en controleert organisatie (en mail/concept). Anders nette weigering.
- Opslagpaden beginnen altijd met organisatie-id; opslagregels laten alleen leden van die organisatie lezen/verwijderen.
- Maximum per bijlage (10 MB) en per mail (25 MB).
- Bestanden: `src/lib/mail.functions.ts`, `mail.tsx`, `client-email-composer.tsx`, plus een databasewijziging voor de opslagregels.

## 3. Inbound-webhook
- Svix-handtekening van Resend controleren (svix-id/-timestamp/-signature) met tijdsvenster van 5 minuten en constant-time vergelijking; ongeldig of ontbrekend geeft 401 en slaat niets op.
- Organisatie alleen via het ontvangende adres; de terugval op "eerste organisatie" verdwijnt. Onbekend adres: loggen en negeren.
- Threads koppelen via In-Reply-To en References (naast de bestaande X-header).
- Elk event maar één keer verwerken (op event-id).
- Bestand: `src/routes/api/public/hooks/mail-inbound.ts`.

## 4. Afzenderadres
- Server controleert bij elke verzending dat het afzenderadres op een geverifieerd domein uit Mail-instellingen van de eigen organisatie staat; anders weigeren.
- Bestand: `src/lib/mail.functions.ts` (en gedeelde controle voor andere verzendpaden in de mailmodule).

## Tests (worden gedraaid, uitkomst getoond)
- Mail met `<script>alert(1)</script>` en `<img onerror=…>`: niets uitgevoerd.
- Bijlage-id van andere organisatie meesturen/verwijderen: geweigerd.
- Webhook zonder/met foute handtekening: 401, niets opgeslagen.
- Mail naar onbekend adres: bij geen organisatie opgeslagen.
- Verzenden vanaf vreemd from-adres: geweigerd.

## Omgevingsvariabele
- Het Resend-webhookgeheim is al opgeslagen; ik controleer of de naam klopt en meld het als er iets ontbreekt.
