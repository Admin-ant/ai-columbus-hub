import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function aiJson(system: string, user: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ontbreekt");
  const res = await fetch(LOVABLE_GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`AI error ${res.status}`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content ?? "";
}

async function sendViaResend(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>;
}): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY ontbreekt — voeg toe in projectinstellingen");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      reply_to: opts.replyTo,
      headers: opts.headers,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as { id: string };
}

/* -------------------------------------------------------------------------- */
/* CSV bulk import                                                            */
/* -------------------------------------------------------------------------- */

const CSV_IMPORT_SCHEMA = z.object({
  campaign_id: z.string().uuid().nullable().optional(),
  organization_id: z.string().uuid(),
  rows: z
    .array(
      z.object({
        company: z.string().min(1).max(200),
        contact_name: z.string().max(200).optional().nullable(),
        email: z.string().email().optional().nullable(),
        phone: z.string().max(60).optional().nullable(),
        linkedin_url: z.string().max(400).optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
      }),
    )
    .min(1)
    .max(500),
});

export const bulkImportTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CSV_IMPORT_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    const payload = data.rows.map((r) => ({
      organization_id: data.organization_id,
      campaign_id: data.campaign_id ?? null,
      company: r.company,
      contact_name: r.contact_name ?? null,
      email: r.email ?? null,
      phone: r.phone ?? null,
      linkedin_url: r.linkedin_url ?? null,
      notes: r.notes ?? null,
      stage: "nieuw",
    }));
    const { error, count } = await context.supabase
      .from("outreach_targets")
      .insert(payload as never, { count: "exact" });
    if (error) throw new Error(error.message);
    return { inserted: count ?? payload.length };
  });

/* -------------------------------------------------------------------------- */
/* Send single email (manual or sequence step)                                */
/* -------------------------------------------------------------------------- */

const SEND_SCHEMA = z.object({
  target_id: z.string().uuid(),
  step_index: z.number().int().min(0).max(20).optional(),
  override_subject: z.string().max(300).optional(),
  override_body: z.string().max(8000).optional(),
  from_email: z.string().email().optional(),
  from_name: z.string().max(120).optional(),
});

function renderBody(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

export const sendOutreachEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SEND_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    const { data: target, error: tErr } = await context.supabase
      .from("outreach_targets")
      .select("*")
      .eq("id", data.target_id)
      .single();
    if (tErr || !target) throw new Error(tErr?.message ?? "Prospect niet gevonden");
    const t = target as {
      id: string;
      organization_id: string;
      campaign_id: string | null;
      company: string;
      contact_name: string | null;
      email: string | null;
      sequence_step_index: number;
    };
    if (!t.email) throw new Error("Prospect heeft geen e-mailadres");

    let subject = data.override_subject ?? "";
    let body = data.override_body ?? "";
    const stepIndex = data.step_index ?? t.sequence_step_index ?? 0;

    if (t.campaign_id && (!subject || !body)) {
      const { data: camp } = await context.supabase
        .from("outreach_campaigns")
        .select("name, sequence_steps")
        .eq("id", t.campaign_id)
        .single();
      const steps = ((camp as { sequence_steps?: Array<{ subject?: string; body: string }> } | null)
        ?.sequence_steps ?? []) as Array<{ subject?: string; body: string }>;
      const step = steps[stepIndex];
      if (step) {
        subject ||= step.subject ?? `Even kort, ${t.company}`;
        body ||= step.body;
      }
    }
    if (!subject) subject = `Even kort, ${t.company}`;
    if (!body) body = `Hi ${t.contact_name ?? t.company},\n\nIk wilde je graag iets voorleggen.\n\nGroet`;

    const vars = {
      company: t.company,
      contact_name: t.contact_name ?? t.company,
    };
    body = renderBody(body, vars);
    subject = renderBody(subject, vars);
    const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;white-space:pre-wrap">${body.replace(/</g, "&lt;")}</div>`;

    const from =
      data.from_email && data.from_name
        ? `${data.from_name} <${data.from_email}>`
        : data.from_email ?? "outreach@resend.dev";

    // log queued
    const { data: logRow, error: logErr } = await context.supabase
      .from("outreach_messages")
      .insert({
        organization_id: t.organization_id,
        target_id: t.id,
        campaign_id: t.campaign_id,
        channel: "email",
        direction: "outbound",
        step_index: stepIndex,
        subject,
        body,
        status: "queued",
      } as never)
      .select("id")
      .single();
    if (logErr || !logRow) throw new Error(logErr?.message ?? "Log mislukt");

    try {
      const r = await sendViaResend({
        from,
        to: t.email,
        subject,
        html,
        headers: { "X-Outreach-Message-Id": (logRow as { id: string }).id },
      });
      await context.supabase
        .from("outreach_messages")
        .update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: r.id } as never)
        .eq("id", (logRow as { id: string }).id);
      await context.supabase
        .from("outreach_targets")
        .update({
          last_message_at: new Date().toISOString(),
          last_contact_at: new Date().toISOString(),
          sequence_step_index: stepIndex + 1,
          stage: target.stage === "nieuw" ? "aangeschreven" : target.stage,
        } as never)
        .eq("id", t.id);
      return { ok: true, message_id: r.id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await context.supabase
        .from("outreach_messages")
        .update({ status: "failed", error: msg } as never)
        .eq("id", (logRow as { id: string }).id);
      throw new Error(msg);
    }
  });

