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
      .select("id, status, organization_id, credit_note_id")
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
      return { ok: true, action: "deleted" as const, credit_note_id: null as string | null, credit_emailed: false };
    }

    // Al geannuleerd óf er bestaat al een creditnota: nooit een tweede aanmaken
    if (inv.status === "cancelled" || inv.credit_note_id) {
      return {
        ok: true,
        action: "cancelled" as const,
        credit_note_id: (inv.credit_note_id as string | null) ?? null,
        credit_emailed: false,
      };
    }


    const { error: upErr } = await context.supabase
      .from("invoices")
      .update({ status: "cancelled" } as never)
      .eq("id", data.invoice_id);
    if (upErr) throw new Error(upErr.message);

    // Maak automatisch een creditnota voor het volledige factuurbedrag
    let creditNoteId: string | null = null;
    try {
      const { data: full } = await context.supabase
        .from("invoices")
        .select(
          "invoice_number, organization_id, client_id, client_name, currency, project_id, contract_id, subtotal_cents, vat_cents, total_cents, amount",
        )
        .eq("id", data.invoice_id)
        .maybeSingle();

      const { data: lines } = await context.supabase
        .from("invoice_lines")
        .select("position, description, quantity, unit_price_cents, vat_rate, subtotal_cents, vat_cents, total_cents, line_type, product_id, revenue_account_id")
        .eq("invoice_id", data.invoice_id)
        .order("position", { ascending: true });

      if (full) {
        const src = full as unknown as Record<string, unknown>;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: num } = await (supabaseAdmin.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: string | null }>)("next_invoice_number", {
          _org_id: inv.organization_id,
        });
        const creditNumber = `C-${num ?? `${Date.now()}`}`;
        const today = new Date().toISOString().slice(0, 10);

        const { data: created, error: cErr } = await supabaseAdmin
          .from("invoices")
          .insert({
            organization_id: inv.organization_id,
            invoice_number: creditNumber,
            status: "sent",
            issue_date: today,
            due_date: today,
            client_id: (src["client_id"] as string | null) ?? null,
            client_name: (src["client_name"] as string | null) ?? null,
            currency: (src["currency"] as string) ?? "EUR",
            project_id: (src["project_id"] as string | null) ?? null,
            contract_id: (src["contract_id"] as string | null) ?? null,
            subtotal_cents: -Number(src["subtotal_cents"] ?? 0),
            vat_cents: -Number(src["vat_cents"] ?? 0),
            total_cents: -Number(src["total_cents"] ?? 0),
            amount: -Number(src["amount"] ?? 0),
          } as never)
          .select("id")
          .single();
        if (cErr) throw new Error(cErr.message);
        creditNoteId = (created as { id: string }).id;

        const srcLines = (lines ?? []) as unknown as Array<Record<string, unknown>>;
        const creditLines = srcLines.length
          ? srcLines.map((l, i) => ({
              invoice_id: creditNoteId,
              position: i,
              description: `Creditering ${String(src["invoice_number"] ?? "")}: ${String(l["description"] ?? "")}`.slice(0, 1000),
              quantity: Number(l["quantity"] ?? 1),
              unit_price_cents: -Number(l["unit_price_cents"] ?? 0),
              vat_rate: Number(l["vat_rate"] ?? 21),
              subtotal_cents: -Number(l["subtotal_cents"] ?? 0),
              vat_cents: -Number(l["vat_cents"] ?? 0),
              total_cents: -Number(l["total_cents"] ?? 0),
              line_type: l["line_type"] ?? "item",
              product_id: (l["product_id"] as string | null) ?? null,
              revenue_account_id: (l["revenue_account_id"] as string | null) ?? null,
            }))
          : [
              {
                invoice_id: creditNoteId,
                position: 0,
                description: `Creditnota voor factuur ${String(src["invoice_number"] ?? "")}`,
                quantity: 1,
                unit_price_cents: -Number(src["subtotal_cents"] ?? 0),
                vat_rate: 21,
                subtotal_cents: -Number(src["subtotal_cents"] ?? 0),
                vat_cents: -Number(src["vat_cents"] ?? 0),
                total_cents: -Number(src["total_cents"] ?? 0),
                line_type: "item",
              },
            ];

        const { error: lErr } = await supabaseAdmin
          .from("invoice_lines")
          .insert(creditLines as never);
        if (lErr) throw new Error(lErr.message);

        // Koppel origineel <-> creditnota zodat we dit in het overzicht kunnen tonen
        await supabaseAdmin
          .from("invoices")
          .update({ credit_note_id: creditNoteId } as never)
          .eq("id", data.invoice_id);
        await supabaseAdmin
          .from("invoices")
          .update({ credit_of_invoice_id: data.invoice_id } as never)
          .eq("id", creditNoteId);
      }

    } catch (e) {
      console.warn("[deleteInvoice] creditnota aanmaken mislukt", e);
    }

    // Stuur automatisch een e-mail met de creditnota, mits de klant dat wil
    let creditEmailed = false;
    if (creditNoteId) {
      try {
        const { data: cn } = await context.supabase
          .from("invoices")
          .select("invoice_number, client_id, client_name, total_cents, currency, issue_date")
          .eq("id", creditNoteId)
          .maybeSingle();
        const c = (cn ?? null) as unknown as Record<string, unknown> | null;
        const clientId = (c?.["client_id"] as string | null) ?? null;
        if (c && clientId) {
          const { data: cl } = await context.supabase
            .from("clients")
            .select("email, credit_note_email, name")
            .eq("id", clientId)
            .maybeSingle();
          const client = (cl ?? null) as unknown as
            | { email: string | null; credit_note_email: boolean | null; name: string | null }
            | null;
          if (client?.email && client.credit_note_email !== false) {
            const { data: settings } = await context.supabase
              .from("mail_settings")
              .select("from_email, from_name, reply_to, signature")
              .eq("organization_id", inv.organization_id)
              .maybeSingle();
            const s = (settings ?? null) as {
              from_email: string | null;
              from_name: string | null;
              reply_to: string | null;
              signature: string | null;
            } | null;
            const fromEmail =
              s?.from_email || process.env.OUTREACH_FROM_EMAIL || "outreach@resend.dev";
            const from = s?.from_name ? `${s.from_name} <${fromEmail}>` : fromEmail;

            const creditNumber = String(c["invoice_number"] ?? "");
            const amount = Math.abs(Number(c["total_cents"] ?? 0)) / 100;
            const currency = (c["currency"] as string) ?? "EUR";
            const amountText = new Intl.NumberFormat("nl-NL", {
              style: "currency",
              currency,
            }).format(amount);
            const subject = `Creditnota ${creditNumber}`;
            const text = [
              `Beste ${client.name ?? "relatie"},`,
              "",
              `Hierbij bevestigen wij dat factuur is geannuleerd en dat wij creditnota ${creditNumber} hebben aangemaakt voor ${amountText}.`,
              "",
              "U hoeft verder niets te doen; het bedrag wordt met u verrekend.",
              s?.signature ? `\n${s.signature}` : "",
            ].join("\n");
            const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;white-space:pre-wrap">${text.replace(
              /[&<>]/g,
              (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]!),
            )}</div>`;

            const { data: logIns } = await context.supabase
              .from("invoice_email_log")
              .insert({
                organization_id: inv.organization_id,
                invoice_id: creditNoteId,
                to_email: client.email,
                cc_emails: [],
                subject,
                body: text,
                status: "sending",
                sent_by: context.userId,
              } as never)
              .select("id")
              .single();
            const logId = (logIns as { id: string } | null)?.id ?? null;

            try {
              const r = await sendViaResend({
                from,
                to: [client.email],
                subject,
                html,
                text,
                replyTo: s?.reply_to || undefined,
                attachments: [],
              });
              creditEmailed = true;
              if (logId) {
                await context.supabase
                  .from("invoice_email_log")
                  .update({ status: "sent", provider_message_id: r.id } as never)
                  .eq("id", logId);
              }
              await context.supabase
                .from("invoices")
                .update({ last_emailed_at: new Date().toISOString() } as never)
                .eq("id", creditNoteId);
            } catch (sendErr) {
              const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
              if (logId) {
                await context.supabase
                  .from("invoice_email_log")
                  .update({ status: "failed", error: msg } as never)
                  .eq("id", logId);
              }
              console.warn("[deleteInvoice] creditnota mailen mislukt", msg);
            }
          }
        }
      } catch (e) {
        console.warn("[deleteInvoice] creditnota mail-flow mislukt", e);
      }
    }

    return {
      ok: true,
      action: "cancelled" as const,
      credit_note_id: creditNoteId,
      credit_emailed: creditEmailed,
    };

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
  .handler(async ({ data, context }) => {
    // Verify caller can see this attachment under RLS before signing with admin key.
    const { data: att, error: attErr } = await context.supabase
      .from("invoice_attachments")
      .select("id")
      .eq("storage_path", data.storage_path)
      .maybeSingle();
    if (attErr) throw new Error(attErr.message);
    if (!att) throw new Error("Bijlage niet gevonden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("invoice-attachments")
      .createSignedUrl(data.storage_path, 60 * 10);
    if (error || !signed) throw new Error(error?.message ?? "URL mislukt");
    return { url: signed.signedUrl };
  });

/**
 * Info voor gedeeltelijk crediteren: factuurregels + wat er al gecrediteerd is.
 */
export const getInvoiceCreditInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select("id, invoice_number, status, currency, subtotal_cents, vat_cents, total_cents")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (error || !inv) throw new Error(error?.message ?? "Factuur niet gevonden");
    const i = inv as unknown as Record<string, unknown>;

    const { data: lines } = await context.supabase
      .from("invoice_lines")
      .select("id, position, description, quantity, unit_price_cents, vat_rate, subtotal_cents, vat_cents, total_cents")
      .eq("invoice_id", data.invoice_id)
      .order("position", { ascending: true });

    const { data: credits } = await context.supabase
      .from("invoices")
      .select("id, invoice_number, total_cents, issue_date")
      .eq("credit_of_invoice_id", data.invoice_id);

    const creditRows = (credits ?? []) as unknown as Array<Record<string, unknown>>;
    const creditedCents = creditRows.reduce(
      (s, c) => s + Math.abs(Number(c["total_cents"] ?? 0)),
      0,
    );
    const totalCents = Number(i["total_cents"] ?? 0);

    return {
      invoice: {
        id: String(i["id"]),
        invoice_number: (i["invoice_number"] as string | null) ?? null,
        status: String(i["status"] ?? ""),
        currency: (i["currency"] as string) ?? "EUR",
        total_cents: totalCents,
      },
      lines: ((lines ?? []) as unknown as Array<Record<string, unknown>>).map((l) => ({
        id: String(l["id"]),
        description: String(l["description"] ?? ""),
        quantity: Number(l["quantity"] ?? 1),
        unit_price_cents: Number(l["unit_price_cents"] ?? 0),
        vat_rate: Number(l["vat_rate"] ?? 21),
        subtotal_cents: Number(l["subtotal_cents"] ?? 0),
        vat_cents: Number(l["vat_cents"] ?? 0),
        total_cents: Number(l["total_cents"] ?? 0),
      })),
      credits: creditRows.map((c) => ({
        id: String(c["id"]),
        invoice_number: (c["invoice_number"] as string | null) ?? null,
        total_cents: Number(c["total_cents"] ?? 0),
        issue_date: (c["issue_date"] as string | null) ?? null,
      })),
      credited_cents: creditedCents,
      remaining_cents: Math.max(0, totalCents - creditedCents),
    };
  });

const PartialCreditSchema = z
  .object({
    invoice_id: z.string().uuid(),
    mode: z.enum(["lines", "amount"]),
    lines: z
      .array(
        z.object({
          line_id: z.string().uuid(),
          quantity: z.number().positive(),
        }),
      )
      .max(200)
      .optional(),
    amount_cents: z.number().int().positive().optional(),
    vat_rate: z.number().min(0).max(30).optional(),
    description: z.string().trim().max(1000).optional(),
    send_email: z.boolean().optional(),
  })
  .refine((v) => (v.mode === "lines" ? (v.lines?.length ?? 0) > 0 : !!v.amount_cents), {
    message: "Kies regels of vul een bedrag in",
  });

/**
 * Crediteert een deel van een factuur met een eigen creditnota.
 * De originele factuur blijft staan; pas bij volledige creditering wordt die geannuleerd.
 */
export const creditInvoicePartial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PartialCreditSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select(
        "id, organization_id, status, invoice_number, client_id, client_name, currency, project_id, contract_id, total_cents",
      )
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (error || !inv) throw new Error(error?.message ?? "Factuur niet gevonden");
    const src = inv as unknown as Record<string, unknown>;
    if (String(src["status"]) === "draft") {
      throw new Error("Een concept kan niet gecrediteerd worden");
    }

    const orgId = String(src["organization_id"]);
    const invoiceTotal = Number(src["total_cents"] ?? 0);

    const { data: credits } = await context.supabase
      .from("invoices")
      .select("total_cents")
      .eq("credit_of_invoice_id", data.invoice_id);
    const alreadyCredited = ((credits ?? []) as unknown as Array<Record<string, unknown>>).reduce(
      (s, c) => s + Math.abs(Number(c["total_cents"] ?? 0)),
      0,
    );
    const remaining = invoiceTotal - alreadyCredited;
    if (remaining <= 0) throw new Error("Deze factuur is al volledig gecrediteerd");

    // Bouw de creditregels (positieve bedragen; worden hieronder negatief opgeslagen)
    type Built = {
      description: string;
      quantity: number;
      unit_price_cents: number;
      vat_rate: number;
      subtotal_cents: number;
      vat_cents: number;
      total_cents: number;
    };
    const built: Built[] = [];

    if (data.mode === "lines") {
      const ids = (data.lines ?? []).map((l) => l.line_id);
      const { data: srcLines, error: lErr } = await context.supabase
        .from("invoice_lines")
        .select("id, description, quantity, unit_price_cents, vat_rate")
        .eq("invoice_id", data.invoice_id)
        .in("id", ids);
      if (lErr) throw new Error(lErr.message);
      const byId = new Map(
        ((srcLines ?? []) as unknown as Array<Record<string, unknown>>).map((l) => [
          String(l["id"]),
          l,
        ]),
      );
      for (const sel of data.lines ?? []) {
        const l = byId.get(sel.line_id);
        if (!l) throw new Error("Regel hoort niet bij deze factuur");
        const maxQty = Number(l["quantity"] ?? 1);
        if (sel.quantity > maxQty + 1e-9) {
          throw new Error(`Aantal hoger dan op de factuur (max ${maxQty})`);
        }
        const unit = Number(l["unit_price_cents"] ?? 0);
        const rate = Number(l["vat_rate"] ?? 21);
        const sub = Math.round(sel.quantity * unit);
        const vat = Math.round((sub * rate) / 100);
        built.push({
          description: `Creditering ${String(src["invoice_number"] ?? "")}: ${String(l["description"] ?? "")}`.slice(0, 1000),
          quantity: sel.quantity,
          unit_price_cents: unit,
          vat_rate: rate,
          subtotal_cents: sub,
          vat_cents: vat,
          total_cents: sub + vat,
        });
      }
    } else {
      const rate = data.vat_rate ?? 21;
      // amount_cents is inclusief btw ingevoerd bedrag
      const gross = data.amount_cents!;
      const sub = Math.round(gross / (1 + rate / 100));
      const vat = gross - sub;
      built.push({
        description:
          data.description?.trim() ||
          `Gedeeltelijke creditering factuur ${String(src["invoice_number"] ?? "")}`,
        quantity: 1,
        unit_price_cents: sub,
        vat_rate: rate,
        subtotal_cents: sub,
        vat_cents: vat,
        total_cents: gross,
      });
    }

    const subtotal = built.reduce((s, l) => s + l.subtotal_cents, 0);
    const vatTotal = built.reduce((s, l) => s + l.vat_cents, 0);
    const total = subtotal + vatTotal;
    if (total <= 0) throw new Error("Creditbedrag moet groter dan nul zijn");
    if (total > remaining + 1) {
      throw new Error(
        `Creditbedrag is hoger dan het openstaande te crediteren bedrag (${(remaining / 100).toFixed(2)})`,
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: num } = await (supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: string | null }>)("next_invoice_number", { _org_id: orgId });
    const creditNumber = `C-${num ?? `${Date.now()}`}`;
    const today = new Date().toISOString().slice(0, 10);

    const { data: created, error: cErr } = await supabaseAdmin
      .from("invoices")
      .insert({
        organization_id: orgId,
        invoice_number: creditNumber,
        status: "sent",
        issue_date: today,
        due_date: today,
        client_id: (src["client_id"] as string | null) ?? null,
        client_name: (src["client_name"] as string | null) ?? null,
        currency: (src["currency"] as string) ?? "EUR",
        project_id: (src["project_id"] as string | null) ?? null,
        contract_id: (src["contract_id"] as string | null) ?? null,
        credit_of_invoice_id: data.invoice_id,
        subtotal_cents: -subtotal,
        vat_cents: -vatTotal,
        total_cents: -total,
        amount: -total / 100,
      } as never)
      .select("id")
      .single();
    if (cErr || !created) throw new Error(cErr?.message ?? "Creditnota aanmaken mislukt");
    const creditNoteId = (created as { id: string }).id;

    const { error: linesErr } = await supabaseAdmin.from("invoice_lines").insert(
      built.map((l, i) => ({
        invoice_id: creditNoteId,
        position: i,
        description: l.description,
        quantity: l.quantity,
        unit_price_cents: -l.unit_price_cents,
        vat_rate: l.vat_rate,
        subtotal_cents: -l.subtotal_cents,
        vat_cents: -l.vat_cents,
        total_cents: -l.total_cents,
        line_type: "item",
      })) as never,
    );
    if (linesErr) throw new Error(linesErr.message);

    // Volledig gecrediteerd? Dan de originele factuur annuleren en koppelen.
    const fullyCredited = alreadyCredited + total >= invoiceTotal - 1;
    if (fullyCredited) {
      await supabaseAdmin
        .from("invoices")
        .update({ status: "cancelled", credit_note_id: creditNoteId } as never)
        .eq("id", data.invoice_id);
    }

    let emailed = false;
    if (data.send_email !== false) {
      const { emailCreditNoteIfWanted } = await import("@/lib/credit-note.server");
      emailed = await emailCreditNoteIfWanted({
        supabase: supabaseAdmin as never,
        organizationId: orgId,
        creditNoteId,
        userId: context.userId,
        originalNumber: (src["invoice_number"] as string | null) ?? null,
      });
    }

    return {
      ok: true,
      credit_note_id: creditNoteId,
      credit_note_number: creditNumber,
      credited_cents: total,
      remaining_cents: Math.max(0, remaining - total),
      fully_credited: fullyCredited,
      credit_emailed: emailed,
    };
  });
