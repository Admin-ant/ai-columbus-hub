/**
 * Logt uitgaande/inkomende app-mails in `mail_messages`, zodat ze in de
 * inbox van de app zichtbaar zijn (statusmails, meldingsmails, ticketmails).
 * Server-only.
 */
export type MailLogEntry = {
  organizationId: string;
  folder: "inbox" | "sent";
  fromEmail: string | null;
  fromName?: string | null;
  to: string[];
  subject: string;
  html: string;
  text?: string | null;
  clientId?: string | null;
  attachments?: { filename: string; mime?: string | null; size?: number | null; url?: string | null }[];
  status?: string;
};

export async function logMailMessage(entry: MailLogEntry) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    await supabaseAdmin.from("mail_messages").insert({
      organization_id: entry.organizationId,
      folder: entry.folder,
      from_email: entry.fromEmail,
      from_name: entry.fromName ?? null,
      to_emails: entry.to,
      subject: entry.subject,
      body_html: entry.html,
      body_text: entry.text ?? entry.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      client_id: entry.clientId ?? null,
      attachments: (entry.attachments ?? []) as never,
      status: entry.status ?? "sent",
      sent_at: now,
      received_at: entry.folder === "inbox" ? now : null,
    } as never);
  } catch (e) {
    console.error("[mail-log] insert failed", e);
  }
}
