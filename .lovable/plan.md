
# Koppeling portalen → automatisch facturen & offertes (AI van Columbus)

## Doel (zoals jij het beschrijft)

Als jij in **Columbus Portaal** of **inzet.nl** iets aanklikt dat factureerbaar is (bv. "afsluiten opdracht", "kandidaat geplaatst", "abonnement geactiveerd"), dan verschijnt hier **automatisch**:

- Een **factuur** in Administratie/Boekhouding (klaar om te versturen of al verstuurd)
- Of een **offerte** in Offerte Studio (voor de "wil je hier akkoord op?"-flow)

Plus: klanten/contacten uit die portalen worden **eenmalig aangemaakt en daarna hergebruikt** (geen dubbele klanten).

Uit **gosherloq.com** neem ik alleen visuele/UX-inspiratie mee (zie stap 5) — géén data-koppeling, want dat is een outreach-tool, geen bron van facturen/kandidaten.

## 1. Hoe de trigger werkt (belangrijkste beslissing)

De sleutel: **wie start de facturatie?** Er zijn twee opties, en we bouwen ze allebei zodat het portaal mag kiezen.

### A. Portaal pusht (voorkeur, real-time)
Columbus/inzet stuurt een webhook naar dit systeem zodra iets factureerbaar wordt:

```text
POST https://project--0addc860-2162-4de8-8a00-3906ef74a397.lovable.app/api/public/hooks/portaal-billable
{
  "source": "columbus_portaal",
  "event":  "invoice.ready" | "quote.requested",
  "external_id": "COL-2026-00123",
  "client": { "name": "...", "kvk": "...", "email": "..." },
  "lines":  [ { "description": "...", "qty": 1, "unit_price_cents": 12500, "vat_rate": 21 } ],
  "meta":   { "portal_url": "https://..." }
}
```

Ondertekend met HMAC + secret (`PORTAL_WEBHOOK_SECRET`) zodat niemand anders kan pushen.

### B. Wij pollen (fallback als portaal geen webhook heeft)
`pg_cron` roept elke 5 min een sync-endpoint aan → wij halen "nieuwe factureerbare items sinds X" op via API-key.

### C. Handmatige knop in het portaal (als bruikbaar tussenpad)
Kleine bookmarklet / knop "→ Stuur naar AI van Columbus" die dezelfde webhook-call doet met 1 klik.

## 2. Wat er hier automatisch gebeurt bij ontvangst

Server route `/api/public/hooks/portaal-billable` (nieuw) draait deze pipeline:

```text
1. Verifieer HMAC-signature + secret
2. Upsert klant in `clients`  (match op external_id, anders op kvk of email)
3. Bepaal type:
    - event = quote.requested  → nieuwe rij in `quotes` + regels in `quote_lines`
                                  status = "draft" of "sent"
    - event = invoice.ready    → nieuwe rij in `invoices` + `invoice_lines`
                                  roept `post_invoice_journal()` aan → boekt in `journal_entries`
4. Bewaar external_source + external_id + link naar portaal (deep-link knop in UI)
5. Realtime broadcast → dashboards updaten meteen
6. Log in `accountant_sync_events` (bestaat al) voor audit
```

De bestaande functie `post_invoice_journal()` doet al de boekhouding — hoeven we niet opnieuw uit te vinden.

## 3. Nieuwe UI — één centrale pagina: "Koppelingen"

Onder AI-Columbus → **Instellingen → Koppelingen**. Layout:

```text
┌── Columbus Portaal ──────────────────┐
│ Status: 🟢 Actief · Laatste sync: 2m │
│ Webhook URL: [kopieer]  Secret: [◉◉] │
│ API-key: [◉◉◉◉]  [Test verbinding]   │
│ Automatisch aanmaken:                │
│   ☑ Facturen   ☑ Offertes  ☑ Klanten │
│ Laatste 5 events:                    │
│   • Factuur COL-123  → betaald  →   │
│   • Offerte COL-124  → verstuurd →  │
│ [Bekijk alle events]                 │
└──────────────────────────────────────┘
```

Zelfde kaart voor inzet.nl. Elke rij heeft een "🔗 open in portaal"-link én "👁 open hier".

