import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apptDict, normalizeLocale, type ApptLocale } from "@/lib/appointment-i18n";
import { renderTokens, type TokenVars } from "@/lib/outreach-templates";
import { renderAppointmentMail, googleCalendarLink, parseAgendaPoints } from "@/lib/appointment-email-template";

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
  locale: z.enum(["nl", "en", "de"]).optional().default("nl"),
  reminder_minutes: z.number().int().min(0).max(20160).nullable().optional(),
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
      locale: data.locale ?? "nl",
      reminder_minutes: data.reminder_minutes ?? null,
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

const RescheduleSchema = z.object({
  id: z.string().uuid(),
  starts_at: z.string(),
  ends_at: z.string(),
  message: z.string().max(4000).optional(),
  send_email: z.boolean().optional().default(true),
});

export const rescheduleAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RescheduleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("appointments")
      .select("ics_sequence, attendee_email")
      .eq("id", data.id)
      .single();
    if (fetchErr || !existing) throw new Error(fetchErr?.message ?? "Afspraak niet gevonden");
    const row = existing as { ics_sequence: number | null; attendee_email: string | null };
    const seq = (row.ics_sequence ?? 0) + 1;
    const { error } = await context.supabase
      .from("appointments")
      .update({
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        ics_sequence: seq,
        status: "scheduled",
        confirmed_at: null,
        reschedule_requested_at: null,
        reschedule_note: null,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    return { ok: true, attendee_email: row.attendee_email };
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
      locale: string | null;
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

    const locale = normalizeLocale(a.locale);
    const t = apptDict(locale);
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
    const dateStr = startDate.toLocaleDateString(t.bcp47, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const timeStr = `${startDate.toLocaleTimeString(t.bcp47, { hour: "2-digit", minute: "2-digit" })} – ${endDate.toLocaleTimeString(t.bcp47, { hour: "2-digit", minute: "2-digit" })}`;
    const dt = `${dateStr} · ${timeStr}`;

    const appUrl = process.env.APP_PUBLIC_URL || "https://ai-columbus-hub.lovable.app";
    const actionUrl = `${appUrl}/afspraak/${a.confirm_token}`;

    const attendeeDisplayName = a.attendee_name ?? t.fallbackName;
    let heading = data.cancel ? t.headingCancelled : t.headingConfirm;
    let intro = data.cancel ? t.introCancelled(attendeeDisplayName) : locale === "nl" ? "Dank je wel voor het fijne gesprek. Hierbij bevestig ik onze afspraak. Ik kijk ernaar uit!" : t.introConfirm(attendeeDisplayName);
    const customMessage = data.message?.trim() ? data.message.trim() : "";
    let subject = `${data.cancel ? t.subjectPrefixCancel + " " : ""}${a.title} — ${dateStr}`;

    // Optional: override subject + intro from editable template "Afspraak bevestiging"
    if (!data.cancel) {
      const { data: tpl } = await context.supabase
        .from("outreach_message_templates")
        .select("subject, body")
        .eq("organization_id", a.organization_id)
        .eq("channel", "email")
        .ilike("name", "Afspraak bevestiging")
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      const row = tpl as { subject: string | null; body: string | null } | null;
      if (row && (row.subject || row.body)) {
        const tokens: TokenVars = {
          contact_name: attendeeDisplayName,
          company: null,
          province: null,
          sender_name: fromName,
          appointment_title: a.title,
          appointment_date: dateStr,
          appointment_time: timeStr,
          appointment_location: a.location ?? "",
          appointment_link: actionUrl,
        };
        if (row.subject && row.subject.trim()) subject = renderTokens(row.subject, tokens);
        if (row.body && row.body.trim()) intro = renderTokens(row.body, tokens);
      }
    }

    const bodyText = `${intro}\n\n${a.title}\n${dt}${a.location ? `\n${t.locationLabel}: ${a.location}` : ""}${a.description ? `\n\n${a.description}` : ""}${customMessage ? `\n\n${customMessage}` : ""}\n\n${actionUrl}\n\n${t.signature}\n${fromName}`;

    const html = renderAppointmentHtml({
      locale,
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
      cancelled: data.cancel === true,
      firstName: (a.attendee_name ?? "").trim().split(/\s+/)[0] || attendeeDisplayName,
      startsAt: a.starts_at,
      endsAt: a.ends_at,
    });



    // Pre-log in mail_messages so it shows up in the user's Sent folder
    const { data: logRow } = await context.supabase
      .from("mail_messages")
      .insert({
        organization_id: a.organization_id,
        folder: "sent",
        from_email: fromEmail,
        from_name: fromName,
        to_emails: [a.attendee_email],
        cc_emails: [],
        bcc_emails: [],
        subject,
        body_text: bodyText,
        body_html: html,
        status: "queued",
        created_by: context.userId,
        attachments: [{ filename: "afspraak.ics", path: "inline:afspraak.ics" }],
      } as never)
      .select("id")
      .single();
    const logId = (logRow as { id: string } | null)?.id ?? null;

    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY ontbreekt — voeg toe in projectinstellingen");

    let providerId: string | null = null;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          from,
          to: [a.attendee_email],
          subject,
          html,
          text: bodyText,
          reply_to: s?.reply_to || undefined,
          headers: {
            "Content-Class": "urn:content-classes:calendarmessage",
            ...(logId ? { "X-Mail-Message-Id": logId } : {}),
          },
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
      if (!res.ok) {
        throw new Error(
          `Verzenden mislukt (${res.status}). Controleer of het afzenderadres (${fromEmail}) een geverifieerd domein in Resend gebruikt. Detail: ${respBody.slice(0, 300)}`,
        );
      }
      try {
        providerId = (JSON.parse(respBody) as { id?: string }).id ?? null;
      } catch {
        /* noop */
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (logId) {
        await context.supabase
          .from("mail_messages")
          .update({ status: "failed", error: msg } as never)
          .eq("id", logId);
      }
      throw new Error(msg);
    }

    if (logId) {
      await context.supabase
        .from("mail_messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: providerId,
          thread_id: logId,
        } as never)
        .eq("id", logId);
    }

    const patch: Record<string, unknown> = { invite_sent_at: new Date().toISOString() };
    if (data.cancel) patch.status = "cancelled";
    await context.supabase
      .from("appointments")
      .update(patch as never)
      .eq("id", a.id);

    return { ok: true, mail_message_id: logId };
  });