/* -------------------------------------------------------------------------- */
/* Schedule sequence (sets next_send_at)                                      */
/* -------------------------------------------------------------------------- */

const SCHEDULE_SCHEMA = z.object({
  target_id: z.string().uuid(),
  start_in_minutes: z.number().int().min(0).max(60 * 24 * 30).default(0),
});

export const scheduleSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SCHEDULE_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    const when = new Date(Date.now() + data.start_in_minutes * 60_000).toISOString();
    const { error } = await context.supabase
      .from("outreach_targets")
      .update({ next_send_at: when, paused: false, sequence_step_index: 0 } as never)
      .eq("id", data.target_id);
    if (error) throw new Error(error.message);
    return { scheduled_at: when };
  });

/* -------------------------------------------------------------------------- */
/* Classify reply (AI)                                                        */
/* -------------------------------------------------------------------------- */

const CLASSIFY_SCHEMA = z.object({
  message_id: z.string().uuid(),
});

export const classifyReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CLASSIFY_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    const { data: msg, error } = await context.supabase
      .from("outreach_messages")
      .select("id, body, target_id")
      .eq("id", data.message_id)
      .single();
    if (error || !msg) throw new Error(error?.message ?? "Bericht niet gevonden");
    const m = msg as { id: string; body: string | null; target_id: string };
    const raw = await aiJson(
      `Classificeer een inkomende e-mailreactie op een cold outreach. Antwoord met JSON: {"label":"positive|interested|needs_followup|not_now|negative|unsubscribe","sentiment":"positive|neutral|negative","summary":string}`,
      `Reactie:\n${m.body ?? ""}`,
    );
    type R = { label: string; sentiment: string; summary: string };
    const parsed = JSON.parse(raw) as R;
    await context.supabase
      .from("outreach_messages")
      .update({ reply_classification: parsed.label, sentiment: parsed.sentiment } as never)
      .eq("id", m.id);
    await context.supabase
      .from("outreach_targets")
      .update({
        reply_classification: parsed.label,
        stage:
          parsed.label === "positive" || parsed.label === "interested"
            ? "gesprek"
            : parsed.label === "negative" || parsed.label === "unsubscribe"
              ? "verloren"
              : "reactie",
        paused: parsed.label === "unsubscribe" || parsed.label === "negative",
      } as never)
      .eq("id", m.target_id);
    return parsed;
  });

/* -------------------------------------------------------------------------- */
/* AI personalization per target                                              */
/* -------------------------------------------------------------------------- */

const PERSONALIZE_SCHEMA = z.object({
  target_id: z.string().uuid(),
  variant_id: z.string().optional(),
});

