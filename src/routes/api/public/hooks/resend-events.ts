import { createFileRoute } from "@tanstack/react-router";

/**
 * Resend events webhook. Configure in Resend Dashboard → Webhooks with
 * header `x-webhook-secret: $RESEND_WEBHOOK_SECRET`.
 * Updates mail_messages.status by provider_message_id.
 */
export const Route = createFileRoute("/api/public/hooks/resend-events")({
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
            email_id?: string;
            bounce?: { type?: string; message?: string };
            reason?: string;
          };
        };
        const type = ev.type ?? "";
        const emailId = ev.data?.email_id;
        if (!emailId) return Response.json({ ok: true, ignored: true });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();
        const patch: Record<string, unknown> = {};
        if (type === "email.delivered") {
          patch.status = "delivered";
          patch.delivered_at = now;
        } else if (type === "email.bounced") {
          patch.status = "bounced";
          patch.bounced_at = now;
          patch.bounce_type = ev.data?.bounce?.type ?? null;
          patch.bounce_reason = ev.data?.bounce?.message ?? ev.data?.reason ?? null;
          patch.error = ev.data?.bounce?.message ?? ev.data?.reason ?? "Bounced";
        } else if (type === "email.complained") {
          patch.status = "complained";
          patch.complained_at = now;
        } else if (type === "email.delivery_delayed") {
          patch.status = "delayed";
        } else if (type === "email.failed") {
          patch.status = "failed";
          patch.error = ev.data?.reason ?? "Failed";
        } else if (type === "email.sent") {
          patch.status = "sent";
          if (!patch.sent_at) patch.sent_at = now;
        } else {
          return Response.json({ ok: true, ignored: type });
        }

        await supabaseAdmin
          .from("mail_messages")
          .update(patch as never)
          .eq("provider_message_id", emailId);
        return Response.json({ ok: true });
      },
    },
  },
});
