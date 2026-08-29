import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  messageChannelSchema,
  messageTemplateDeleteSchema,
  messageTemplateSchema,
  messagingSettingsSchema,
  normalizePhoneNumber,
  sendMessageSchema,
  webhookSecretSchema,
  hashWebhookSecret,
  linkMessageClientSchema,
  createClientFromNumberSchema,
} from "@/lib/ai-columbus-messaging";

export const getTelnyxSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string }) =>
    z.object({ organization_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("telnyx_settings")
      .select("organization_id, messaging_profile_id, sms_from_number, whatsapp_from_number, enabled, webhook_secret_configured_at")
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
  .inputValidator((d: unknown) => messagingSettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      organization_id: data.organization_id,
      messaging_profile_id: data.messaging_profile_id?.trim() || null,
      sms_from_number: data.sms_from_number ? normalizePhoneNumber(data.sms_from_number) : null,
      whatsapp_from_number: data.whatsapp_from_number
        ? normalizePhoneNumber(data.whatsapp_from_number)
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
    z.object({ organization_id: z.string().uuid(), channel: messageChannelSchema }).parse(d),
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

export const getTelnyxMessageStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; id: string }) =>
    z.object({ organization_id: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("telnyx_messages")
      .select("id, status, error, sent_at, delivered_at")
      .eq("organization_id", data.organization_id)
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const saveMessagingWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => webhookSecretSchema.parse(d))
  .handler(async ({ data, context }) => {
    const secretHash = await hashWebhookSecret(data.secret);
    const { error } = await context.supabase
      .from("telnyx_settings")
      .upsert({
        organization_id: data.organization_id,
        webhook_secret_hash: secretHash,
        webhook_secret_configured_at: new Date().toISOString(),
      } as never, { onConflict: "organization_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMessageTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; channel: "sms" | "whatsapp" }) =>
    z.object({ organization_id: z.string().uuid(), channel: messageChannelSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("message_templates")
      .select("id, name, body, channel, created_at, updated_at")
      .eq("organization_id", data.organization_id)
      .eq("channel", data.channel)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => messageTemplateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      organization_id: data.organization_id,
      channel: data.channel,
      name: data.name,
      body: data.body,
      created_by: context.userId,
    };
    const query = data.id
      ? context.supabase
          .from("message_templates")
          .update({ name: data.name, body: data.body } as never)
          .eq("id", data.id)
          .eq("organization_id", data.organization_id)
      : context.supabase.from("message_templates").insert(payload as never);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => messageTemplateDeleteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("message_templates")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTelnyxMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sendMessageSchema.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.TELNYX_API_KEY;
    if (!apiKey) throw new Error("De API-sleutel voor AI van Columbus ontbreekt");

    // Membership is enforced by RLS on this read.
    const { data: settings, error: sErr } = await context.supabase
      .from("telnyx_settings")
      .select("*")
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!settings) throw new Error("AI van Columbus is nog niet ingesteld voor dit bedrijf");
    if (settings.enabled === false) throw new Error("Berichten verzenden via AI van Columbus staat uit");

    const from =
      data.channel === "sms" ? settings.sms_from_number : settings.whatsapp_from_number;
    if (!from) {
      throw new Error(
        data.channel === "sms"
          ? "Geen SMS-afzendernummer ingesteld"
          : "Geen WhatsApp-afzendernummer ingesteld",
      );
    }
    const to = normalizePhoneNumber(data.to);

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
        errText = `Bericht verzenden mislukt (status ${res.status})`;
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
    return { id: messageId, provider_message_id: providerId, status };
  });

export const listMessagingClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string }) =>
    z.object({ organization_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("clients")
      .select("id, name, phone, email, contact_person, city")
      .eq("organization_id", data.organization_id)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const linkMessagesToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => linkMessageClientSchema.parse(d))
  .handler(async ({ data, context }) => {
    const phone = normalizePhoneNumber(data.phone);

    // Detect other clients that already carry this phone number.
    const { data: sameNumber, error: dupError } = await context.supabase
      .from("clients")
      .select("id, name, phone")
      .eq("organization_id", data.organization_id)
      .eq("phone", phone);
    if (dupError) throw new Error(dupError.message);

    const conflicts = ((sameNumber ?? []) as { id: string; name: string }[]).filter(
      (row) => row.id !== data.client_id,
    );

    if (conflicts.length > 0 && !data.force) {
      return {
        ok: false as const,
        conflict: true as const,
        phone,
        conflicts,
      };
    }

    if (conflicts.length > 0 && data.force) {
      // Herstel: haal het nummer weg bij de andere klanten zodat het uniek blijft.
      const { error: clearError } = await context.supabase
        .from("clients")
        .update({ phone: null } as never)
        .in(
          "id",
          conflicts.map((c) => c.id),
        );
      if (clearError) throw new Error(clearError.message);
    }

    // Werk de klantkaart bij met het laatst gebruikte nummer (en naam indien meegegeven).
    const clientPatch: Record<string, unknown> = { phone };
    if (data.name && data.name.trim()) clientPatch['name'] = data.name.trim();
    const { error: clientError } = await context.supabase
      .from("clients")
      .update(clientPatch as never)
      .eq("id", data.client_id)
      .eq("organization_id", data.organization_id);
    if (clientError) throw new Error(clientError.message);

    const { error } = await context.supabase
      .from("telnyx_messages")
      .update({ client_id: data.client_id } as never)
      .eq("organization_id", data.organization_id)
      .or(`from_number.eq.${phone},to_number.eq.${phone}`);
    if (error) throw new Error(error.message);
    return { ok: true as const, conflict: false as const, phone, cleared: conflicts.length };
  });

export const createClientFromNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createClientFromNumberSchema.parse(d))
  .handler(async ({ data, context }) => {
    const phone = normalizePhoneNumber(data.phone);
    const { data: existing, error: dupError } = await context.supabase
      .from("clients")
      .select("id, name")
      .eq("organization_id", data.organization_id)
      .eq("phone", phone);
    if (dupError) throw new Error(dupError.message);
    if ((existing ?? []).length > 0) {
      throw new Error(
        `Dit nummer is al gekoppeld aan: ${((existing ?? []) as { name: string }[])
          .map((c) => c.name)
          .join(", ")}. Koppel het bericht aan die klant of maak het nummer daar eerst vrij.`,
      );
    }
    const { data: inserted, error } = await context.supabase
      .from("clients")
      .insert({
        organization_id: data.organization_id,
        name: data.name,
        phone,
        email: data.email ? data.email : null,
        contact_person: data.contact_person || null,
        created_by: context.userId,
      } as never)
      .select("id, name, phone, email, contact_person, city")
      .single();
    if (error) throw new Error(error.message);
    const client = inserted as { id: string };
    const { error: linkError } = await context.supabase
      .from("telnyx_messages")
      .update({ client_id: client.id } as never)
      .eq("organization_id", data.organization_id)
      .or(`from_number.eq.${phone},to_number.eq.${phone}`);
    if (linkError) throw new Error(linkError.message);
    return inserted;
  });
