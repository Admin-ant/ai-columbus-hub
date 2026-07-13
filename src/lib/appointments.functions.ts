import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toIcsDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildIcs(opts: {
  uid: string;
  sequence: number;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  organizerEmail: string;
  organizerName?: string | null;
  attendeeEmail?: string | null;
  attendeeName?: string | null;
  method?: "REQUEST" | "CANCEL";
}): string {
  const method = opts.method ?? "REQUEST";
  const now = toIcsDate(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AI van Columbus//Agenda//NL",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `SEQUENCE:${opts.sequence}`,
    `DTSTAMP:${now}`,
    `DTSTART:${toIcsDate(opts.startsAt)}`,
    `DTEND:${toIcsDate(opts.endsAt)}`,
    `SUMMARY:${escapeIcs(opts.title)}`,
  ];
  if (opts.description) lines.push(`DESCRIPTION:${escapeIcs(opts.description)}`);
  if (opts.location) lines.push(`LOCATION:${escapeIcs(opts.location)}`);
  lines.push(
    `ORGANIZER;CN=${escapeIcs(opts.organizerName ?? opts.organizerEmail)}:mailto:${opts.organizerEmail}`,
  );
  if (opts.attendeeEmail) {
    lines.push(
      `ATTENDEE;CN=${escapeIcs(opts.attendeeName ?? opts.attendeeEmail)};RSVP=TRUE:mailto:${opts.attendeeEmail}`,
    );
  }
  lines.push(`STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

const AppointmentSchema = z.object({
  organization_id: z.string().uuid(),
  client_id: z.string().uuid().optional().nullable(),
  lead_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  location: z.string().max(300).optional().nullable(),
  starts_at: z.string(),
  ends_at: z.string(),
  attendee_name: z.string().max(200).optional().nullable(),
  attendee_email: z.string().email().optional().nullable().or(z.literal("")),
});

export const createAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => AppointmentSchema.parse(d))
  .handler(async ({ data, context }) => {
    const row = {
      organization_id: data.organization_id,
      client_id: data.client_id || null,
      lead_id: data.lead_id || null,
      title: data.title,
      description: data.description || null,
      location: data.location || null,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      attendee_name: data.attendee_name || null,
      attendee_email: data.attendee_email || null,
      created_by: context.userId,
    };
    const { data: created, error } = await context.supabase
      .from("appointments")
      .insert(row as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return created as { id: string };
  });

export const updateAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    AppointmentSchema.extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    // Increment sequence for calendar clients
    const { data: existing } = await context.supabase
      .from("appointments")
      .select("ics_sequence")
      .eq("id", id)
      .single();
    const seq = ((existing as { ics_sequence: number } | null)?.ics_sequence ?? 0) + 1;
    const { error } = await context.supabase
      .from("appointments")
      .update({ ...patch, ics_sequence: seq } as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("appointments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const InviteSchema = z.object({
  id: z.string().uuid(),
  message: z.string().max(4000).optional(),
  cancel: z.boolean().optional().default(false),
});

export const sendAppointmentInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => InviteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: appt, error } = await context.supabase
      .from("appointments")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !appt) throw new Error(error?.message ?? "Afspraak niet gevonden");
    const a = appt as {
      id: string;
      organization_id: string;
      title: string;
      description: string | null;
      location: string | null;
      starts_at: string;
      ends_at: string;
      attendee_email: string | null;
      attendee_name: string | null;
      ics_uid: string;
      ics_sequence: number;
      confirm_token: string;
    };
    if (!a.attendee_email) throw new Error("Geen e-mailadres van deelnemer bekend");

    const { data: settings } = await context.supabase
      .from("mail_settings")
      .select("from_email, from_name, reply_to")
      .eq("organization_id", a.organization_id)
      .maybeSingle();
    const s = settings as { from_email: string | null; from_name: string | null; reply_to: string | null } | null;
    const fromEmail = s?.from_email || process.env.OUTREACH_FROM_EMAIL || "outreach@resend.dev";
    const fromName = s?.from_name || "AI van Columbus";
    const from = `${fromName} <${fromEmail}>`;

    const method = data.cancel ? "CANCEL" : "REQUEST";
    const ics = buildIcs({
      uid: a.ics_uid,
      sequence: a.ics_sequence,
      title: a.title,
      description: a.description,
      location: a.location,
      startsAt: a.starts_at,
      endsAt: a.ends_at,
      organizerEmail: fromEmail,
      organizerName: fromName,
      attendeeEmail: a.attendee_email,
      attendeeName: a.attendee_name,
      method,
    });

    const startDate = new Date(a.starts_at);
    const endDate = new Date(a.ends_at);
    const dateStr = startDate.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const timeStr = `${startDate.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })} – ${endDate.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`;
    const dt = `${dateStr} · ${timeStr}`;

    const appUrl = process.env.APP_PUBLIC_URL || "https://ai-columbus-hub.lovable.app";
    const actionUrl = `${appUrl}/afspraak/${a.confirm_token}`;
    const logoUrl = `${appUrl}/__l5e/assets-v1/85be082d-1ee9-479b-8166-888a14e2734d/logo-columbus-full.png`;

    const heading = data.cancel ? "Afspraak geannuleerd" : "Bevestig je afspraak";
    const intro = data.cancel
      ? `Beste ${a.attendee_name ?? "relatie"}, hierbij bevestigen we dat onderstaande afspraak is geannuleerd.`
      : `Beste ${a.attendee_name ?? "relatie"}, we kijken uit naar onderstaande afspraak. Laat even weten of het schikt met de knop hieronder.`;
    const customMessage = data.message?.trim() ? data.message.trim() : "";

    const bodyText = `${intro}\n\n${a.title}\n${dt}${a.location ? `\nLocatie: ${a.location}` : ""}${a.description ? `\n\n${a.description}` : ""}${customMessage ? `\n\n${customMessage}` : ""}\n\nBevestig of verzet je afspraak:\n${actionUrl}\n\nMet vriendelijke groet,\n${fromName}`;

    const html = renderAppointmentHtml({
      heading,
      intro,
      title: a.title,
      dateStr,
      timeStr,
      location: a.location,
      description: a.description,
      customMessage,
      actionUrl,
      fromName,
      logoUrl,
      cancelled: data.cancel === true,
    });

    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY ontbreekt");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to: [a.attendee_email],
        subject: `${data.cancel ? "[Geannuleerd] " : ""}${a.title} — ${dateStr}`,
        html,
        text: bodyText,
        reply_to: s?.reply_to || undefined,
        headers: { "Content-Class": "urn:content-classes:calendarmessage" },
        attachments: [
          {
            filename: "afspraak.ics",
            content: Buffer.from(ics, "utf8").toString("base64"),
            content_type: `text/calendar; method=${method}; charset=UTF-8`,
          },
        ],
      }),
    });
    const respBody = await res.text();
    if (!res.ok) throw new Error(`Resend ${res.status}: ${respBody.slice(0, 300)}`);

    const patch: Record<string, unknown> = { invite_sent_at: new Date().toISOString() };
    if (data.cancel) patch.status = "cancelled";
    await context.supabase
      .from("appointments")
      .update(patch as never)
      .eq("id", a.id);

    return { ok: true };
  });

function renderAppointmentHtml(opts: {
  heading: string;
  intro: string;
  title: string;
  dateStr: string;
  timeStr: string;
  location: string | null;
  description: string | null;
  customMessage: string;
  actionUrl: string;
  fromName: string;
  logoUrl: string;
  cancelled: boolean;
}): string {
  const accent = "#ff6a3d";
  const btnPrimary = `background:${accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;display:inline-block;font-size:15px;`;
  const btnSecondary = `background:#ffffff;color:#1a1a1a;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;display:inline-block;font-size:15px;border:1.5px solid #e5e0d5;margin-left:8px;`;
  const buttons = opts.cancelled
    ? ""
    : `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0"><tr>
         <td><a href="${escapeAttr(opts.actionUrl)}?a=confirm" style="${btnPrimary}">✓ Bevestigen</a></td>
         <td><a href="${escapeAttr(opts.actionUrl)}?a=reschedule" style="${btnSecondary}">↻ Verzetten</a></td>
       </tr></table>`;

  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(opts.title)}</title></head>
<body style="margin:0;padding:0;background:#faf7f2;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#faf7f2;padding:32px 12px">
  <tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%">
      <tr><td align="center" style="padding-bottom:20px">
        <img src="${escapeAttr(opts.logoUrl)}" alt="AI van Columbus" width="200" style="max-width:220px;height:auto;display:block">
      </td></tr>
      <tr><td style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.06)">
        <div style="background:linear-gradient(135deg,#ff6a3d 0%,#ff8a4a 55%,#ffb37a 100%);color:#ffffff;padding:32px 32px 28px">
          <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.9">${escapeHtml(opts.heading)}</div>
          <h1 style="margin:8px 0 0;font-size:26px;line-height:1.25;font-weight:700">${escapeHtml(opts.title)}</h1>
          <div style="margin-top:18px;font-size:15px;opacity:0.95">
            📅 ${escapeHtml(opts.dateStr)}<br>
            🕐 ${escapeHtml(opts.timeStr)}
            ${opts.location ? `<br>📍 ${escapeHtml(opts.location)}` : ""}
          </div>
        </div>
        <div style="padding:28px 32px 32px">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a3a3a">${escapeHtml(opts.intro)}</p>
          ${opts.description ? `<div style="background:#faf7f2;border-radius:10px;padding:16px 18px;font-size:14px;line-height:1.6;color:#3a3a3a;white-space:pre-wrap;margin-bottom:8px">${escapeHtml(opts.description)}</div>` : ""}
          ${opts.customMessage ? `<div style="border-left:3px solid ${accent};padding:6px 0 6px 14px;font-size:14px;line-height:1.6;color:#3a3a3a;white-space:pre-wrap;margin-top:16px">${escapeHtml(opts.customMessage)}</div>` : ""}
          ${buttons}
          ${opts.cancelled ? `<p style="margin:8px 0 0;font-size:13px;color:#8a8a8a">Deze afspraak staat als geannuleerd in je agenda.</p>` : `<p style="margin:8px 0 0;font-size:13px;color:#8a8a8a">Werkt de knop niet? Open dan deze link: <a href="${escapeAttr(opts.actionUrl)}" style="color:${accent}">${escapeHtml(opts.actionUrl)}</a></p>`}
        </div>
        <div style="background:#faf7f2;padding:16px 32px;text-align:center;font-size:12px;color:#8a8a8a;border-top:1px solid #efe9dd">
          Met vriendelijke groet, ${escapeHtml(opts.fromName)}
        </div>
      </td></tr>
      <tr><td align="center" style="padding-top:16px;font-size:11px;color:#a8a29a">
        Deze mail is verzonden vanuit AI van Columbus • ${escapeHtml(opts.dateStr)}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