export const personalizeForTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PERSONALIZE_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    const { data: t, error } = await context.supabase
      .from("outreach_targets")
      .select(
        "id, company, contact_name, email, notes, research_summary, campaign_id, active_variant_id",
      )
      .eq("id", data.target_id)
      .single();
    if (error || !t) throw new Error(error?.message ?? "Prospect niet gevonden");
    const target = t as {
      id: string;
      company: string;
      contact_name: string | null;
      notes: string | null;
      research_summary: string | null;
      campaign_id: string | null;
      active_variant_id: string | null;
    };

    let pitch = "";
    let chosenVariantId = data.variant_id ?? target.active_variant_id ?? null;
    if (target.campaign_id) {
      const { data: c } = await context.supabase
        .from("outreach_campaigns")
        .select("name, goal, ai_pitch, pitch_variants")
        .eq("id", target.campaign_id)
        .single();
      const camp = c as
        | {
            name: string;
            goal: string | null;
            ai_pitch: string | null;
            pitch_variants:
              | Array<{ id: string; label?: string; subject?: string; body?: string }>
              | null;
          }
        | null;
      if (camp) {
        const variants = camp.pitch_variants ?? [];
        const chosen = chosenVariantId
          ? variants.find((v) => v.id === chosenVariantId)
          : variants[0];
        chosenVariantId = chosen?.id ?? chosenVariantId;
        pitch = [
          chosen?.subject ? `Onderwerp-richting: ${chosen.subject}` : "",
          chosen?.body ? `Basis-pitch:\n${chosen.body}` : camp.ai_pitch ?? "",
          camp.goal ? `Doel: ${camp.goal}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");
      }
    }

    const system = `Je bent een senior B2B cold-outreach copywriter. Schrijf in het Nederlands, jij-vorm, kort en direct.
Lever JSON terug: {"subject": string, "body": string}.
Regels:
- Subject max 60 tekens, geen clickbait, geen all-caps.
- Body 80-130 woorden, max 3 alinea's, eindigt met 1 concrete vraag of CTA.
- Verwijs minstens 1x naar iets specifieks uit de research/notities (geen generieke flatterij).
- Geen markdown, geen emojis, geen handtekening (die wordt later toegevoegd).`;

    const user = `Bedrijf: ${target.company}
Contact: ${target.contact_name ?? "(onbekend)"}
Notities: ${target.notes ?? "—"}
Research:
${target.research_summary ?? "(geen research beschikbaar)"}

Campagne context:
${pitch || "(geen pitch context)"}`;

    const raw = await aiJson(system, user);
    let parsed: { subject: string; body: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("AI antwoord onleesbaar");
    }
    if (!parsed.subject || !parsed.body) throw new Error("AI leverde onvolledige output");

    const { error: upErr } = await context.supabase
      .from("outreach_targets")
      .update({
        personalized_subject: parsed.subject.slice(0, 200),
        personalized_body: parsed.body,
        personalized_at: new Date().toISOString(),
        active_variant_id: chosenVariantId,
      } as never)
      .eq("id", target.id);
    if (upErr) throw new Error(upErr.message);

    return { subject: parsed.subject, body: parsed.body, variant_id: chosenVariantId };
  });

const BULK_PERSONALIZE_SCHEMA = z.object({
  target_ids: z.array(z.string().uuid()).min(1).max(50),
});

export const bulkPersonalize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => BULK_PERSONALIZE_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    let ok = 0;
    let failed = 0;
    for (const id of data.target_ids) {
      try {
        await personalizeForTargetInline(id, context);
        ok++;
      } catch {
        failed++;
      }
    }
    return { personalized: ok, failed };
  });

// helper extracted so bulk can call without re-validating
async function personalizeForTargetInline(
  targetId: string,
  context: { supabase: import("@supabase/supabase-js").SupabaseClient },
) {
  const { data: t } = await context.supabase
    .from("outreach_targets")
    .select(
      "id, company, contact_name, notes, research_summary, campaign_id, active_variant_id",
    )
    .eq("id", targetId)
    .single();
  if (!t) return;
  const target = t as {
    id: string;
    company: string;
    contact_name: string | null;
    notes: string | null;
    research_summary: string | null;
    campaign_id: string | null;
    active_variant_id: string | null;
  };
  let pitch = "";
  let chosenVariantId = target.active_variant_id;
  if (target.campaign_id) {
    const { data: c } = await context.supabase
      .from("outreach_campaigns")
      .select("name, goal, ai_pitch, pitch_variants")
      .eq("id", target.campaign_id)
      .single();
    const camp = c as
      | {
          goal: string | null;
          ai_pitch: string | null;
          pitch_variants: Array<{ id: string; subject?: string; body?: string }> | null;
        }
      | null;
    if (camp) {
      const variants = camp.pitch_variants ?? [];
      const chosen = chosenVariantId
        ? variants.find((v) => v.id === chosenVariantId)
        : variants[Math.floor(Math.random() * Math.max(1, variants.length))];
      chosenVariantId = chosen?.id ?? chosenVariantId;
      pitch = [
        chosen?.subject ? `Onderwerp-richting: ${chosen.subject}` : "",
        chosen?.body ? `Basis-pitch:\n${chosen.body}` : camp.ai_pitch ?? "",
        camp.goal ? `Doel: ${camp.goal}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    }
  }
  const raw = await aiJson(
    `Senior NL B2B cold-outreach copywriter. JSON: {"subject":string,"body":string}. Subject<=60 tekens. Body 80-130 woorden, 1 CTA, refereer iets specifieks uit research/notities.`,
    `Bedrijf: ${target.company}\nContact: ${target.contact_name ?? "—"}\nNotities: ${target.notes ?? "—"}\nResearch:\n${target.research_summary ?? "—"}\n\nPitch:\n${pitch}`,
  );
  const parsed = JSON.parse(raw) as { subject: string; body: string };
  if (!parsed.subject || !parsed.body) return;
  await context.supabase
    .from("outreach_targets")
    .update({
      personalized_subject: parsed.subject.slice(0, 200),
      personalized_body: parsed.body,
      personalized_at: new Date().toISOString(),
      active_variant_id: chosenVariantId,
    } as never)
    .eq("id", target.id);
}

