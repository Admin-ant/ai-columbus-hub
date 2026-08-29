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
  matchSettingsSchema,
  defaultMatchSettings,
  clientPhoneSchema,
  clientPhoneDeleteSchema,
  phoneTail,
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
    const [{ data: rows, error }, { data: numbers }] = await Promise.all([
      context.supabase
        .from("clients")
        .select("id, name, phone, email, contact_person, city")
        .eq("organization_id", data.organization_id)
        .order("name"),
      context.supabase
        .from("client_phone_numbers")
        .select("client_id, phone, label, is_primary, id")
        .eq("organization_id", data.organization_id),
    ]);
    if (error) throw new Error(error.message);
    const byClient = new Map<string, string[]>();
    for (const n of (numbers ?? []) as { client_id: string; phone: string }[]) {
      const list = byClient.get(n.client_id) ?? [];
      list.push(n.phone);
      byClient.set(n.client_id, list);
    }
    type ClientRow = {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      contact_person: string | null;
      city: string | null;
    };
    return ((rows ?? []) as ClientRow[]).map((row) => ({
      ...row,
      numbers: byClient.get(row.id) ?? [],
    }));
  });

export const getMessagingMatchSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string }) =>
    z.object({ organization_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("messaging_match_settings")
      .select("match_digits, lookback_days, auto_create_client, block_duplicate_numbers")
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ...defaultMatchSettings, ...(row ?? {}) };
  });

