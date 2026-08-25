import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CHANNEL = z.enum(["sms", "whatsapp"]);

const SEND_SCHEMA = z.object({
  organization_id: z.string().uuid(),
  channel: CHANNEL,
  to: z.string().min(5).max(30),
  body: z.string().min(1).max(2000),
  client_id: z.string().uuid().nullable().optional(),
  lead_id: z.string().uuid().nullable().optional(),
});

const SETTINGS_SCHEMA = z.object({
  organization_id: z.string().uuid(),
  messaging_profile_id: z.string().max(120).nullable().optional(),
  sms_from_number: z.string().max(30).nullable().optional(),
  whatsapp_from_number: z.string().max(30).nullable().optional(),
  enabled: z.boolean().optional(),
});

function normalizeNumber(raw: string): string {
  const trimmed = raw.trim().replace(/[\s().-]/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("00")) return `+${trimmed.slice(2)}`;
  if (trimmed.startsWith("0")) return `+31${trimmed.slice(1)}`;
  return `+${trimmed}`;
}

export const getTelnyxSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string }) =>
    z.object({ organization_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("telnyx_settings")
      .select("*")
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      settings: row ?? null,
      api_key_configured: Boolean(process.env.TELNYX_API_KEY),
    };
  });

export const saveTelnyxSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SETTINGS_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      organization_id: data.organization_id,
      messaging_profile_id: data.messaging_profile_id?.trim() || null,
      sms_from_number: data.sms_from_number ? normalizeNumber(data.sms_from_number) : null,
      whatsapp_from_number: data.whatsapp_from_number
        ? normalizeNumber(data.whatsapp_from_number)
        : null,
      enabled: data.enabled ?? true,
    };
    const { error } = await context.supabase
      .from("telnyx_settings")
      .upsert(payload as never, { onConflict: "organization_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listTelnyxMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; channel: "sms" | "whatsapp" }) =>
    z.object({ organization_id: z.string().uuid(), channel: CHANNEL }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("telnyx_messages")
      .select("*")
      .eq("organization_id", data.organization_id)
      .eq("channel", data.channel)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const sendTelnyxMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SEND_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.TELNYX_API_KEY;
    if (!apiKey) throw new Error("TELNYX_API_KEY ontbreekt");

    // Membership is enforced by RLS on this read.
    const { data: settings, error: sErr } = await context.supabase
      .from("telnyx_settings")
      .select("*")
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!settings) throw new Error("Telnyx is nog niet ingesteld voor dit bedrijf");
    if (settings.enabled === false) throw new Error("Telnyx-verzending staat uit");

    const from =
      data.channel === "sms" ? settings.sms_from_number : settings.whatsapp_from_number;
    if (!from) {
      throw new Error(
        data.channel === "sms"
          ? "Geen SMS-afzendernummer ingesteld"
          : "Geen WhatsApp-afzendernummer ingesteld",
      );
    }
    const to = normalizeNumber(data.to);

    const { data: inserted, error: iErr } = await context.supabase
      .from("telnyx_messages")
      .insert({
        organization_id: data.organization_id,
        channel: data.channel,
        direction: "outbound",
        from_number: from,
        to_number: to,
        body: data.body,
        status: "queued",
        client_id: data.client_id ?? null,
        lead_id: data.lead_id ?? null,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (iErr) throw new Error(iErr.message);
    const messageId = (inserted as { id: string }).id;

    const payload: Record<string, unknown> = {
      from: data.channel === "whatsapp" ? `whatsapp:${from}` : from,
      to: data.channel === "whatsapp" ? `whatsapp:${to}` : to,
      text: data.body,
      type: data.channel === "whatsapp" ? "WhatsApp" : "SMS",
    };
    if (settings.messaging_profile_id) {
      payload.messaging_profile_id = settings.messaging_profile_id;
    }

    let providerId: string | null = null;
    let status = "sent";
    let errText: string | null = null;
    try {
      const res = await fetch("https://api.telnyx.com/v2/messages", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) {
        status = "failed";
        errText = `Telnyx ${res.status}: ${text.slice(0, 300)}`;
      } else {
        const json = JSON.parse(text) as { data?: { id?: string } };
        providerId = json.data?.id ?? null;
      }
    } catch (e) {
      status = "failed";
      errText = e instanceof Error ? e.message : "Onbekende fout";
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("telnyx_messages")
      .update({
        status,
        error: errText,
        provider_message_id: providerId,
        sent_at: status === "sent" ? new Date().toISOString() : null,
      } as never)
      .eq("id", messageId);

    if (status === "failed") throw new Error(errText ?? "Versturen mislukt");
    return { id: messageId, provider_message_id: providerId };
  });