/* -------------------------------------------------------------------------- */
/* AI reply drafts                                                            */
/* -------------------------------------------------------------------------- */

const SUGGEST_SCHEMA = z.object({
  message_id: z.string().uuid(),
  tone: z.enum(["kort", "warm", "zakelijk", "afwijzend"]).optional(),
});

export const suggestReplyDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SUGGEST_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    const { data: msg } = await context.supabase
      .from("outreach_messages")
      .select("id, body, subject, target_id")
      .eq("id", data.message_id)
      .single();
    if (!msg) throw new Error("Bericht niet gevonden");
    const m = msg as { body: string | null; subject: string | null; target_id: string };
    const { data: t } = await context.supabase
      .from("outreach_targets")
      .select("company, contact_name")
      .eq("id", m.target_id)
      .single();
    const target = t as { company: string; contact_name: string | null } | null;
    const tone = data.tone ?? "warm";

    const raw = await aiJson(
      `Je bent NL B2B sales assistent. Genereer 3 verschillende reply-drafts op een inkomende prospect-reactie.
Toon: ${tone}. JSON array: [{"label":string,"body":string}]. Body max 100 woorden, geen handtekening, geen markdown.`,
      `Prospect: ${target?.contact_name ?? target?.company ?? "—"} (${target?.company ?? ""})
Originele subject: ${m.subject ?? "—"}
Hun bericht:
${m.body ?? ""}`,
    );
    let arr: Array<{ label: string; body: string }>;
    try {
      const p = JSON.parse(raw) as unknown;
      arr = Array.isArray(p)
        ? (p as Array<{ label: string; body: string }>)
        : ((p as { drafts?: Array<{ label: string; body: string }> }).drafts ?? []);
    } catch {
      throw new Error("AI antwoord onleesbaar");
    }
    return { drafts: arr.slice(0, 3) };
  });

/* -------------------------------------------------------------------------- */
/* Inbox actions                                                              */
/* -------------------------------------------------------------------------- */

export const markMessageRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ message_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("outreach_messages")
      .update({ read_at: new Date().toISOString() } as never)
      .eq("id", data.message_id)
      .is("read_at", null);
    return { ok: true };
  });

