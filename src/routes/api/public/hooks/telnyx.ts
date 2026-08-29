import { createFileRoute } from "@tanstack/react-router";
import {
  hashWebhookSecret,
  normalizePhoneNumber,
  phoneTail,
  defaultMatchSettings,
} from "@/lib/ai-columbus-messaging";

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

/**
 * Auto-link an inbound number to an existing client using the organization's
 * configurable match rules (number of digits compared). Falls back to creating
 * a placeholder client only when auto-creation is enabled and nothing matches.
 */
async function findOrCreateClientForNumber(
  supabaseAdmin: AdminClient,
  organizationId: string,
  rawNumber: string,
): Promise<string | null> {
  if (!rawNumber) return null;
  let normalized: string;
  try {
    normalized = normalizePhoneNumber(rawNumber);
  } catch {
    normalized = rawNumber;
  }

  const { data: settingsRow } = await supabaseAdmin
    .from("messaging_match_settings")
    .select("match_digits, auto_create_client")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const rules = { ...defaultMatchSettings, ...(settingsRow ?? {}) };
  const tail = phoneTail(normalized, rules.match_digits);

  // 1. Extra client numbers (one client can own several numbers).
  const { data: extra } = await supabaseAdmin
    .from("client_phone_numbers")
    .select("client_id, phone")
    .eq("organization_id", organizationId);
  const matchedExtra = ((extra ?? []) as { client_id: string; phone: string }[]).find(
    (row) => phoneTail(row.phone, rules.match_digits) === tail,
  );
  if (matchedExtra) return matchedExtra.client_id;

  // 2. Primary phone on the client record.
  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id, phone")
    .eq("organization_id", organizationId)
    .not("phone", "is", null);
  const matched = ((clients ?? []) as { id: string; phone: string | null }[]).find(
    (c) => phoneTail(c.phone, rules.match_digits) === tail,
  );
  if (matched) {
    await supabaseAdmin.from("client_phone_numbers").upsert(
      {
        organization_id: organizationId,
        client_id: matched.id,
        phone: normalized,
        label: "Inkomend bericht",
      } as never,
      { onConflict: "organization_id,phone" },
    );
    return matched.id;
  }

  // 3. Contact persons of a client.
  const { data: contacts } = await supabaseAdmin
    .from("client_contacts")
    .select("client_id, phone, clients!inner(organization_id)")
    .eq("clients.organization_id", organizationId)
    .not("phone", "is", null);
  const matchedContact = ((contacts ?? []) as { client_id: string; phone: string | null }[]).find(
    (c) => phoneTail(c.phone, rules.match_digits) === tail,
  );
  if (matchedContact) return matchedContact.client_id;

  if (!rules.auto_create_client) return null;

  const { data: created, error } = await supabaseAdmin
    .from("clients")
    .insert({
      organization_id: organizationId,
      name: normalized,
      phone: normalized,
      notes: "Automatisch aangemaakt vanuit inkomend bericht.",
    } as never)
    .select("id")
    .single();
  if (error) return null;
  const clientId = (created as { id: string }).id;
  await supabaseAdmin.from("client_phone_numbers").insert({
    organization_id: organizationId,
    client_id: clientId,
    phone: normalized,
    label: "Hoofdnummer",
    is_primary: true,
  } as never);
  await supabaseAdmin.from("messaging_link_audit").insert({
    organization_id: organizationId,
    phone: normalized,
    action: "auto_created",
    new_client_id: clientId,
    actor_email: "webhook",
    metadata: { source: "inbound_message" },
  } as never);
  return clientId;
}


/**
 * Messaging webhook: inbound SMS/WhatsApp messages and delivery status updates.
 */
export const Route = createFileRoute("/api/public/hooks/telnyx")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const provided =
          request.headers.get("x-webhook-secret") ?? url.searchParams.get("secret");
        if (!provided) return new Response("Unauthorized", { status: 401 });

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
        const targetNumber =
          type === "message.received" || p.direction === "inbound"
            ? strip(p.to?.[0]?.phone_number)
            : strip(p.from?.phone_number);
        let settingsQuery = supabaseAdmin
          .from("telnyx_settings")
          .select("organization_id, webhook_secret_hash")
          .or(`sms_from_number.eq.${targetNumber},whatsapp_from_number.eq.${targetNumber}`);
        if (p.id && !targetNumber) {
          const { data: message } = await supabaseAdmin
            .from("telnyx_messages")
            .select("organization_id")
            .eq("provider_message_id", p.id)
            .maybeSingle();
          if (!message) return Response.json({ ok: true, unmatched: true });
          settingsQuery = supabaseAdmin
            .from("telnyx_settings")
            .select("organization_id, webhook_secret_hash")
            .eq("organization_id", (message as { organization_id: string }).organization_id);
        }
        const { data: setting } = await settingsQuery.maybeSingle();
        const configuredHash = (setting as { webhook_secret_hash?: string | null } | null)
          ?.webhook_secret_hash;
        if (!setting || !configuredHash || (await hashWebhookSecret(provided)) !== configuredHash) {
          return new Response("Unauthorized", { status: 401 });
        }

        if (type === "message.received" || p.direction === "inbound") {
          const to = strip(p.to?.[0]?.phone_number);
          const from = strip(p.from?.phone_number);
          const channel = (p.type ?? "").toLowerCase().includes("whatsapp")
            ? "whatsapp"
            : "sms";
          const organizationId = (setting as { organization_id: string }).organization_id;
          const clientId = await findOrCreateClientForNumber(supabaseAdmin, organizationId, from);
          await supabaseAdmin.from("telnyx_messages").insert({
            organization_id: organizationId,
            channel,
            direction: "inbound",
            from_number: from,
            to_number: to,
            body: p.text ?? "",
            status: "received",
            provider_message_id: p.id ?? null,
            client_id: clientId,
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
