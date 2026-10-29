// Afspraakbevestiging in AI van Columbus-huisstijl. Tabel-layout + inline CSS
// zodat de mail werkt in Gmail, Outlook (desktop) en Apple Mail.
import logoAsset from "@/assets/logo-wit.png.asset.json";
import { apptDict, type ApptLocale } from "@/lib/appointment-i18n";

export type AppointmentMailVars = {
  locale?: ApptLocale;
  heading: string; // "Je afspraak is bevestigd"
  firstName: string;
  intro: string;
  dateStr: string;
  dateUrl: string; // al URL-gecodeerd
  timeStr: string;
  location: string;
  subject: string;
  agendaLink: string;
  agendaPoints: string[];
  confirmUrl?: string | null;
  cancelled?: boolean;
  customMessage?: string;
};

const ORANGE = "#F2620C";
const FONT = "Arial, Helvetica, sans-serif";

const MAIL_TEXT = {
  nl: { greeting: "Beste", date: "Datum", time: "Tijd", location: "Locatie", subject: "Onderwerp", agenda: "Zet in mijn agenda", confirm: "Afspraak bevestigen", points: "Wat bespreken we?", reschedule: "Afspraak verzetten?", explanation: "Lukt het onverhoopt niet? Geen probleem. Laat het me even weten, dan plannen we een nieuw moment.", mail: "Mail om te verzetten", call: "Bel mij", mobile: "Mobiel", email: "E-mail", website: "Website", footer: "Je ontvangt deze mail omdat je een afspraak met ons hebt gemaakt.", pending: "Wordt nog afgestemd", intro: "Dank je wel voor het fijne gesprek. Hierbij bevestig ik onze afspraak. Ik kijk ernaar uit!", heading: "Je afspraak is bevestigd", cancelled: "Je afspraak is geannuleerd", mailSubject: "Afspraak verzetten", whatsapp: "Hoi Anton, ik wil graag onze afspraak van" },
  en: { greeting: "Dear", date: "Date", time: "Time", location: "Location", subject: "Subject", agenda: "Add to my calendar", confirm: "Confirm appointment", points: "What will we discuss?", reschedule: "Need to reschedule?", explanation: "Can't make it? No problem. Let me know and we will arrange a new time.", mail: "Email to reschedule", call: "Call me", mobile: "Mobile", email: "Email", website: "Website", footer: "You received this email because you booked an appointment with us.", pending: "To be agreed", intro: "Thank you for the pleasant conversation. This email confirms our appointment. I look forward to it!", heading: "Your appointment is confirmed", cancelled: "Your appointment is cancelled", mailSubject: "Reschedule appointment", whatsapp: "Hi Anton, I would like to reschedule our appointment on" },
  de: { greeting: "Hallo", date: "Datum", time: "Uhrzeit", location: "Ort", subject: "Betreff", agenda: "Zum Kalender hinzufügen", confirm: "Termin bestätigen", points: "Was besprechen wir?", reschedule: "Termin verschieben?", explanation: "Du kannst den Termin nicht wahrnehmen? Kein Problem. Gib mir Bescheid, dann vereinbaren wir einen neuen Zeitpunkt.", mail: "E-Mail zum Verschieben", call: "Ruf mich an", mobile: "Mobil", email: "E-Mail", website: "Website", footer: "Du erhältst diese E-Mail, weil du einen Termin mit uns vereinbart hast.", pending: "Wird noch vereinbart", intro: "Vielen Dank für das nette Gespräch. Hiermit bestätige ich unseren Termin. Ich freue mich darauf!", heading: "Dein Termin ist bestätigt", cancelled: "Dein Termin ist abgesagt", mailSubject: "Termin verschieben", whatsapp: "Hallo Anton, ich möchte unseren Termin vom" },
};

export function appointmentMailTime(time: string, locale: ApptLocale): string {
  return time.replace(/\s+(uur|Uhr)\s*$/, "") + (locale === "nl" ? " uur" : locale === "de" ? " Uhr" : "");
}

