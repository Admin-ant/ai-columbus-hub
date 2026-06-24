import { createFileRoute } from "@tanstack/react-router";

/**
 * Resend inbound webhook for reply detection.
 * Configure Resend webhook URL: /api/public/hooks/outreach-reply
 * Optional: set RESEND_WEBHOOK_SECRET to enforce a shared secret via
 * the `x-webhook-secret` header.
 */
export const Route = createFileRoute("/api/public/hooks/outreach-reply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RESEND_WEBHOOK_SECRET;
        if (secret) {
          const provided = request.headers.get("x-webhook-secret");
          if (provided !== secret) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const ev = payload as {
          type?: string;
          data?: {
            from?: string;
            subject?: string;
            text?: string;
            html?: string;
            in_reply_to?: string;
            headers?: Record<string, string>;
            email_id?: string;
          };
        };

        const data = ev.data ?? {};
        const inReplyTo =
          data.in_reply_to ?? data.headers?.["in-reply-to"] ?? data.headers?.["In-Reply-To"];
        const outreachHeader =
          data.headers?.["x-outreach-message-id"] ?? data.headers?.["X-Outreach-Message-Id"];
        const providerId = data.email_id;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Find original outbound message
        let originalQuery = supabaseAdmin
          .from("outreach_messages")
          .select("id, target_id, organization_id, campaign_id")
          .eq("direction", "outbound");
        if (outreachHeader) originalQuery = originalQuery.eq("id", outreachHeader);
        else if (providerId) originalQuery = originalQuery.eq("provider_message_id", providerId);
        else if (inReplyTo) originalQuery = originalQuery.eq("provider_message_id", inReplyTo);
        else {
          return Response.json({ ok: false, reason: "no-match-key" });
        }

        const { data: orig } = await originalQuery.maybeSingle();
        const origRow = orig as
          | { id: string; target_id: string; organization_id: string; campaign_id: string | null }
          | null;
        if (!origRow) return Response.json({ ok: false, reason: "no-match" });

        const body = data.text ?? data.html ?? "";

        // Log inbound
        const { data: logRow } = await supabaseAdmin
          .from("outreach_messages")
          .insert({
            organization_id: origRow.organization_id,
            target_id: origRow.target_id,
            campaign_id: origRow.campaign_id,
            channel: "email",
            direction: "inbound",
            subject: data.subject ?? null,
            body,
            status: "received",
            received_at: new Date().toISOString(),
            provider_message_id: providerId ?? null,
          } as never)
          .select("id")
          .single();

        // Pause sequence on reply
        await supabaseAdmin
          .from("outreach_targets")
          .update({
            stage: "reactie",
            paused: true,
            next_send_at: null,
            last_message_at: new Date().toISOString(),
          } as never)
          .eq("id", origRow.target_id);

        // Best-effort AI classification (inline; ignore failure)
        try {
          const apiKey = process.env.LOVABLE_API_KEY;
          if (apiKey && body) {
            const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                response_format: { type: "json_object" },
                messages: [
                  {
                    role: "system",
                    content: `Classificeer cold-outreach reactie. JSON: {"label":"positive|interested|needs_followup|not_now|negative|unsubscribe","sentiment":"positive|neutral|negative"}`,
                  },
                  { role: "user", content: body.slice(0, 4000) },
                ],
              }),
            });
            if (aiRes.ok) {
              const j = (await aiRes.json()) as {
                choices?: Array<{ message?: { content?: string } }>;
              };
              const content = j.choices?.[0]?.message?.content ?? "{}";
              const parsed = JSON.parse(content) as { label?: string; sentiment?: string };
              if (parsed.label) {
                const logId = (logRow as { id: string } | null)?.id;
                if (logId) {
                  await supabaseAdmin
                    .from("outreach_messages")
                    .update({
                      reply_classification: parsed.label,
                      sentiment: parsed.sentiment ?? null,
                    } as never)
                    .eq("id", logId);
                }
                await supabaseAdmin
                  .from("outreach_targets")
                  .update({
                    reply_classification: parsed.label,
                    stage:
                      parsed.label === "positive" || parsed.label === "interested"
                        ? "gesprek"
                        : parsed.label === "negative" || parsed.label === "unsubscribe"
                          ? "verloren"
                          : "reactie",
                  } as never)
                  .eq("id", origRow.target_id);
              }
            }
          }
        } catch {
          // ignore
        }

        return Response.json({ ok: true });
      },
    },
  },
});
