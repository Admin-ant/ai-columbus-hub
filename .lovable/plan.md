## Status A+B traject

Ik heb de eerdere implementatie nagelopen — het complete A+B traject (Opportunities-pipeline + automatische klant/project/contract + maandelijkse facturatie) staat er al:

- ✅ `contracts`, `contract_lines`, `recurring_invoice_runs` tabellen met RLS
- ✅ `convert_lead_to_customer()` en `generate_recurring_invoices()` DB-functies
- ✅ Trigger die `clients.monthly_value` bijwerkt vanuit actieve contracten
- ✅ `winLead` / `loseLead` / contract-CRUD serverfuncties
- ✅ `pg_cron` job `recurring-invoices-daily` (dagelijks 06:00) → `/api/public/hooks/recurring-invoices`
- ✅ UI: "Gewonnen"/"Verloren" dialogs op /leads, /contracten overzicht + detailpagina, sidebar-item, Kanban-view

Er is dus niets meer nodig aan A+B zelf — dat traject is klaar.

## Nieuwe wens: AI-plak-veld in "Nieuwe lead"

In het "Nieuwe lead"-dialog komt bovenaan een **AI-invulhulp**: je plakt losse tekst (mailtje, LinkedIn-bericht, visitekaartje-OCR, notitie) en de AI vult de formuliervelden voor je in.

### Werking

1. Bovenin het dialog een uitklapbare sectie **"AI-invulhulp — plak tekst"**:
   - `Textarea` (min. 4 regels)
   - Knop **"AI invullen"** (met sparkle-icoon)
   - Kleine hint: _"Plak een e-mail, LinkedIn-bericht of notitie. AI vult de velden in — je kunt daarna nog aanpassen."_
2. Bij klik roept de UI een nieuwe server-function `extractLeadFromText` aan.
3. De AI (Lovable AI Gateway, model `google/gemini-3-flash-preview`) krijgt de tekst en levert gestructureerd JSON:
   - `name`, `company`, `contact_person`, `email`, `phone`, `source` (moet mappen op bestaande bron-enum, anders leeg), `estimated_value_cents` (indien genoemd), `notes` (korte samenvatting).
4. De teruggegeven velden vullen de bestaande form-inputs. Bestaande waarden worden overschreven; leeg blijft leeg. Toast: _"AI heeft X velden ingevuld — controleer even."_
5. Foutafhandeling:
   - 429 → toast "AI is druk, probeer opnieuw"
   - 402 → toast "AI-credits op — vul credits aan in Instellingen"
   - Overig → toast met foutmelding, form blijft onaangeroerd

### Technisch

- Nieuw bestand `src/lib/leads-ai.functions.ts` met `extractLeadFromText` (`createServerFn` + `requireSupabaseAuth`).
- Gebruikt `createLovableAiGatewayProvider` uit bestaande `src/lib/ai-gateway.server.ts` (of maakt die aan als hij nog niet bestaat).
- `generateText` met `Output.object` + kleine Zod-schema (geen bounds, alleen types + optional).
- Bron-mapping doen we in code na de call: lowercase → matchen op bestaande source-lijst; anders `null`.
- Input: `{ text: string }` (max 8000 chars, korter in code afkappen zodat we schema-bounds vermijden).
- Alleen `src/routes/_authenticated/leads.tsx` `CreateDialog`-component wordt uitgebreid; overige leads-code blijft ongewijzigd.

### Niet in deze stap

- Automatisch opslaan zonder bevestiging — je moet altijd nog op "Opslaan" klikken.
- Bijlagen/afbeeldingen uploaden (alleen tekst plakken).
- AI-invullen in het "Bewerken"-dialog (kan later, als je wil).

### Acceptatie

- Dialog "Nieuwe lead" toont AI-plakveld bovenaan.
- Plakken + klikken vult naam/bedrijf/contact/e-mail/telefoon/bron/waarde in waar de AI die uit de tekst haalt.
- Fouten (rate limit, credits, netwerk) tonen duidelijke toasts.
- Build en lint blijven groen.

Reageer met "start build" of geef aan wat je aangepast wil zien.