/** Localize the built-in AVC wording without replacing a customer's chosen layout. */
export function prepareAppointmentTemplate(html: string, opts: { locale: ApptLocale; customMessage: string; rescheduled?: boolean; attendeeName: string }): string {
  const text = MAIL_TEXT[opts.locale];
  const t = apptDict(opts.locale);
  let result = html;
  if (opts.locale !== "nl") {
    const replacements = new Map<string, string>(Object.keys(MAIL_TEXT.nl).map((key) => {
      const k = key as keyof typeof MAIL_TEXT.nl;
      return [MAIL_TEXT.nl[k], text[k]];
    }));
    replacements.set("Met vriendelijke groet,", t.signature);
    result = result.replace(/>([^<>]*)</g, (_, content: string) => {
      const trimmed = content.trim();
      let translated = replacements.get(trimmed) ?? trimmed;
      if (/^Beste\s/.test(trimmed)) translated = trimmed.replace(/^Beste\s/, `${text.greeting} `);
      if (/\suur$/.test(trimmed)) translated = appointmentMailTime(trimmed, opts.locale);
      return `>${content.replace(trimmed, translated)}<`;
    }).replace(/(<html\b[^>]*\blang=)["']nl["']/i, `$1"${opts.locale}"`);
    result = result.replace(/Afspraak%20verzetten%20/g, `${encodeURIComponent(text.mailSubject)}%20`)
      .replace(/Hoi%20Anton%2C%20ik%20wil%20graag%20onze%20afspraak%20van%20/g, `${encodeURIComponent(text.whatsapp)}%20`)
      .replace(/%20verzetten\./g, opts.locale === "en" ? "." : "%20verschieben.");
  }
  if (opts.rescheduled) {
    result = result.replace(/(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/i, `$1${esc(t.headingRescheduled)}$2`);
    result = result.replace(/(<title>)[\s\S]*?(<\/title>)/i, `$1${esc(t.headingRescheduled)}$2`);
  }
  const notice = [opts.rescheduled ? t.introRescheduled(opts.attendeeName) : "", opts.customMessage.trim()].filter(Boolean).join("\n\n");
  if (notice) {
    const paragraph = `<p style="margin:16px 0;font-family:${FONT};font-size:15px;line-height:24px;color:#333333;">${esc(notice).replace(/\n/g, "<br>")}</p>`;
    // Inside the main content cell for table mails; generic templates get a body fallback.
    const headingIndex = result.search(/<h1\b/i);
    const cellEnd = headingIndex < 0 ? -1 : result.indexOf("</td>", headingIndex);
    if (cellEnd >= 0) result = result.slice(0, cellEnd) + paragraph + result.slice(cellEnd);
    else if (/<\/body>/i.test(result)) result = result.replace(/<\/body>/i, `${paragraph}</body>`);
    else result += paragraph;
  }
  return result;
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function solidButton(href: string, label: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr>
<td align="center" bgcolor="${ORANGE}" style="border-radius:4px;background:${ORANGE};">
<a href="${esc(href)}" target="_blank" style="display:inline-block;padding:16px 36px;font-family:${FONT};font-size:17px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:4px;">${esc(label)}</a>
</td></tr></table>`;
}

function outlineButton(href: string, label: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>
<td align="center" bgcolor="#ffffff" style="border:2px solid ${ORANGE};border-radius:4px;">
<a href="${esc(href)}" target="_blank" style="display:block;padding:12px 8px;font-family:${FONT};font-size:14px;font-weight:bold;color:${ORANGE};text-decoration:none;">${esc(label)}</a>
</td></tr></table>`;
}

/** Merklogo op de zwarte balk; wit/oranje, altijd bereikbaar via het eigen domein. */
const LOGO_URL = `https://aiqloud.nl${logoAsset.url}`;

function logo(): string {
  return `<img src="${LOGO_URL}" width="200" height="52" alt="AI van Columbus" style="display:block;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">`;
}

export function renderAppointmentMail(v: AppointmentMailVars): string {
  const locale = v.locale ?? "nl";
  const text = MAIL_TEXT[locale];
  const t = apptDict(locale);
  const mailHref = `mailto:info@aivancolumbus.com?subject=${encodeURIComponent(text.mailSubject)}%20${v.dateUrl}`;
  const waHref = `https://wa.me/31639291340?text=${encodeURIComponent(text.whatsapp)}%20${v.dateUrl}${locale === "nl" ? "%20verzetten." : locale === "de" ? "%20verschieben." : "."}`;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 0;font-family:${FONT};font-size:15px;color:#666666;width:110px;" valign="top">${label}</td><td style="padding:4px 0;font-family:${FONT};font-size:15px;color:#111111;font-weight:bold;">${esc(value)}</td></tr>`;
  const points = v.agendaPoints.filter((p) => p.trim()).slice(0, 4);
  const p = (html: string) => `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:#333333;">${html}</p>`;
  const h2 = (t: string) => `<h2 style="margin:0 0 12px;font-family:${FONT};font-size:18px;line-height:24px;color:${ORANGE};">${t}</h2>`;
  // Losse aanhef alleen als de intro die nog niet zelf bevat (voorkomt "Beste X," dubbel).
  const hasGreeting =
    /^\s*(beste|geachte|hi|hallo|hey|hoi|dear|goedemorgen|goedemiddag|guten tag|morgen)/i.test(v.intro) ||
    (!!v.firstName.trim() && v.intro.toLowerCase().slice(0, 40).includes(v.firstName.trim().toLowerCase() + ","));

  return `<!DOCTYPE html>
<html lang="${locale}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${esc(v.heading)}</title>
<style>
@media only screen and (max-width:620px){
  .container{width:100% !important;}
  .px{padding-left:20px !important;padding-right:20px !important;}
  .stack{display:block !important;width:100% !important;padding:0 0 10px 0 !important;}
}
</style>
</head>
<body style="margin:0;padding:0;background:#F4F4F4;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#F4F4F4" style="background:#F4F4F4;">
<tr><td align="center" style="padding:24px 10px;">
<table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;background:#ffffff;">
<tr><td bgcolor="#000000" class="px" style="background:#000000;padding:22px 40px;" align="left">
${logo()}
</td></tr>
<tr><td height="4" bgcolor="${ORANGE}" style="background:${ORANGE};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="px" style="padding:40px 40px 8px;">
<h1 style="margin:0 0 24px;font-family:${FONT};font-size:26px;line-height:32px;color:#111111;">${esc(v.heading)}</h1>
${hasGreeting || !v.firstName.trim() ? "" : p(`${text.greeting} ${esc(v.firstName)},`)}
${p(esc(v.intro))}
${v.customMessage ? p(esc(v.customMessage).replace(/\n/g, "<br>")) : ""}
</td></tr>
<tr><td class="px" style="padding:8px 40px 24px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #E5E5E5;border-left:4px solid ${ORANGE};background:#FAFAFA;">
<tr><td style="padding:18px 20px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
${row(text.date, v.dateStr)}${row(text.time, v.timeStr)}${row(text.location, v.location)}${row(text.subject, v.subject)}
</table></td></tr></table>
</td></tr>
${v.cancelled ? "" : `<tr><td class="px" align="center" style="padding:8px 40px 32px;">${solidButton(v.agendaLink, text.agenda)}
${v.confirmUrl ? `<p style="margin:14px 0 0;font-family:${FONT};font-size:13px;color:#666666;"><a href="${esc(v.confirmUrl)}?a=confirm" style="color:${ORANGE};">${text.confirm}</a></p>` : ""}</td></tr>`}
${points.length && !v.cancelled ? `<tr><td class="px" style="padding:0 40px 24px;">${h2(text.points)}
<table role="presentation" cellspacing="0" cellpadding="0" border="0">${points.map((pt) => `<tr><td valign="top" style="padding:0 10px 8px 0;font-family:${FONT};font-size:15px;line-height:22px;color:${ORANGE};font-weight:bold;">&bull;</td><td style="padding:0 0 8px;font-family:${FONT};font-size:15px;line-height:22px;color:#333333;">${esc(pt)}</td></tr>`).join("")}</table>
</td></tr>` : ""}
${v.cancelled ? "" : `<tr><td class="px" style="padding:8px 40px 24px;border-top:1px solid #EEEEEE;">
<div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
${h2(text.reschedule)}
${p(esc(text.explanation))}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td class="stack" width="33%" style="padding-right:6px;" valign="top">${outlineButton(mailHref, text.mail)}</td>
<td class="stack" width="33%" style="padding:0 3px;" valign="top">${outlineButton("tel:+31639291340", text.call)}</td>
<td class="stack" width="33%" style="padding-left:6px;" valign="top">${outlineButton(waHref, "WhatsApp")}</td>
</tr></table>
</td></tr>`}
<tr><td class="px" style="padding:16px 40px 24px;">
${p(`${esc(t.signature)}<br><strong>Anton Hogervorst</strong><br>AI van Columbus`)}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="font-family:${FONT};font-size:14px;line-height:22px;color:#333333;">
<tr><td style="padding-right:10px;color:#666666;">${text.mobile}</td><td><a href="tel:+31639291340" style="color:#111111;text-decoration:none;">+31 6 39 29 13 40</a></td></tr>
<tr><td style="padding-right:10px;color:#666666;">${text.email}</td><td><a href="mailto:info@aivancolumbus.com" style="color:${ORANGE};text-decoration:none;">info@aivancolumbus.com</a></td></tr>
<tr><td style="padding-right:10px;color:#666666;">${text.website}</td><td><a href="https://aivancolumbus.com" style="color:${ORANGE};text-decoration:none;">aivancolumbus.com</a></td></tr>
</table>
</td></tr>
<tr><td class="px" bgcolor="#F9F9F9" style="background:#F9F9F9;padding:18px 40px;border-top:1px solid #EEEEEE;font-family:${FONT};font-size:12px;line-height:18px;color:#999999;" align="center">
AI van Columbus B.V. &middot; Ecu 23, 8305 BA Emmeloord &middot; KvK 42088548<br>
${text.footer}
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const gcal = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

export function googleCalendarLink(o: { title: string; start: string; end: string; location?: string | null; details?: string | null }): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: o.title,
    dates: `${gcal(new Date(o.start))}/${gcal(new Date(o.end))}`,
    location: o.location ?? "",
    details: o.details ?? "",
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Gesprekspunten uit de omschrijving: één per regel of gescheiden door "·". */
export function parseAgendaPoints(text: string | null | undefined): string[] {
  if (!text) return [];
  return text.split(/\n|·/).map((s) => s.replace(/^[-•*\s]+/, "").trim()).filter(Boolean).slice(0, 4);
}
