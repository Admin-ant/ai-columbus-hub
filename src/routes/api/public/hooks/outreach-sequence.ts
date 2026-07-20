import { createFileRoute } from "@tanstack/react-router";
import { injectTracking, signTrackingId } from "@/lib/outreach-tracking";

type CampaignRow = {
  id: string;
  name: string | null;
  status: string;
  sequence_steps: Array<{
    day: number;
    channel: string;
    subject?: string;
    body: string;
    stop_on_reply?: boolean;
  }> | null;
  timezone?: string | null;
  send_window_start?: number | null;
  send_window_end?: number | null;
};

type TargetRow = {
  id: string;
  organization_id: string;
  campaign_id: string | null;
  company: string;
  contact_name: string | null;
  email: string | null;
  sequence_step_index: number;
  next_send_at: string | null;
  paused: boolean;
  stage: string;
  personalized_subject?: string | null;
  personalized_body?: string | null;
  active_variant_id?: string | null;
};

async function sendResend(opts: {
  to: string;
  subject: string;
  body: string;
  from: string;
  logId: string;
  baseUrl: string;
  trackingSecret: string | null;
}): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY ontbreekt");
  let html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;white-space:pre-wrap">${opts.body.replace(/</g, "&lt;")}</div>`;
  if (opts.trackingSecret) {
    const sig = signTrackingId(opts.logId, opts.trackingSecret);
    html = injectTracking({ html, messageId: opts.logId, signature: sig, baseUrl: opts.baseUrl });
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      html,
      headers: { "X-Outreach-Message-Id": opts.logId },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as { id: string };
}

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

export const Route = createFileRoute("/api/public/hooks/outreach-sequence")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
          return new Response("Cron secret not configured", { status: 503 });
        }
        if (request.headers.get("x-cron-secret") !== cronSecret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nowIso = new Date().toISOString();
        const { data: runRow } = await supabaseAdmin
          .from("cron_job_runs")
          .insert({ job_name: "outreach-sequence", status: "running" } as never)
          .select("id")
          .single();
        const runId = (runRow as { id: string } | null)?.id ?? null;

        const { data: due, error } = await supabaseAdmin
          .from("outreach_targets")
          .select("*")
          .eq("paused", false)
          .not("email", "is", null)
          .not("next_send_at", "is", null)
          .lte("next_send_at", nowIso)
          .in("stage", ["nieuw", "aangeschreven", "reactie"])
          .limit(50);
        if (error) {
          if (runId) {
            await supabaseAdmin.from("cron_job_runs").update({
              status: "error", finished_at: new Date().toISOString(), error: error.message,
            } as never).eq("id", runId);
          }
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        const targets = (due ?? []) as TargetRow[];
        let sent = 0;
        let skipped = 0;
        let failed = 0;

        for (const t of targets) {
          try {
            if (!t.campaign_id || !t.email) {
              skipped++;
              continue;
            }
            const { data: campData } = await supabaseAdmin
              .from("outreach_campaigns")
              .select("id, name, status, sequence_steps, timezone, send_window_start, send_window_end")
              .eq("id", t.campaign_id)
              .single();
            const camp = campData as unknown as CampaignRow | null;
            if (!camp || camp.status !== "active") {
              skipped++;
              continue;
            }

            // Respect send window (using campaign timezone)
            const tz = camp.timezone ?? "Europe/Amsterdam";
            const startH = camp.send_window_start ?? 8;
            const endH = camp.send_window_end ?? 18;
            const localHour = Number(
              new Intl.DateTimeFormat("en-GB", {
                timeZone: tz,
                hour: "2-digit",
                hour12: false,
              }).format(new Date()),
            );
            if (Number.isFinite(localHour) && (localHour < startH || localHour >= endH)) {
              skipped++;
              continue;
            }

            const steps = camp.sequence_steps ?? [];
            const step = steps[t.sequence_step_index];
            if (!step) {
              await supabaseAdmin
                .from("outreach_targets")
                .update({ next_send_at: null } as never)
                .eq("id", t.id);
              skipped++;
              continue;
            }
            if (step.channel !== "email") {
              await supabaseAdmin
                .from("outreach_targets")
                .update({
                  sequence_step_index: t.sequence_step_index + 1,
                  next_send_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                } as never)
                .eq("id", t.id);
              skipped++;
              continue;
            }

            const vars = {
              company: t.company,
              contact_name: t.contact_name ?? t.company,
            };
            // First step: prefer AI-personalized content if available
            const usePersonalized = t.sequence_step_index === 0 && t.personalized_body;
            const subject = usePersonalized
              ? render(t.personalized_subject ?? step.subject ?? `Even kort, ${t.company}`, vars)
              : render(step.subject ?? `Even kort, ${t.company}`, vars);
            const body = usePersonalized
              ? render(t.personalized_body ?? step.body, vars)
              : render(step.body, vars);

            const { data: logRow } = await supabaseAdmin
              .from("outreach_messages")
              .insert({
                organization_id: t.organization_id,
                target_id: t.id,
                campaign_id: t.campaign_id,
                channel: "email",
                direction: "outbound",
                step_index: t.sequence_step_index,
                subject,
                body,
                status: "queued",
                variant_id: t.active_variant_id ?? null,
              } as never)
              .select("id")
              .single();
            const logId = (logRow as { id: string } | null)?.id;
            if (!logId) {
              failed++;
              continue;
            }

            try {
              const fromEmail = process.env.OUTREACH_FROM_EMAIL ?? "outreach@resend.dev";
              const r = await sendResend({
                to: t.email,
                subject,
                body,
                from: fromEmail,
                logId,
                baseUrl: new URL(request.url).origin,
                trackingSecret: cronSecret,
              });
              await supabaseAdmin
                .from("outreach_messages")
                .update({
                  status: "sent",
                  sent_at: new Date().toISOString(),
                  provider_message_id: r.id,
                } as never)
                .eq("id", logId);

              const nextStep = steps[t.sequence_step_index + 1];
              const nextSendAt = nextStep
                ? new Date(Date.now() + Math.max(1, nextStep.day - (step.day ?? 0)) * 24 * 60 * 60 * 1000).toISOString()
                : null;
              await supabaseAdmin
                .from("outreach_targets")
                .update({
                  sequence_step_index: t.sequence_step_index + 1,
                  last_message_at: new Date().toISOString(),
                  last_contact_at: new Date().toISOString(),
                  next_send_at: nextSendAt,
                  stage: t.stage === "nieuw" ? "aangeschreven" : t.stage,
                } as never)
                .eq("id", t.id);
              sent++;
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              await supabaseAdmin
                .from("outreach_messages")
                .update({ status: "failed", error: msg } as never)
                .eq("id", logId);
              failed++;
            }
          } catch {
            failed++;
          }
        }

        return Response.json({ ok: true, processed: targets.length, sent, skipped, failed });
      },
    },
  },
});
