import { createFileRoute } from "@tanstack/react-router";
import { injectTracking, signTrackingId } from "@/lib/outreach-tracking";

type CampaignRow = {
  id: string;
  name: string | null;
  status: string;
  sequence_steps: Array<{ day: number; channel: string; subject?: string; body: string }> | null;
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
};

async function sendResend(opts: {
  to: string;
  subject: string;
  body: string;
  from: string;
  logId: string;
}): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY ontbreekt");
  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;white-space:pre-wrap">${opts.body.replace(/</g, "&lt;")}</div>`;
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
              .select("id, name, status, sequence_steps")
              .eq("id", t.campaign_id)
              .single();
            const camp = campData as unknown as CampaignRow | null;
            if (!camp || camp.status !== "active") {
              skipped++;
              continue;
            }
            const steps = camp.sequence_steps ?? [];
            const step = steps[t.sequence_step_index];
            if (!step) {
              // sequence finished
              await supabaseAdmin
                .from("outreach_targets")
                .update({ next_send_at: null } as never)
                .eq("id", t.id);
              skipped++;
              continue;
            }
            if (step.channel !== "email") {
              // not email — advance anyway, leave for manual handling
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
            const subject = render(step.subject ?? `Even kort, ${t.company}`, vars);
            const body = render(step.body, vars);

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