export const markMessageHandled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        message_id: z.string().uuid(),
        booked_meeting: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: msg } = await context.supabase
      .from("outreach_messages")
      .select("id, organization_id, target_id")
      .eq("id", data.message_id)
      .single();
    if (!msg) throw new Error("Bericht niet gevonden");
    const m = msg as { id: string; organization_id: string; target_id: string };
    await context.supabase
      .from("outreach_messages")
      .update({
        handled_at: new Date().toISOString(),
        handled_by: context.userId,
        read_at: new Date().toISOString(),
      } as never)
      .eq("id", m.id);
    if (data.booked_meeting) {
      await context.supabase
        .from("outreach_targets")
        .update({ stage: "gesprek" } as never)
        .eq("id", m.target_id);
      const { data: target } = await context.supabase
        .from("outreach_targets")
        .select("company, contact_name")
        .eq("id", m.target_id)
        .single();
      const tgt = target as { company: string; contact_name: string | null } | null;
      await context.supabase.from("crm_activities").insert({
        organization_id: m.organization_id,
        kind: "meeting",
        title: `Afspraak met ${tgt?.contact_name ?? tgt?.company ?? "prospect"}`,
        body: "Aangemaakt vanuit cold-outreach inbox",
        target_id: m.target_id,
        created_by: context.userId,
      } as never);
    }
    return { ok: true };
  });

export const snoozeMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        message_id: z.string().uuid(),
        until: z.string().datetime(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("outreach_messages")
      .update({ snooze_until: data.until } as never)
      .eq("id", data.message_id);
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/* Analytics aggregations                                                     */
/* -------------------------------------------------------------------------- */

export const getOutreachAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organization_id: z.string().uuid(),
        days: z.number().int().min(1).max(365).default(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("outreach_messages")
      .select(
        "id, direction, status, sent_at, opened_at, clicked_at, received_at, reply_classification, campaign_id, step_index, variant_id, created_at",
      )
      .eq("organization_id", data.organization_id)
      .gte("created_at", since);
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Array<{
      id: string;
      direction: string;
      status: string | null;
      sent_at: string | null;
      opened_at: string | null;
      clicked_at: string | null;
      reply_classification: string | null;
      campaign_id: string | null;
      step_index: number | null;
      variant_id: string | null;
    }>;

    const out = list.filter((r) => r.direction === "outbound");
    const sent = out.filter((r) => r.status === "sent").length;
    const opened = out.filter((r) => r.opened_at).length;
    const clicked = out.filter((r) => r.clicked_at).length;
    const replies = list.filter((r) => r.direction === "inbound").length;
    const positive = list.filter(
      (r) =>
        r.direction === "inbound" &&
        (r.reply_classification === "positive" || r.reply_classification === "interested"),
    ).length;

    const byCampaign = new Map<
      string,
      { sent: number; opened: number; clicked: number; replies: number; positive: number }
    >();
    const ensure = (k: string) => {
      let v = byCampaign.get(k);
      if (!v) {
        v = { sent: 0, opened: 0, clicked: 0, replies: 0, positive: 0 };
        byCampaign.set(k, v);
      }
      return v;
    };
    for (const r of list) {
      const k = r.campaign_id ?? "—";
      const c = ensure(k);
      if (r.direction === "outbound" && r.status === "sent") c.sent++;
      if (r.direction === "outbound" && r.opened_at) c.opened++;
      if (r.direction === "outbound" && r.clicked_at) c.clicked++;
      if (r.direction === "inbound") c.replies++;
      if (
        r.direction === "inbound" &&
        (r.reply_classification === "positive" || r.reply_classification === "interested")
      )
        c.positive++;
    }

    const byVariant = new Map<
      string,
      { sent: number; replies: number; positive: number }
    >();
    for (const r of out) {
      const k = r.variant_id ?? "default";
      let v = byVariant.get(k);
      if (!v) {
        v = { sent: 0, replies: 0, positive: 0 };
        byVariant.set(k, v);
      }
      if (r.status === "sent") v.sent++;
    }
    // attribute inbound replies via target -> last outbound variant — simplified: per campaign
    for (const r of list.filter((x) => x.direction === "inbound")) {
      const k = r.variant_id ?? "default";
      let v = byVariant.get(k);
      if (!v) {
        v = { sent: 0, replies: 0, positive: 0 };
        byVariant.set(k, v);
      }
      v.replies++;
      if (r.reply_classification === "positive" || r.reply_classification === "interested")
        v.positive++;
    }

    const byStep = new Map<number, { sent: number; replies: number }>();
    for (const r of out) {
      const k = r.step_index ?? 0;
      let v = byStep.get(k);
      if (!v) {
        v = { sent: 0, replies: 0 };
        byStep.set(k, v);
      }
      if (r.status === "sent") v.sent++;
    }
    for (const r of list.filter((x) => x.direction === "inbound" && x.step_index != null)) {
      const k = r.step_index ?? 0;
      let v = byStep.get(k);
      if (!v) {
        v = { sent: 0, replies: 0 };
        byStep.set(k, v);
      }
      v.replies++;
    }

    return {
      totals: { sent, opened, clicked, replies, positive },
      rates: {
        open: sent ? Math.round((opened / sent) * 100) : 0,
        click: sent ? Math.round((clicked / sent) * 100) : 0,
        reply: sent ? Math.round((replies / sent) * 100) : 0,
        positive: sent ? Math.round((positive / sent) * 100) : 0,
      },
      by_campaign: Array.from(byCampaign.entries()).map(([id, v]) => ({ campaign_id: id, ...v })),
      by_variant: Array.from(byVariant.entries()).map(([id, v]) => ({ variant_id: id, ...v })),
      by_step: Array.from(byStep.entries())
        .map(([step, v]) => ({ step, ...v }))
        .sort((a, b) => a.step - b.step),
    };
  });

