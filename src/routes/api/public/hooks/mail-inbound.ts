import { createFileRoute } from "@tanstack/react-router";

/**
 * Resend inbound webhook for general mail. Configure in Resend dashboard
 * with header `x-webhook-secret: $RESEND_WEBHOOK_SECRET`.
 * Routes inbound mail to mail_messages.inbox for the organization that
 * owns the recipient address (matched via OUTREACH_FROM_EMAIL).
 */
export const Route = createFileRoute("/api/public/hooks/mail-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RESEND_WEBHOOK_SECRET;
        if (!secret) return new Response("Not configured", { status: 503 });
        if (request.headers.get("x-webhook-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
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
            to?: string | string[];
            cc?: string | string[];
            subject?: string;
            text?: string;
            html?: string;
            in_reply_to?: string;
            message_id?: string;
            email_id?: string;
            headers?: Record<string, string>;
          };
        };
        const d = ev.data ?? {};
        const fromRaw = d.from ?? "";
        const fromMatch = /<([^>]+)>/.exec(fromRaw);
        const fromEmail = fromMatch?.[1] ?? fromRaw.trim();
        const fromName = fromRaw.replace(/<[^>]+>/, "").trim().replace(/^"|"$/g, "") || null;
        const toList = Array.isArray(d.to) ? d.to : d.to ? [d.to] : [];
        const ccList = Array.isArray(d.cc) ? d.cc : d.cc ? [d.cc] : [];
        const inReplyTo =
          d.in_reply_to ?? d.headers?.["in-reply-to"] ?? d.headers?.["In-Reply-To"] ?? null;
        const mailHeader =
          d.headers?.["x-mail-message-id"] ?? d.headers?.["X-Mail-Message-Id"] ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Determine organization: prefer thread match
        let organization_id: string | null = null;
        let thread_id: string | null = null;
        if (mailHeader) {
          const { data: orig } = await supabaseAdmin
            .from("mail_messages")
            .select("organization_id, thread_id, id")
            .eq("id", mailHeader)
            .maybeSingle();
          if (orig) {
            organization_id = (orig as { organization_id: string }).organization_id;
            thread_id = (orig as { thread_id: string | null; id: string }).thread_id ?? (orig as { id: string }).id;
          }
        }
        if (!organization_id && inReplyTo) {
          const { data: orig } = await supabaseAdmin
            .from("mail_messages")
            .select("organization_id, thread_id, id")
            .eq("provider_message_id", inReplyTo)
            .maybeSingle();
          if (orig) {
            organization_id = (orig as { organization_id: string }).organization_id;
            thread_id = (orig as { thread_id: string | null; id: string }).thread_id ?? (orig as { id: string }).id;
          }
        }
        if (!organization_id) {
          // Fallback: first org (single-tenant scenario)
          const { data: org } = await supabaseAdmin
            .from("organizations")
            .select("id")
            .limit(1)
            .maybeSingle();
          organization_id = (org as { id: string } | null)?.id ?? null;
        }
        if (!organization_id) return Response.json({ ok: false, reason: "no-org" });

        await supabaseAdmin.from("mail_messages").insert({
          organization_id,
          folder: "inbox",
          thread_id,
          from_email: fromEmail,
          from_name: fromName,
          to_emails: toList,
          cc_emails: ccList,
          subject: d.subject ?? null,
          body_text: d.text ?? null,
          body_html: d.html ?? null,
          in_reply_to: inReplyTo,
          provider_message_id: d.email_id ?? d.message_id ?? null,
          status: "received",
          received_at: new Date().toISOString(),
        } as never);

        return Response.json({ ok: true });
      },
    },
  },
});
