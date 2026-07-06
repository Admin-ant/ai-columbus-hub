import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LineSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  quantity: z.number().positive(),
  unit_price_cents: z.number().int().nonnegative(),
  vat_rate: z.number().min(0).max(30),
});

const UpdateSchema = z.object({
  invoice_id: z.string().uuid(),
  client_id: z.string().uuid().nullable().optional(),
  client_name: z.string().trim().min(1).max(200),
  issue_date: z.string().min(1),
  due_date: z.string().min(1),
  pdf_filename: z.string().trim().max(200).nullable().optional(),
  lines: z.array(LineSchema).min(1).max(200),
});

export const updateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select("id, organization_id, status")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (error || !inv) throw new Error(error?.message ?? "Factuur niet gevonden");
    if (inv.status !== "draft") {
      throw new Error("Alleen concepten mogen bewerkt worden");
    }

    const lines = data.lines.map((l, i) => {
      const sub = Math.round(l.quantity * l.unit_price_cents);
      const vat = Math.round((sub * l.vat_rate) / 100);
      return {
        invoice_id: data.invoice_id,
        position: i + 1,
        description: l.description,
        quantity: l.quantity,
        unit_price_cents: l.unit_price_cents,
        vat_rate: l.vat_rate,
        subtotal_cents: sub,
        vat_cents: vat,
        total_cents: sub + vat,
      };
    });
    const subtotal = lines.reduce((s, l) => s + l.subtotal_cents, 0);
    const vat = lines.reduce((s, l) => s + l.vat_cents, 0);
    const total = subtotal + vat;

    const { error: delErr } = await context.supabase
      .from("invoice_lines")
      .delete()
      .eq("invoice_id", data.invoice_id);
    if (delErr) throw new Error(delErr.message);

    const { error: insErr } = await context.supabase
      .from("invoice_lines")
      .insert(lines as never);
    if (insErr) throw new Error(insErr.message);

    const patch: Record<string, unknown> = {
      client_id: data.client_id ?? null,
      client_name: data.client_name,
      issue_date: data.issue_date,
      due_date: data.due_date,
      subtotal_cents: subtotal,
      vat_cents: vat,
      total_cents: total,
      amount: total / 100,
    };
    if (data.pdf_filename !== undefined) patch.pdf_filename = data.pdf_filename;

    const { error: upErr } = await context.supabase
      .from("invoices")
      .update(patch as never)
      .eq("id", data.invoice_id);
    if (upErr) throw new Error(upErr.message);

    return { ok: true, subtotal_cents: subtotal, vat_cents: vat, total_cents: total };
  });

/**
 * Delete = alleen als draft. Anders annuleren (status='cancelled').
 */
export const deleteInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select("id, status, organization_id")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (error || !inv) throw new Error(error?.message ?? "Factuur niet gevonden");

    if (inv.status === "draft") {
      // Verwijder eventuele losse bijlagen uit storage
      const { data: atts } = await context.supabase
        .from("invoice_attachments")
        .select("storage_path")
        .eq("invoice_id", data.invoice_id);
      const paths = (atts ?? []).map((a) => (a as { storage_path: string }).storage_path);
      if (paths.length) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.storage.from("invoice-attachments").remove(paths);
      }
      const { error: delErr } = await context.supabase
        .from("invoices")
        .delete()
        .eq("id", data.invoice_id);
      if (delErr) throw new Error(delErr.message);
      return { ok: true, action: "deleted" as const };
    }

    const { error: upErr } = await context.supabase
      .from("invoices")
      .update({ status: "cancelled" } as never)
      .eq("id", data.invoice_id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, action: "cancelled" as const };
  });

const EmailSchema = z.object({
  invoice_id: z.string().uuid(),
  to: z.array(z.string().email()).min(1).max(10),
  cc: z.array(z.string().email()).max(10).optional().default([]),
  subject: z.string().trim().min(1).max(300),
  body: z.string().min(1).max(20000),
  pdf_storage_path: z.string().min(1), // path in mail-attachments bucket
  pdf_filename: z.string().trim().min(1).max(200),
  extra_attachment_paths: z.array(z.string()).max(10).optional().default([]),
  mark_as_sent: z.boolean().optional().default(true),
});

async function sendViaResend(opts: {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments: Array<{ filename: string; content: string }>;
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
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      reply_to: opts.replyTo,
      attachments: opts.attachments,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body) as { id: string };
}