export const saveMessagingMatchSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => matchSettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("messaging_match_settings")
      .upsert(data as never, { onConflict: "organization_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMessagingLinkAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; client_id?: string | null }) =>
    z
      .object({
        organization_id: z.string().uuid(),
        client_id: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("messaging_link_audit")
      .select("*")
      .eq("organization_id", data.organization_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.client_id) {
      query = query.or(`old_client_id.eq.${data.client_id},new_client_id.eq.${data.client_id}`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listClientPhoneNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; client_id: string }) =>
    z.object({ organization_id: z.string().uuid(), client_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("client_phone_numbers")
      .select("id, phone, label, is_primary, created_at")
      .eq("organization_id", data.organization_id)
      .eq("client_id", data.client_id)
      .order("is_primary", { ascending: false })
      .order("created_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addClientPhoneNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => clientPhoneSchema.parse(d))
  .handler(async ({ data, context }) => {
    const phone = normalizePhoneNumber(data.phone);
    const { data: existing } = await context.supabase
      .from("client_phone_numbers")
      .select("id, client_id")
      .eq("organization_id", data.organization_id)
      .eq("phone", phone)
      .maybeSingle();
    if (existing && (existing as { client_id: string }).client_id !== data.client_id) {
      throw new Error("Dit nummer is al gekoppeld aan een andere klant.");
    }
    const { error } = await context.supabase.from("client_phone_numbers").upsert(
      {
        organization_id: data.organization_id,
        client_id: data.client_id,
        phone,
        label: data.label?.trim() || null,
        is_primary: data.is_primary ?? false,
        created_by: context.userId,
      } as never,
      { onConflict: "organization_id,phone" },
    );
    if (error) throw new Error(error.message);

    // Koppel bestaande berichten met dit nummer meteen aan deze klant.
    await context.supabase
      .from("telnyx_messages")
      .update({ client_id: data.client_id } as never)
      .eq("organization_id", data.organization_id)
      .or(`from_number.eq.${phone},to_number.eq.${phone}`);

    await writeLinkAudit(context, {
      organization_id: data.organization_id,
      phone,
      action: "number_added",
      new_client_id: data.client_id,
    });
    return { ok: true, phone };
  });

export const deleteClientPhoneNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => clientPhoneDeleteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("client_phone_numbers")
      .select("phone, client_id")
      .eq("id", data.id)
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    const { error } = await context.supabase
      .from("client_phone_numbers")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    if (row) {
      await writeLinkAudit(context, {
        organization_id: data.organization_id,
        phone: (row as { phone: string }).phone,
        action: "number_removed",
        old_client_id: (row as { client_id: string }).client_id,
      });
    }
    return { ok: true };
  });

export const getClientMessagingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; client_id: string }) =>
    z.object({ organization_id: z.string().uuid(), client_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: numbers } = await context.supabase
      .from("client_phone_numbers")
      .select("phone")
      .eq("organization_id", data.organization_id)
      .eq("client_id", data.client_id);
    const { data: rows, error } = await context.supabase
      .from("telnyx_messages")
      .select("id, channel, direction, from_number, to_number, body, status, created_at, client_id")
      .eq("organization_id", data.organization_id)
      .eq("client_id", data.client_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    type Row = {
      id: string;
      channel: string;
      direction: string;
      from_number: string | null;
      to_number: string;
      body: string;
      status: string;
      created_at: string;
    };
    const known = new Set(((numbers ?? []) as { phone: string }[]).map((n) => phoneTail(n.phone)));
    const groups = new Map<
      string,
      {
        phone: string;
        channel: string;
        messages: number;
        inbound: number;
        outbound: number;
        last_at: string;
        last_body: string;
        last_direction: string;
        state: "nieuw" | "gekoppeld" | "opgelost";
      }
    >();
    for (const r of (rows ?? []) as Row[]) {
      const counterpart = r.direction === "inbound" ? (r.from_number ?? "") : r.to_number;
      const key = `${r.channel}:${phoneTail(counterpart)}`;
      const current = groups.get(key);
      if (!current) {
        groups.set(key, {
          phone: counterpart,
          channel: r.channel,
          messages: 1,
          inbound: r.direction === "inbound" ? 1 : 0,
          outbound: r.direction === "inbound" ? 0 : 1,
          last_at: r.created_at,
          last_body: r.body,
          last_direction: r.direction,
          state: "gekoppeld",
        });
      } else {
        current.messages += 1;
        if (r.direction === "inbound") current.inbound += 1;
        else current.outbound += 1;
      }
    }
    const conversations = [...groups.values()].map((g) => ({
      ...g,
      state: !known.has(phoneTail(g.phone))
        ? ("nieuw" as const)
        : g.last_direction === "inbound"
          ? ("gekoppeld" as const)
          : ("opgelost" as const),
    }));
    conversations.sort((a, b) => b.last_at.localeCompare(a.last_at));
    return {
      numbers: ((numbers ?? []) as { phone: string }[]).map((n) => n.phone),
      total: (rows ?? []).length,
      conversations,
    };
  });

async function writeLinkAudit(
  context: { supabase: SupabaseLike; userId: string; claims?: { email?: string } },
  entry: {
    organization_id: string;
    phone: string;
    action: string;
    old_client_id?: string | null;
    new_client_id?: string | null;
    message_count?: number;
    metadata?: Record<string, unknown>;
  },
) {
  const ids = [entry.old_client_id, entry.new_client_id].filter(Boolean) as string[];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: rows } = await context.supabase.from("clients").select("id, name").in("id", ids);
    for (const row of (rows ?? []) as { id: string; name: string }[]) names.set(row.id, row.name);
  }
  await context.supabase.from("messaging_link_audit").insert({
    organization_id: entry.organization_id,
    phone: entry.phone,
    action: entry.action,
    old_client_id: entry.old_client_id ?? null,
    old_client_name: entry.old_client_id ? (names.get(entry.old_client_id) ?? null) : null,
    new_client_id: entry.new_client_id ?? null,
    new_client_name: entry.new_client_id ? (names.get(entry.new_client_id) ?? null) : null,
    message_count: entry.message_count ?? 0,
    actor_id: context.userId,
    actor_email: context.claims?.email ?? null,
    metadata: entry.metadata ?? {},
  } as never);
}

type SupabaseLike = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export const linkMessagesToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => linkMessageClientSchema.parse(d))
  .handler(async ({ data, context }) => {
    const phone = normalizePhoneNumber(data.phone);

    const { data: settingsRow } = await context.supabase
      .from("messaging_match_settings")
      .select("match_digits, lookback_days, block_duplicate_numbers")
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    const rules = { ...defaultMatchSettings, ...(settingsRow ?? {}) };
    const tail = phoneTail(phone, rules.match_digits);

    // Detect other clients that already carry this number (own field or extra numbers).
    const [{ data: sameNumber, error: dupError }, { data: extraNumbers }] = await Promise.all([
      context.supabase
        .from("clients")
        .select("id, name, phone")
        .eq("organization_id", data.organization_id)
        .not("phone", "is", null),
      context.supabase
        .from("client_phone_numbers")
        .select("id, client_id, phone")
        .eq("organization_id", data.organization_id),
    ]);
    if (dupError) throw new Error(dupError.message);

    const conflictMap = new Map<string, { id: string; name: string }>();
    for (const row of (sameNumber ?? []) as { id: string; name: string; phone: string | null }[]) {
      if (row.id !== data.client_id && phoneTail(row.phone, rules.match_digits) === tail) {
        conflictMap.set(row.id, { id: row.id, name: row.name });
      }
    }
    const clientNames = new Map(
      ((sameNumber ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
    );
    const conflictingNumberIds: string[] = [];
    for (const row of (extraNumbers ?? []) as { id: string; client_id: string; phone: string }[]) {
      if (row.client_id !== data.client_id && phoneTail(row.phone, rules.match_digits) === tail) {
        conflictingNumberIds.push(row.id);
        conflictMap.set(row.client_id, {
          id: row.client_id,
          name: clientNames.get(row.client_id) ?? "Onbekende klant",
        });
      }
    }
    const conflicts = [...conflictMap.values()];

    if (conflicts.length > 0 && rules.block_duplicate_numbers && !data.force) {
      return { ok: false as const, conflict: true as const, phone, conflicts };
    }

    if (conflicts.length > 0) {
      const { error: clearError } = await context.supabase
        .from("clients")
        .update({ phone: null } as never)
        .in(
          "id",
          conflicts.map((c) => c.id),
        );
      if (clearError) throw new Error(clearError.message);
      if (conflictingNumberIds.length > 0) {
        await context.supabase.from("client_phone_numbers").delete().in("id", conflictingNumberIds);
      }
    }

    const clientPatch: Record<string, unknown> = { phone };
    if (data.name && data.name.trim()) clientPatch['name'] = data.name.trim();
    const { error: clientError } = await context.supabase
      .from("clients")
      .update(clientPatch as never)
      .eq("id", data.client_id)
      .eq("organization_id", data.organization_id);
    if (clientError) throw new Error(clientError.message);

    await context.supabase.from("client_phone_numbers").upsert(
      {
        organization_id: data.organization_id,
        client_id: data.client_id,
        phone,
        label: "Berichten",
        created_by: context.userId,
      } as never,
      { onConflict: "organization_id,phone" },
    );

    const since = new Date(Date.now() - rules.lookback_days * 86400000).toISOString();
    const { data: moved, error } = await context.supabase
      .from("telnyx_messages")
      .update({ client_id: data.client_id } as never)
      .eq("organization_id", data.organization_id)
      .gte("created_at", since)
      .or(`from_number.eq.${phone},to_number.eq.${phone}`)
      .select("id");
    if (error) throw new Error(error.message);

    await writeLinkAudit(context, {
      organization_id: data.organization_id,
      phone,
      action: conflicts.length > 0 ? "moved" : "linked",
      old_client_id: conflicts[0]?.id ?? null,
      new_client_id: data.client_id,
      message_count: (moved ?? []).length,
      metadata: { forced: Boolean(data.force), match_digits: rules.match_digits, lookback_days: rules.lookback_days },
    });

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
    await context.supabase.from("client_phone_numbers").upsert(
      {
        organization_id: data.organization_id,
        client_id: client.id,
        phone,
        label: "Hoofdnummer",
        is_primary: true,
        created_by: context.userId,
      } as never,
      { onConflict: "organization_id,phone" },
    );
    const { data: moved, error: linkError } = await context.supabase
      .from("telnyx_messages")
      .update({ client_id: client.id } as never)
      .eq("organization_id", data.organization_id)
      .or(`from_number.eq.${phone},to_number.eq.${phone}`)
      .select("id");
    if (linkError) throw new Error(linkError.message);
    await writeLinkAudit(context, {
      organization_id: data.organization_id,
      phone,
      action: "client_created",
      new_client_id: client.id,
      message_count: (moved ?? []).length,
    });
    return inserted;
  });

