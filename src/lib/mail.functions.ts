import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function sendViaResend(opts: {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string; content: string }>;
}): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY ontbreekt");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: opts.from,
      to: opts.to,
      cc: opts.cc && opts.cc.length ? opts.cc : undefined,
      bcc: opts.bcc && opts.bcc.length ? opts.bcc : undefined,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      reply_to: opts.replyTo,
      headers: opts.headers,
      attachments: opts.attachments,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body) as { id: string };
}

const ATTACH = z.object({
  path: z.string(), // storage path within mail-attachments bucket
  filename: z.string(),
  size: z.number().optional(),
  mime: z.string().optional(),
});

const SEND_SCHEMA = z.object({
  organization_id: z.string().uuid(),
  to: z.array(z.string().email()).min(1).max(20),
  cc: z.array(z.string().email()).max(20).optional().default([]),
  bcc: z.array(z.string().email()).max(20).optional().default([]),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(50000),
  from_name: z.string().max(120).optional(),
  client_id: z.string().uuid().optional().nullable(),
  lead_id: z.string().uuid().optional().nullable(),
  in_reply_to: z.string().optional().nullable(),
  thread_id: z.string().uuid().optional().nullable(),
  attachments: z.array(ATTACH).max(10).optional().default([]),
});

export const sendMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SEND_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    // Per-org overrides
    const { data: settings } = await context.supabase
      .from("mail_settings")
      .select("from_email, from_name, reply_to, signature")
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    const s = (settings ?? null) as {
      from_email: string | null;
      from_name: string | null;
      reply_to: string | null;
      signature: string | null;
    } | null;
    const from_email = s?.from_email || process.env.OUTREACH_FROM_EMAIL || "outreach@resend.dev";
    const from_name = data.from_name ?? s?.from_name ?? null;
    const from = from_name ? `${from_name} <${from_email}>` : from_email;
    const replyTo = s?.reply_to || undefined;
    const fullBody = s?.signature ? `${data.body}\n\n${s.signature}` : data.body;

    const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;white-space:pre-wrap">${fullBody.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))}</div>`;

    // Resolve attachments: download from storage and base64-encode
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const att: Array<{ filename: string; content: string }> = [];
    for (const a of data.attachments ?? []) {
      const { data: blob, error } = await supabaseAdmin.storage
        .from("mail-attachments")
        .download(a.path);
      if (error || !blob) continue;
      const buf = Buffer.from(await blob.arrayBuffer());
      att.push({ filename: a.filename, content: buf.toString("base64") });
    }

    // Pre-insert log row
    const insertRow = {
      organization_id: data.organization_id,
      folder: "sent",
      thread_id: data.thread_id ?? null,
      from_email,
      from_name: from_name,
      to_emails: data.to,
      cc_emails: data.cc ?? [],
      bcc_emails: data.bcc ?? [],
      subject: data.subject,
      body_text: fullBody,
      body_html: html,
      in_reply_to: data.in_reply_to ?? null,
      client_id: data.client_id ?? null,
      lead_id: data.lead_id ?? null,
      attachments: data.attachments ?? [],
      status: "queued",
      created_by: context.userId,
    };
    const { data: row, error: insErr } = await context.supabase
      .from("mail_messages")
      .insert(insertRow as never)
      .select("id")
      .single();
    if (insErr || !row) throw new Error(insErr?.message ?? "Log mislukt");
    const id = (row as { id: string }).id;

    try {
      const r = await sendViaResend({
        from,
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        html,
        text: fullBody,
        replyTo,
        headers: { "X-Mail-Message-Id": id },
        attachments: att.length ? att : undefined,
      });
      await context.supabase
        .from("mail_messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: r.id,
          thread_id: data.thread_id ?? id,
        } as never)
        .eq("id", id);

      // Log to CRM activities when client linked
      if (data.client_id) {
        await context.supabase.from("crm_activities").insert({
          organization_id: data.organization_id,
          client_id: data.client_id,
          kind: "email_sent",
          title: data.subject,
          body: data.body.slice(0, 1000),
          created_by: context.userId,
        } as never);
      }

      return { id, provider_id: r.id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await context.supabase
        .from("mail_messages")
        .update({ status: "failed", error: msg } as never)
        .eq("id", id);
      throw new Error(msg);
    }
  });

export const markMailRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("mail_messages")
      .update({ read_at: new Date().toISOString() } as never)
      .eq("id", data.id)
      .is("read_at", null);
    return { ok: true };
  });

export const getAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("mail-attachments")
      .createSignedUrl(data.path, 60 * 10);
    if (error || !signed) throw new Error(error?.message ?? "URL mislukt");
    return { url: signed.signedUrl };
  });

export const deleteAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ message_id: z.string().uuid(), path: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("mail_messages")
      .select("attachments")
      .eq("id", data.message_id)
      .single();
    if (error || !row) throw new Error(error?.message ?? "Niet gevonden");
    const list = ((row as { attachments: Array<{ path: string }> }).attachments ?? []).filter(
      (a) => a.path !== data.path,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from("mail-attachments").remove([data.path]);
    const { error: upErr } = await context.supabase
      .from("mail_messages")
      .update({ attachments: list } as never)
      .eq("id", data.message_id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

export const deleteMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("mail_messages")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
