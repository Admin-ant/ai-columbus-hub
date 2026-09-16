# Ticketsysteem (Support)

Een compleet ticketsysteem in de Hub, voor zowel klantmeldingen als interne meldingen. Te vinden in het menu onder **Communicatie** > **Tickets**.

## Wat je krijgt

**Ticketoverzicht**
- Lijst met alle tickets: nummer (TCK-2026-0001), onderwerp, klant, prioriteit, status, eigenaar, laatste update.
- Filters op status, prioriteit, categorie, eigenaar (toegewezen collega) en periode; vrij zoeken op nummer, onderwerp en klant.
- Twee weergaven: lijst en bord (kolommen per status).
- Kaarten bovenaan: open, in behandeling, wachten op klant, vandaag opgelost.
- Export naar CSV.

**Ticketdetail**
- Gespreksverloop: berichten van klant en collega's, plus interne notities (alleen zichtbaar voor het team).
- Antwoorden per e-mail rechtstreeks vanuit het ticket (via de bestaande mailinstellingen); antwoorden van de klant komen terug in hetzelfde ticket.
- Bijlagen uploaden en bekijken.
- Rechterkolom: klantkaart, contactpersoon, prioriteit, status, categorie, eigenaar, labels.
- Volledige geschiedenis: wie wat wanneer wijzigde.

**Prioriteit en status** (geen SLA-timers)
- Prioriteit: laag, normaal, hoog, urgent.
- Status: nieuw, in behandeling, wachten op klant, opgelost, gesloten.
- Categorieën per omgeving instelbaar (bijv. storing, vraag, wijziging, factuur).

**Binnenkomst van tickets**
1. Handmatig aanmaken in de app, ook direct vanaf een klantkaart.
2. Publiek webformulier op een eigen link per omgeving, met spamrem en bevestigingsmail aan de melder.
3. Vanuit e-mail: berichten op het bestaande inkomende mailadres worden een ticket; antwoorden op een bestaand ticketnummer worden eraan gekoppeld.
4. Vanuit WhatsApp/SMS: knop "Maak ticket" in het gesprek; het bericht wordt de eerste ticketregel en de klantkoppeling gaat mee.

**Meldingen**
- Nieuwe tickets en toewijzingen verschijnen in Mijn meldingen en kunnen per e-mail, volgens de bestaande voorkeuren.
- Badge met openstaande tickets naast het menu-item.

**Klantkaart**
- Nieuw tabblad "Tickets" met alle tickets van die klant en een knop om er een aan te maken.

## Technische opzet

- Nieuwe tabellen: `tickets`, `ticket_messages`, `ticket_attachments`, `ticket_categories`, `ticket_events`, met RLS per organisatie, GRANTs voor `authenticated`/`service_role` en een nummerreeks per organisatie (zelfde patroon als `invoice_number_sequences`).
- Server functions in `src/lib/tickets.functions.ts` met `requireSupabaseAuth` voor lijst, detail, aanmaken, statuswijziging, toewijzen, antwoorden en interne notities.
- Routes: `src/routes/_authenticated/tickets.index.tsx`, `tickets.$ticketId.tsx`, `tickets.instellingen.tsx` (categorieën), plus publiek formulier `src/routes/support.$orgSlug.tsx` met server route `src/routes/api/public/hooks/ticket-intake.ts` (rate limit + honeypot).
- E-mailkoppeling via de bestaande `mail-inbound`-hook: ticketnummer in onderwerp/`References` bepaalt of het een antwoord is, anders nieuw ticket.
- WhatsApp/SMS: actie in `telnyx-messaging-page.tsx` die het gesprek naar een ticket omzet.
- Bijlagen in een private storage-bucket met signed URLs, zoals bij klantdocumenten.
- Menu-item in `app-sidebar.tsx` onder Communicatie, met openstaand-aantal als badge; realtime updates via Supabase Realtime.
- Vertalingen in `nl.json` en `en.json`.

## Volgorde

1. Database + RLS + nummerreeks.
2. Server functions.
3. Ticketoverzicht en detailpagina + menu.
4. Aanmaken vanaf klantkaart en WhatsApp/SMS.
5. Publiek formulier en e-mailintake.
6. Meldingen, badge en vertalingen.