const PreviewSchema = z.object({
  locale: z.enum(["nl", "en", "de"]).optional().default("nl"),
  variant: z.enum(["confirm", "cancel", "reschedule"]).optional().default("confirm"),
  title: z.string().max(200).optional(),
  attendee_name: z.string().max(200).optional(),
  location: z.string().max(300).optional(),
  description: z.string().max(4000).optional(),
  custom_message: z.string().max(4000).optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
});

/**
 * Renders the appointment email as HTML with sample data — never sends anything.
 * For the internal preview page in the app.
 */
export const previewAppointmentEmailHtml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PreviewSchema.parse(d))
  .handler(async ({ data }) => {
    const locale = normalizeLocale(data.locale) as ApptLocale;
    const t = apptDict(locale);
    const now = Date.now();
    const startsAt = data.starts_at ?? new Date(now + 2 * 24 * 3600_000).toISOString();
    const endsAt = data.ends_at ?? new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString();
    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);
    const dateStr = startDate.toLocaleDateString(t.bcp47, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const timeStr = `${startDate.toLocaleTimeString(t.bcp47, { hour: "2-digit", minute: "2-digit" })} – ${endDate.toLocaleTimeString(t.bcp47, { hour: "2-digit", minute: "2-digit" })}`;
    const appUrl = process.env.APP_PUBLIC_URL || "https://ai-columbus-hub.lovable.app";
    const sampleTokens: Record<string, string> = {
      confirm: "preview-confirm-abc123",
      cancel: "preview-cancel-abc123",
      reschedule: "preview-reschedule-abc123",
    };
    const actionUrl = `${appUrl}/afspraak/${sampleTokens[data.variant]}`;

    const attendeeName = data.attendee_name?.trim() || (locale === "en" ? "Alex" : locale === "de" ? "Alex" : "Sander");
    const cancelled = data.variant === "cancel";
    const heading =
      data.variant === "cancel"
        ? t.headingCancelled
        : data.variant === "reschedule"
          ? t.headingRescheduled
          : t.headingConfirm;
    const intro =
      data.variant === "cancel"
        ? t.introCancelled(attendeeName)
        : data.variant === "reschedule"
          ? t.introRescheduled(attendeeName)
          : t.introConfirm(attendeeName);

    const html = renderAppointmentHtml({
      locale,
      heading,
      intro,
      title: data.title?.trim() || (locale === "en" ? "Intro call — AI implementation" : locale === "de" ? "Kennenlerngespräch — KI-Einführung" : "Kennismaking AI-implementatie"),
      dateStr,
      timeStr,
      location: data.location?.trim() || (locale === "en" ? "Google Meet" : locale === "de" ? "Google Meet" : "Google Meet"),
      description:
        data.description?.trim() ||
        (locale === "en"
          ? "Short online intro where we discuss your current workflow and show how AI van Columbus can help with quotes, invoicing and lead follow-up."
          : locale === "de"
            ? "Kurzes Online-Kennenlernen: Wir besprechen euren aktuellen Workflow und zeigen, wie AI van Columbus bei Angeboten, Rechnungen und Lead-Follow-up unterstützt."
            : "Korte online kennismaking waarin we jullie huidige workflow bespreken en laten zien hoe AI van Columbus kan helpen bij offertes, facturatie en leadopvolging."),
      customMessage: data.custom_message?.trim() ?? "",
      actionUrl,
      fromName: "AI van Columbus",
      cancelled,
      firstName: attendeeName.split(/\s+/)[0],
      startsAt,
      endsAt,
    });
    return { html, subject: `${cancelled ? t.subjectPrefixCancel + " " : ""}${data.title?.trim() || "Kennismaking"} — ${dateStr}` };
  });

function renderAppointmentHtml(opts: {
  locale: ApptLocale;
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
  cancelled: boolean;
  firstName?: string;
  startsAt?: string;
  endsAt?: string;
}): string {
  const dayMonth = opts.dateStr.replace(/^\S+\s+/, "").replace(/\s+\d{4}$/, "");
  const agendaLink = opts.startsAt && opts.endsAt
    ? googleCalendarLink({ title: opts.title, start: opts.startsAt, end: opts.endsAt, location: opts.location, details: opts.description })
    : opts.actionUrl;
  return renderAppointmentMail({
    heading: opts.cancelled ? "Je afspraak is geannuleerd" : "Je afspraak is bevestigd",
    firstName: opts.firstName || "",
    intro: opts.intro,
    dateStr: opts.dateStr,
    dateUrl: encodeURIComponent(dayMonth),
    timeStr: opts.timeStr.includes("uur") ? opts.timeStr : `${opts.timeStr} uur`,
    location: opts.location || "Wordt nog afgestemd",
    subject: opts.title,
    agendaLink,
    agendaPoints: parseAgendaPoints(opts.description),
    confirmUrl: opts.cancelled ? null : opts.actionUrl,
    cancelled: opts.cancelled,
    customMessage: opts.customMessage,
  });
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
