import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkAttachmentSizes, isOrgPath, safeDisplayName } from "@/lib/mail-security";
// Note: skin-sanitize pulls in isomorphic-dompurify (jsdom) which is not
// Worker-safe at module init. Import lazily inside handlers that need it.

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

// The browser only sends an attachment id; the server resolves the path itself.
const ATTACH = z.object({
  id: z.string().uuid(),
  filename: z.string().max(255),
});

const SEND_SCHEMA = z.object({
  organization_id: z.string().uuid(),
  to: z.array(z.string().email()).min(1).max(20),
  cc: z.array(z.string().email()).max(20).optional().default([]),
  bcc: z.array(z.string().email()).max(20).optional().default([]),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(50000),
  from_name: z.string().max(120).optional(),
  reply_to: z.string().email().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  lead_id: z.string().uuid().optional().nullable(),
  in_reply_to: z.string().optional().nullable(),
  thread_id: z.string().uuid().optional().nullable(),
  attachments: z.array(ATTACH).max(10).optional().default([]),
  is_html: z.boolean().optional().default(false),
});

export const sendMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SEND_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase
      .from("organization_members").select("user_id")
      .eq("organization_id", data.organization_id).eq("user_id", context.userId).maybeSingle();
    if (!member) throw new Error("Geen toegang tot deze organisatie");
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
    const from_email = (s?.from_email || process.env.OUTREACH_FROM_EMAIL || "").trim();
    const { assertAllowedSender } = await import("@/lib/mail-sender.server");
    await assertAllowedSender(from_email);
    const from_name = safeDisplayName(data.from_name ?? s?.from_name ?? null);
    const from = from_name ? `${from_name} <${from_email}>` : from_email;
    const replyTo = data.reply_to || s?.reply_to || undefined;
    let html: string;
    let fullBody: string;
    let textPart: string;
    // Veiligheidsnet: een volledige HTML-mail (bv. uit een sjabloon) mag nooit
    // als platte tekst verstuurd worden, ook als een aanroeper is_html vergeet.
    const looksLikeHtml = /^\s*<!doctype html/i.test(data.body) || /^\s*<html[\s>]/i.test(data.body);
    if (data.is_html || looksLikeHtml) {
      // HTML-sjabloon: opmaak blijft intact, alleen onveilige stukken eruit halen.
      const { sanitizeMailHtml } = await import("@/lib/skin-sanitize");
      fullBody = s?.signature
        ? `${data.body}<div style="margin-top:16px">${s.signature.replace(/\n/g, "<br>")}</div>`
        : data.body;
      html = sanitizeMailHtml(fullBody);
      // Platte-tekstversie voor mailprogramma's die geen HTML tonen.
      textPart = fullBody
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&middot;/g, "·")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    } else {
      fullBody = s?.signature ? `${data.body}\n\n${s.signature}` : data.body;
      textPart = fullBody;
      html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;white-space:pre-wrap">${fullBody.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))}</div>`;
    }

    // Resolve attachments by id: only objects in this organization's folder.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const att: Array<{ filename: string; content: string }> = [];
    const stored: Array<{ id: string; path: string; filename: string; size: number; mime: string | null }> = [];
    if (data.attachments.length) {
      const ids = data.attachments.map((a) => a.id);
      const { data: objs, error: rErr } = await context.supabase.rpc("resolve_mail_attachments" as never, { _ids: ids } as never);
      if (rErr) throw new Error("Bijlagen konden niet worden gecontroleerd");
      const list = (objs ?? []) as Array<{ id: string; name: string; size: number; mime: string | null }>;
      for (const a of data.attachments) {
        const o = list.find((x) => x.id === a.id);
        if (!o || !isOrgPath(o.name, data.organization_id)) {
          throw new Error("Bijlage niet gevonden of hoort niet bij jouw organisatie");
        }
        stored.push({ id: o.id, path: o.name, filename: a.filename, size: Number(o.size) || 0, mime: o.mime });
      }
      const sizeErr = checkAttachmentSizes(stored.map((x) => x.size));
      if (sizeErr) throw new Error(sizeErr);
      for (const o of stored) {
        const { data: blob, error } = await supabaseAdmin.storage.from("mail-attachments").download(o.path);
        if (error || !blob) throw new Error(`Bijlage ${o.filename} kon niet worden geladen`);
        att.push({ filename: o.filename, content: Buffer.from(await blob.arrayBuffer()).toString("base64") });
      }
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
      body_text: textPart,
      body_html: html,
      in_reply_to: data.in_reply_to ?? null,
      client_id: data.client_id ?? null,
      lead_id: data.lead_id ?? null,
      attachments: stored,
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
        text: textPart,
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

const ATTACH_REF = z.object({ message_id: z.string().uuid(), attachment_id: z.string().min(1).max(64) });

type StoredAttach = { id?: string; path: string; filename: string };

/** Find an attachment on a message the caller can read (RLS) and verify its org folder. */
async function findOwnAttachment(
  supabase: { from: (t: string) => any },
  messageId: string,
  attachmentId: string,
) {
  const { data: row, error } = await supabase
    .from("mail_messages").select("id, organization_id, attachments").eq("id", messageId).maybeSingle();
  if (error || !row) throw new Error("Bijlage niet gevonden");
  const r = row as { organization_id: string; attachments: StoredAttach[] | null };
  const list = r.attachments ?? [];
  const idx = list.findIndex((a, i) => (a.id ?? `idx-${i}`) === attachmentId);
  const item = idx >= 0 ? list[idx] : undefined;
  if (!item || !isOrgPath(item.path, r.organization_id)) throw new Error("Bijlage niet gevonden of hoort niet bij jouw organisatie");
  return { list, idx, item };
}

export const getAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ATTACH_REF.parse(d))
  .handler(async ({ data, context }) => {
    const { item } = await findOwnAttachment(context.supabase as never, data.message_id, data.attachment_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("mail-attachments")
      .createSignedUrl(item.path, 60 * 10);
    if (error || !signed) throw new Error("Downloadlink maken mislukt");
    return { url: signed.signedUrl };
  });

export const deleteAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ATTACH_REF.parse(d))
  .handler(async ({ data, context }) => {
    const { list, idx, item } = await findOwnAttachment(context.supabase as never, data.message_id, data.attachment_id);
    const next = list.filter((_, i) => i !== idx);
    const { data: upd, error: upErr } = await context.supabase
      .from("mail_messages")
      .update({ attachments: next } as never)
      .eq("id", data.message_id)
      .select("id");
    if (upErr || !upd?.length) throw new Error("Verwijderen niet toegestaan");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from("mail-attachments").remove([item.path]);
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

const BULK_SCHEMA = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(["mark_read", "mark_unread", "delete", "move"]),
  folder: z.enum(["inbox", "sent", "draft"]).optional(),
});

