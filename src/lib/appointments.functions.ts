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
    };
    if (!a.attendee_email) throw new Error("Geen e-mailadres van deelnemer bekend");

    const { data: settings } = await context.supabase
      .from("mail_settings")
      .select("from_email, from_name, reply_to")
      .eq("organization_id", a.organization_id)
      .maybeSingle();
    const s = settings as { from_email: string | null; from_name: string | null; reply_to: string | null } | null;
    const fromEmail = s?.from_email || process.env.OUTREACH_FROM_EMAIL || "outreach@resend.dev";
    const fromName = s?.from_name || "Agenda";
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

    const dt = new Date(a.starts_at).toLocaleString("nl-NL", {
      dateStyle: "full",
      timeStyle: "short",
    });
    const heading = data.cancel ? "Afspraak geannuleerd" : "Uitnodiging voor een afspraak";
    const bodyText = data.message?.trim()
      ? data.message.trim()
      : `Beste ${a.attendee_name ?? "relatie"},\n\nHierbij ${data.cancel ? "de annulering van" : "de bevestiging van"} onze afspraak "${a.title}" op ${dt}.${a.location ? `\nLocatie: ${a.location}` : ""}${a.description ? `\n\n${a.description}` : ""}\n\nDe bijlage kun je direct in je agenda importeren.\n\nMet vriendelijke groet,\n${fromName}`;

    const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">
      <h2 style="margin:0 0 12px">${heading}</h2>
      <p><strong>${escapeHtml(a.title)}</strong></p>
      <p>${escapeHtml(dt)}${a.location ? ` &middot; ${escapeHtml(a.location)}` : ""}</p>
      <div style="white-space:pre-wrap;margin-top:12px">${escapeHtml(bodyText)}</div>
    </div>`;

    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY ontbreekt");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to: [a.attendee_email],
        subject: `${data.cancel ? "[Geannuleerd] " : ""}${a.title} — ${dt}`,
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