/* -------------------------------------------------------------------------- */
/* Manual reply send (inbox)                                                  */
/* -------------------------------------------------------------------------- */

export const sendInboxReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        in_reply_to_message_id: z.string().uuid(),
        subject: z.string().min(1).max(300),
        body: z.string().min(1).max(8000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: orig } = await context.supabase
      .from("outreach_messages")
      .select("id, organization_id, target_id, campaign_id")
      .eq("id", data.in_reply_to_message_id)
      .single();
    if (!orig) throw new Error("Origineel bericht niet gevonden");
    const o = orig as {
      organization_id: string;
      target_id: string;
      campaign_id: string | null;
    };
    const { data: t } = await context.supabase
      .from("outreach_targets")
      .select("email, company, contact_name")
      .eq("id", o.target_id)
      .single();
    const target = t as { email: string | null; company: string; contact_name: string | null } | null;
    if (!target?.email) throw new Error("Prospect heeft geen e-mailadres");

    const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;white-space:pre-wrap">${data.body.replace(/</g, "&lt;")}</div>`;
    const from = process.env.OUTREACH_FROM_EMAIL ?? "outreach@resend.dev";

    const { data: logRow } = await context.supabase
      .from("outreach_messages")
      .insert({
        organization_id: o.organization_id,
        target_id: o.target_id,
        campaign_id: o.campaign_id,
        channel: "email",
        direction: "outbound",
        subject: data.subject,
        body: data.body,
        status: "queued",
      } as never)
      .select("id")
      .single();
    const logId = (logRow as { id: string } | null)?.id;
    if (!logId) throw new Error("Log mislukt");

    try {
      const r = await sendViaResend({
        from,
        to: target.email,
        subject: data.subject,
        html,
        headers: { "X-Outreach-Message-Id": logId },
      });
      await context.supabase
        .from("outreach_messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: r.id,
        } as never)
        .eq("id", logId);
      // mark the inbound as handled
      await context.supabase
        .from("outreach_messages")
        .update({
          handled_at: new Date().toISOString(),
          handled_by: context.userId,
          read_at: new Date().toISOString(),
        } as never)
        .eq("id", data.in_reply_to_message_id);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await context.supabase
        .from("outreach_messages")
        .update({ status: "failed", error: msg } as never)
        .eq("id", logId);
      throw new Error(msg);
    }
  });