export const bulkUpdateMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => BULK_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    if (data.action === "delete") {
      const { error } = await context.supabase
        .from("mail_messages")
        .delete()
        .in("id", data.ids);
      if (error) throw new Error(error.message);
      return { ok: true, count: data.ids.length };
    }
    if (data.action === "move") {
      if (!data.folder) throw new Error("folder ontbreekt");
      const { error } = await context.supabase
        .from("mail_messages")
        .update({ folder: data.folder } as never)
        .in("id", data.ids);
      if (error) throw new Error(error.message);
      return { ok: true, count: data.ids.length };
    }
    const patch =
      data.action === "mark_read"
        ? { read_at: new Date().toISOString() }
        : { read_at: null };
    const { error } = await context.supabase
      .from("mail_messages")
      .update(patch as never)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

const TEST_SCHEMA = z.object({
  organization_id: z.string().uuid(),
  to: z.string().email(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(50000),
  background_color: z.string().max(32).nullable().optional(),
  background_image_url: z.string().max(2000).nullable().optional(),
  header_html: z.string().max(20000).nullable().optional(),
  footer_html: z.string().max(20000).nullable().optional(),
  sample: z.record(z.string(), z.string()).optional().default({}),
  is_html: z.boolean().optional().default(false),
});

function renderTokensServer(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

export const sendTemplateTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => TEST_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    // Membership check — RLS-guarded
    const { data: m } = await context.supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", data.organization_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!m) throw new Error("Geen toegang tot deze organisatie");

    const { data: settings } = await context.supabase
      .from("mail_settings")
      .select("from_email, from_name")
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    const s = (settings ?? null) as { from_email: string | null; from_name: string | null } | null;
    const from_email = (s?.from_email || process.env.OUTREACH_FROM_EMAIL || "").trim();
    const { assertAllowedSender } = await import("@/lib/mail-sender.server");
    await assertAllowedSender(from_email);
    const testName = safeDisplayName(s?.from_name);
    const from = testName ? `${testName} <${from_email}>` : from_email;

    const sample = data.sample ?? {};
    const subject = `[TEST] ${renderTokensServer(data.subject, sample)}`;
    // In HTML mag een variabele geen markup toevoegen: waarden eerst veiliger maken.
    const safeSample = Object.fromEntries(
      Object.entries(sample).map(([k, v]) => [k, escapeHtml(String(v ?? ""))]),
    );
    const bodyRendered = renderTokensServer(
      data.body,
      data.is_html ? safeSample : sample,
    );

    const { sanitizeSkinHtml, sanitizeMailHtml, sanitizeColor, sanitizeImageUrl } = await import(
      "@/lib/skin-sanitize"
    );
    const bgColor = sanitizeColor(data.background_color ?? null) ?? "#ffffff";
    const bgImg = sanitizeImageUrl(data.background_image_url ?? null) ?? "";
    const safeHeader = sanitizeSkinHtml(data.header_html ?? "");
    const safeFooter = sanitizeSkinHtml(data.footer_html ?? "");
    const bgStyle = [
      `background-color:${bgColor}`,
      bgImg ? `background-image:url('${bgImg.replace(/'/g, "%27")}')` : "",
      bgImg ? "background-size:cover;background-position:center" : "",
    ]
      .filter(Boolean)
      .join(";");

    const html = `<!doctype html><html><body style="margin:0;padding:0;${bgStyle}">
<div style="max-width:640px;margin:0 auto;font-family:Inter,Arial,sans-serif;color:#111">
${safeHeader}
${data.is_html ? sanitizeMailHtml(bodyRendered) : `<div style="padding:24px;font-size:15px;line-height:1.6;white-space:pre-wrap">${escapeHtml(bodyRendered)}</div>`}
${safeFooter}
</div></body></html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.RESEND_API_KEY ?? ""}`,
      },
      body: JSON.stringify({ from, to: [data.to], subject, html }),
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`Resend ${res.status}: ${txt.slice(0, 300)}`);
    return { ok: true };
  });

