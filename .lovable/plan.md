## Multi-tenant Partner Portal — Implementatieplan

Groot project. Ik stel voor het in 6 fases te bouwen, met na elke fase een werkend resultaat zodat we kunnen bijsturen. Hieronder de scope per fase + een paar keuzes die ik graag eerst bevestig.

---

### Te bevestigen voor ik begin

1. **Bestaande data** — er zijn al tabellen `leads`, `clients`, `user_roles` (zonder `organization_id`). Mag ik die migreren? Alle bestaande leads en rollen koppel ik dan standaard aan **AI van Columbus** (huidige situatie). Akkoord?
2. **Holding-admin** — wordt je huidige admin (`ah.hogervorst@gmail.com`) automatisch `holding_admin` voor beide organisaties?
3. **Mollie & Telnyx** — alleen mock/stubs in deze ronde (geen echte API keys nodig), correct?
4. **AI Assistant** — alleen UI-panel met placeholders, of meteen koppelen aan Lovable AI Gateway (Gemini gratis tot 6 okt)?

---

### Fase 1 — Database & multi-tenancy fundering
- Migratie: `organizations` tabel + seed "AI van Columbus" en "Netqloud"
- `user_roles` uitbreiden met `organization_id` + nieuwe enum `holding_admin` / `company_staff`
- `leads.organization_id` toevoegen (backfill → AI van Columbus)
- Nieuwe tabellen: `quotes`, `invoices` (met per-org invoice nummering)
- RLS-policies via `has_org_access(user, org)` security-definer functie — strikte scheiding
- GRANTs + update-triggers per tabel

### Fase 2 — Workspace context & taal
- `WorkspaceProvider` (currentOrganizationId, currentLanguage NL/EN, persistent in localStorage)
- Org-switcher dropdown in header (alleen zichtbaar voor holding_admin)
- i18n setup met `react-i18next` — NL = default, EN secundair
- Taalswitch in header; alle bestaande UI-strings naar vertaalbestanden

### Fase 3 — Lead funnel kanban
- Nieuwe route `/leads` (per-org gefilterd via context)
- Kanban met 5 kolommen (Nieuw, Contact opgenomen, Offerte verzonden, Gewonnen, Verloren)
- Drag & drop via `@dnd-kit` (al populair, lichtgewicht) — status update naar DB
- Bestaande lead-stages map ik naar de nieuwe set

### Fase 4 — Quotes & invoices
- Quote-builder: titel, regels (line items in JSON), totaal, status
- Per-org template/branding (logo, kleur, prefix) uit `organizations`
- Invoice nummering: sequence per org via DB-functie `next_invoice_number(org_id)`
- Stub hooks `useAccountingSync()` en `useTelnyxWebhook()` (lege implementaties met TODO)

### Fase 5 — Publieke accept-pagina + Mollie mock
- Publieke route `/accept/quote/:id` (geen auth, RLS policy "select via signed token")
- Canvas-handtekening component (react-signature-canvas of eigen canvas)
- "Sign & Pay" → mock Mollie iDEAL flow → status `approved_paid` → auto invoice aanmaken via server function

### Fase 6 — AI Assistant paneel
- Side-panel component met context-aware suggesties
- Placeholders: "Genereer offerte uit lead-notities", "Controleer factuurregels"
- Hook-structuur klaar voor Lovable AI / OpenAI / Anthropic

---

### Technische details
- TanStack Start server functions voor alle writes (RLS via `requireSupabaseAuth`)
- Publieke quote-route gebruikt server-publishable client + signed-token policy
- Mollie/Telnyx als stub server fns die nu een mock-response teruggeven
- i18n: `react-i18next` + `i18next-browser-languagedetector`
- Kanban: `@dnd-kit/core` + `@dnd-kit/sortable`

---

### Voorstel
Mag ik **Fase 1 + 2** in deze ronde bouwen (fundering + tenant switching + taal)? Dat is ~1 grote migratie + ~10 bestanden. Daarna laat ik je testen en gaan we per fase verder. Zo voorkomen we een onoverzichtelijke berg wijzigingen in één keer.

Of geef aan welke fases je in welke volgorde wilt.