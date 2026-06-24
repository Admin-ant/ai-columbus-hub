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