## 4. Data-mapping

| Bron event | Wordt hier | Belangrijke velden |
|---|---|---|
| Columbus `invoice.ready` | `invoices` + `invoice_lines` + journaalpost | external_id, client, lines, vat, total, due_date |
| Columbus `quote.requested` | `quotes` + `quote_lines` | zelfde + geldig_tot |
| Columbus `client.updated` | `clients` (upsert) | naam, kvk, btw, adres, contact |
| inzet.nl `placement.confirmed` | `invoices` (op basis van tarief × uren) | kandidaat, klant, uren, tarief |
| inzet.nl `candidate.new` | `leads` | naam, email, telefoon, rol |
| inzet.nl `client.updated` | `clients` | zelfde als Columbus |

Nieuwe kolommen (kleine migratie): `external_source text`, `external_id text`, `external_url text` op `invoices`, `quotes`, `clients`, `leads`. Uniek-index op `(external_source, external_id)` per tabel → **nooit dubbele import**.

## 5. UI-inspiratie die ik meeneem

Uit je screenshots (Columbus admin, inzet.nl, gosherloq):
- **Oranje-op-donker accent** (Columbus / inzet) → hergebruiken voor "Koppelingen"-kaarten en sync-status-badges. Sluit aan bij je huidige stijl.
- **Zachte pill-navigatie + grote CTA-knop met pijl** (gosherloq) → toepassen op de "Verbind portaal" / "Nu synchroniseren" knoppen in de nieuwe pagina.
- **Rustig lichtbeige achtergrond met donkergroene accenten** (gosherloq) → **niet** overnemen — botst met je huidige donkere/oranje stijl. Alleen de knopvorm.

## 6. Wat we nu al kunnen bouwen zonder API van de portalen

Ook zonder dat Columbus/inzet API-toegang hebben, kunnen we **stap 1** meteen bruikbaar maken:
- Webhook-endpoint + secret klaarzetten → jij plakt de URL in het portaal (als het "outgoing webhooks" ondersteunt) → werkt direct.
- Handmatige import (CSV / UBL-XML / JSON-plak-vak) op dezelfde pagina → jij download uit portaal, sleept hier naar binnen → 1 klik → factuur/offerte staat er.

## 7. Uitrol in stappen

1. **Migratie**: kolommen `external_source/id/url` + uniek-index op alle 4 tabellen; nieuwe tabel `integration_events` voor audit-log.
2. **Server route** `/api/public/hooks/portaal-billable` (HMAC-check + pipeline uit stap 2).
3. **Pagina Koppelingen** met beide kaarten, secret-generator, handmatige import (CSV/UBL/JSON).
4. **Secrets** via `add_secret`: `PORTAL_WEBHOOK_SECRET`, later `COLUMBUS_PORTAAL_API_KEY`, `INZET_NL_API_KEY`.
5. **Pollen** via `pg_cron` (5 min) — pas aanzetten als API-keys er zijn.
6. **Realtime**: `ALTER PUBLICATION supabase_realtime ADD TABLE invoices, quotes, clients, leads;` → dashboards updaten live wanneer portaal iets duwt.

## 8. Wat ik van jou nodig heb voor stap 4+

- Columbus Portaal: kun je in de admin een **outgoing webhook** invullen, of moeten we via API pollen? (of allebei)
- Zelfde vraag voor inzet.nl.
- Eén voorbeeld-payload of API-doc per portaal → dan zet ik de mapping vast.
- Bevestiging: bij event `invoice.ready` moet ik de factuur meteen **als concept** aanmaken, of direct **versturen naar klant** (met PDF + email)?

## Uit scope (voor nu)

- Terug-schrijven naar de portalen (2-way sync) — pas later, als richting 1 werkt.
- Sherloq/gosherloq data-koppeling — geen bron van facturen.
- Nieuwe boekhoudlogica — we gebruiken de bestaande `post_invoice_journal()`.

Geef aan of dit plan klopt (met name **stap 1: welke trigger — webhook, poll of handmatig?**) en of ik na jouw akkoord met stap 1–3 mag beginnen; stap 4+ pas als je API-info aanlevert.
