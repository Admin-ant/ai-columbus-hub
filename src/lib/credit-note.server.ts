/**
 * Server-only helpers rond creditnota's (mailen volgens klantvoorkeur).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type AnyClient = SupabaseClient<never, never, never>;

async function sendViaResend(opts: {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY ontbreekt");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      reply_to: opts.replyTo,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body) as { id: string };
}

/**
 * Mailt de creditnota naar de klant als die dat wil (clients.credit_note_email).
 * Gooit nooit; geeft terug of er verstuurd is.
 */
export async function emailCreditNoteIfWanted(args: {
  supabase: AnyClient;
  organizationId: string;
  creditNoteId: string;
  userId: string;
  originalNumber?: string | null;
}): Promise<boolean> {
  const { supabase, organizationId, creditNoteId, userId } = args;
  try {
    const { data: cn } = await supabase
      .from("invoices")
      .select("invoice_number, client_id, client_name, total_cents, currency")
      .eq("id", creditNoteId)
      .maybeSingle();
    const c = (cn ?? null) as unknown as Record<string, unknown> | null;
    const clientId = (c?.["client_id"] as string | null) ?? null;
    if (!c || !clientId) return false;

    const { data: cl } = await supabase
      .from("clients")
      .select("email, credit_note_email, name")
      .eq("id", clientId)
      .maybeSingle();
    const client = (cl ?? null) as unknown as
      | { email: string | null; credit_note_email: boolean | null; name: string | null }
      | null;
    if (!client?.email || client.credit_note_email === false) return false;

    const { data: settings } = await supabase
      .from("mail_settings")
      .select("from_email, from_name, reply_to, signature")
      .eq("organization_id", organizationId)
      .maybeSingle();
    const s = (settings ?? null) as {
      from_email: string | null;
      from_name: string | null;
      reply_to: string | null;
      signature: string | null;
    } | null;
    const fromEmail = s?.from_email || process.env.OUTREACH_FROM_EMAIL || "outreach@resend.dev";
    const from = s?.from_name ? `${s.from_name} <${fromEmail}>` : fromEmail;

    const creditNumber = String(c["invoice_number"] ?? "");
    const currency = (c["currency"] as string) ?? "EUR";
    const amountText = new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(
      Math.abs(Number(c["total_cents"] ?? 0)) / 100,
    );
    const subject = `Creditnota ${creditNumber}`;
    const text = [
      `Beste ${client.name ?? "relatie"},`,
      "",
      args.originalNumber
        ? `Hierbij creditnota ${creditNumber} voor ${amountText} met betrekking tot factuur ${args.originalNumber}.`
        : `Hierbij creditnota ${creditNumber} voor ${amountText}.`,
      "",
      "Het bedrag wordt met u verrekend.",
      s?.signature ? `\n${s.signature}` : "",
    ].join("\n");
    const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;white-space:pre-wrap">${text.replace(
      /[&<>]/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!,
    )}</div>`;

    const { data: logIns } = await supabase
      .from("invoice_email_log")
      .insert({
        organization_id: organizationId,
        invoice_id: creditNoteId,
        to_email: client.email,
        cc_emails: [],
        subject,
        body: text,
        status: "sending",
        sent_by: userId,
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
      });
      if (logId) {
        await supabase
          .from("invoice_email_log")
          .update({ status: "sent", provider_message_id: r.id } as never)
          .eq("id", logId);
      }
      await supabase
        .from("invoices")
        .update({ last_emailed_at: new Date().toISOString() } as never)
        .eq("id", creditNoteId);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (logId) {
        await supabase
          .from("invoice_email_log")
          .update({ status: "failed", error: msg } as never)
          .eq("id", logId);
      }
      console.warn("[creditNote] mailen mislukt", msg);
      return false;
    }
  } catch (e) {
    console.warn("[creditNote] mail-flow mislukt", e);
    return false;
  }
}