export const emailInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => EmailSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select("id, organization_id, invoice_number, client_name, status")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (error || !inv) throw new Error(error?.message ?? "Factuur niet gevonden");

    const { data: settings } = await context.supabase
      .from("mail_settings")
      .select("from_email, from_name, reply_to, signature")
      .eq("organization_id", (inv as { organization_id: string }).organization_id)
      .maybeSingle();
    const s = (settings ?? null) as {
      from_email: string | null;
      from_name: string | null;
      reply_to: string | null;
      signature: string | null;
    } | null;
    const from_email = s?.from_email || process.env.OUTREACH_FROM_EMAIL || "outreach@resend.dev";
    const from_name = s?.from_name ?? null;
    const from = from_name ? `${from_name} <${from_email}>` : from_email;
    const replyTo = s?.reply_to || undefined;
    const fullBody = s?.signature ? `${data.body}\n\n${s.signature}` : data.body;
    const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;white-space:pre-wrap">${fullBody.replace(
      /[&<>]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!),
    )}</div>`;

    // Load PDF + extras
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const attachments: Array<{ filename: string; content: string }> = [];
    const { data: pdfBlob, error: pdfErr } = await supabaseAdmin.storage
      .from("mail-attachments")
      .download(data.pdf_storage_path);
    if (pdfErr || !pdfBlob) throw new Error("PDF-bijlage niet gevonden: " + (pdfErr?.message ?? ""));
    attachments.push({
      filename: data.pdf_filename,
      content: Buffer.from(await pdfBlob.arrayBuffer()).toString("base64"),
    });
    for (const p of data.extra_attachment_paths ?? []) {
      const { data: b } = await supabaseAdmin.storage
        .from("invoice-attachments")
        .download(p);
      if (!b) continue;
      const name = p.split("/").pop() ?? "bijlage";
      attachments.push({
        filename: name.replace(/^[0-9a-f-]+-/i, ""),
        content: Buffer.from(await b.arrayBuffer()).toString("base64"),
      });
    }

    // Pre-log
    const logRow = {
      organization_id: (inv as { organization_id: string }).organization_id,
      invoice_id: data.invoice_id,
      to_email: data.to.join(", "),
      cc_emails: data.cc ?? [],
      subject: data.subject,
      body: fullBody,
      status: "sending",
      sent_by: context.userId,
    };
    const { data: logIns, error: logErr } = await context.supabase
      .from("invoice_email_log")
      .insert(logRow as never)
      .select("id")
      .single();
    if (logErr || !logIns) throw new Error(logErr?.message ?? "Log mislukt");
    const logId = (logIns as { id: string }).id;

    try {
      const r = await sendViaResend({
        from,
        to: data.to,
        cc: data.cc,
        subject: data.subject,
        html,
        text: fullBody,
        replyTo,
        attachments,
      });

      // Cleanup PDF blob from mail-attachments (best-effort)
      await supabaseAdmin.storage.from("mail-attachments").remove([data.pdf_storage_path]);

      await context.supabase
        .from("invoice_email_log")
        .update({ status: "sent", provider_message_id: r.id } as never)
        .eq("id", logId);

      const invPatch: Record<string, unknown> = { last_emailed_at: new Date().toISOString() };
      if (data.mark_as_sent && (inv as { status: string }).status === "draft") {
        invPatch.status = "sent";
        invPatch.sent_at = new Date().toISOString();
      }
      await context.supabase.from("invoices").update(invPatch as never).eq("id", data.invoice_id);

      return { ok: true, provider_id: r.id, log_id: logId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await context.supabase
        .from("invoice_email_log")
        .update({ status: "failed", error: msg } as never)
        .eq("id", logId);
      throw new Error(msg);
    }
  });

export const removeInvoiceAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ attachment_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: att, error } = await context.supabase
      .from("invoice_attachments")
      .select("id, storage_path")
      .eq("id", data.attachment_id)
      .maybeSingle();
    if (error || !att) throw new Error(error?.message ?? "Bijlage niet gevonden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage
      .from("invoice-attachments")
      .remove([(att as { storage_path: string }).storage_path]);
    const { error: delErr } = await context.supabase
      .from("invoice_attachments")
      .delete()
      .eq("id", data.attachment_id);
    if (delErr) throw new Error(delErr.message);
    return { ok: true };
  });

export const getInvoiceAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ storage_path: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("invoice-attachments")
      .createSignedUrl(data.storage_path, 60 * 10);
    if (error || !signed) throw new Error(error?.message ?? "URL mislukt");
    return { url: signed.signedUrl };
  });
