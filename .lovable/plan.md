## Cold Outreach v2 — grote uitbreiding

Vier samenhangende verbeteringen aan de bestaande Outreach-module, met nieuwe componenten, server functions en DB-uitbreidingen. RLS-policies blijven org-scoped zoals nu.

### 1. AI-personalisatie per lead

- Nieuwe server fn `personalizeForTarget` die per prospect een opener + body genereert op basis van `outreach_targets.research_summary`, campagne-pitch en gekozen variant.
- Bulk-actie "AI personaliseer geselecteerden" in de leadtabel — schrijft naar nieuwe kolommen `outreach_targets.personalized_subject` / `personalized_body` / `personalized_at`.
- Cron `outreach-sequence` gebruikt eerst personalized velden, valt terug op sequence-step template.
- Knop "Research + Personaliseer" combineert bestaande `researchLead` met nieuwe personalisatie.

### 2. Sequence-builder UX

- Nieuwe component `<SequenceBuilder>` (drag-and-drop met `@dnd-kit/sortable`, al aanwezig).
- Per stap: kanaal (email / linkedin / cold-call / wait), delay (dagen), subject + body met `{{variabelen}}` token-picker, en condities:
  - `if_no_reply` (default)
  - `if_opened`
  - `if_clicked`
  - `stop_on_reply` toggle per stap
- Live preview-paneel rechts (rendert met sample-vars).
- Sla op in bestaande `outreach_campaigns.sequence_steps` (jsonb) — schema breidt uit met `condition` en `wait_days` velden, backwards compatible.
- Nieuw kolom `outreach_campaigns.timezone` + verzendvenster (`send_window_start` / `send_window_end`).

### 3. Inbox & reply management

- Nieuwe route `/_authenticated/outreach/inbox` met unified inbox: alle `outreach_messages` direction=inbound, gegroepeerd per thread (target_id).
- Filters: status (unread/read/snoozed/done), classificatie (positive/interested/needs_followup/...), campagne.
- Per thread: volledige historie, quick-reply box met AI-suggesties (3 varianten via nieuwe `suggestReplyDrafts` server fn), snooze tot datum, "markeer als afspraak ingepland" → maakt `crm_activities` rij.
- Nieuwe kolommen `outreach_messages`: `read_at`, `snooze_until`, `handled_at`, `handled_by`.
- Realtime updates via Supabase channel op `outreach_messages`.
- Sidebar krijgt unread badge.

### 4. Analytics & A/B inzichten

- Nieuwe tab "Analytics" op outreach-pagina met KPI-cards: verzonden, open rate, reply rate, positive reply rate, geboekte gesprekken — per gekozen tijdvenster (7/30/90 dagen).
- Per-campagne tabel met dezelfde metrics + winnaar-variant.
- Per-variant breakdown (uit `outreach_campaigns.pitch_variants`): impressions, replies, positive %, met confidence-indicator.
- Per-stap funnel (welke stap genereert reacties).
- Voor open/click tracking: nieuwe kolommen `outreach_messages.opened_at`, `clicked_at` + nieuwe publieke route `/api/public/hooks/outreach-track/:type/:logId` (1x1 pixel voor open, redirect voor click), gesigneerd met HMAC over logId. Email HTML krijgt automatisch tracking-pixel + link-rewriting bij verzenden.

### Technische uitwerking

**DB-migration** (één migration):

```sql
ALTER TABLE public.outreach_targets
  ADD COLUMN personalized_subject text,
  ADD COLUMN personalized_body text,
  ADD COLUMN personalized_at timestamptz,
  ADD COLUMN active_variant_id text;

ALTER TABLE public.outreach_campaigns
  ADD COLUMN timezone text DEFAULT 'Europe/Amsterdam',
  ADD COLUMN send_window_start smallint DEFAULT 8,
  ADD COLUMN send_window_end smallint DEFAULT 18;

ALTER TABLE public.outreach_messages
  ADD COLUMN read_at timestamptz,
  ADD COLUMN snooze_until timestamptz,
  ADD COLUMN handled_at timestamptz,
  ADD COLUMN handled_by uuid,
  ADD COLUMN opened_at timestamptz,
  ADD COLUMN clicked_at timestamptz,
  ADD COLUMN variant_id text;

CREATE INDEX IF NOT EXISTS idx_outreach_messages_inbox
  ON public.outreach_messages(organization_id, direction, received_at DESC)
  WHERE direction = 'inbound';
```

**Nieuwe / aangepaste bestanden**

- `src/lib/outreach.functions.ts` — `personalizeForTarget`, `bulkPersonalize`, `suggestReplyDrafts`, `markMessageHandled`, `snoozeMessage`.
- `src/lib/outreach-tracking.ts` — HMAC helpers, link-rewriting.
- `src/routes/api/public/hooks/outreach-track.$type.$id.ts` — pixel + click redirect.
- `src/routes/api/public/hooks/outreach-sequence.ts` — uitgebreid met send-window respect, personalized fallback, conditional steps, tracking-injection.
- `src/routes/_authenticated/outreach.inbox.tsx` — nieuwe inbox-route.
- `src/components/outreach/sequence-builder.tsx` — drag-drop editor.
- `src/components/outreach/analytics-tab.tsx` — KPI dashboard.
- `src/components/outreach/inbox-thread.tsx` — thread-view met reply-box.
- `src/routes/_authenticated/outreach.index.tsx` — nieuwe tabs (Pipeline / Campagnes / Analytics), gebruikt nieuwe builder/components.
- `src/components/app-sidebar.tsx` — unread badge voor inbox.

**Tracking-secret**: hergebruikt `CRON_SECRET` voor HMAC; geen nieuwe secret.

### Scope-grenzen (uitgesloten)

- Geen LinkedIn-automation (alleen handmatig afvinken).
- Geen calendaring-integratie (alleen "afspraak ingepland" toggle).
- Geen multi-mailbox / dedicated IP setup — `OUTREACH_FROM_EMAIL` blijft enkele bron.
