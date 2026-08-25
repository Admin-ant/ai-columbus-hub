import { createFileRoute } from "@tanstack/react-router";

/**
 * Telnyx webhook: inbound SMS/WhatsApp messages and delivery status updates.
 * Configure in Telnyx with header `x-webhook-secret: $TELNYX_WEBHOOK_SECRET`
 * (or `?secret=` query param).
 */
export const Route = createFileRoute("/api/public/hooks/telnyx")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.TELNYX_WEBHOOK_SECRET;
        if (!secret) return new Response("Not configured", { status: 503 });
        const url = new URL(request.url);
        const provided =
          request.headers.get("x-webhook-secret") ?? url.searchParams.get("secret");
        if (provided !== secret) return new Response("Unauthorized", { status: 401 });

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const ev = payload as {
          data?: {
            event_type?: string;
            payload?: {
              id?: string;
              direction?: string;
              text?: string;
              type?: string;
              from?: { phone_number?: string };
              to?: Array<{ phone_number?: string; status?: string }>;
            };
          };
        };
        const type = ev.data?.event_type ?? "";
        const p = ev.data?.payload;
        if (!p) return Response.json({ ok: true, ignored: true });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();
        const strip = (n?: string | null) => (n ?? "").replace(/^whatsapp:/i, "");

        if (type === "message.received" || p.direction === "inbound") {
          const to = strip(p.to?.[0]?.phone_number);
          const channel = (p.type ?? "").toLowerCase().includes("whatsapp")
            ? "whatsapp"
            : "sms";
          const { data: setting } = await supabaseAdmin
            .from("telnyx_settings")
            .select("organization_id")
            .or(`sms_from_number.eq.${to},whatsapp_from_number.eq.${to}`)
            .maybeSingle();
          if (!setting) return Response.json({ ok: true, unmatched: true });
          await supabaseAdmin.from("telnyx_messages").insert({
            organization_id: (setting as { organization_id: string }).organization_id,
            channel,
            direction: "inbound",
            from_number: strip(p.from?.phone_number),
            to_number: to,
            body: p.text ?? "",
            status: "received",
            provider_message_id: p.id ?? null,
          } as never);
          return Response.json({ ok: true });
        }

        if (p.id) {
          const status = p.to?.[0]?.status ?? "sent";
          const patch: Record<string, unknown> = { status };
          if (status === "delivered") patch.delivered_at = now;
          await supabaseAdmin
            .from("telnyx_messages")
            .update(patch as never)
            .eq("provider_message_id", p.id);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
