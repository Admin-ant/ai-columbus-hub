// Afspraakbevestiging in AI van Columbus-huisstijl. Tabel-layout + inline CSS
// zodat de mail werkt in Gmail, Outlook (desktop) en Apple Mail.

export type AppointmentMailVars = {
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
  logoUrl: string;
  confirmUrl?: string | null;
  cancelled?: boolean;
  customMessage?: string;
};

const ORANGE = "#F2620C";
const FONT = "Arial, Helvetica, sans-serif";

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

export function renderAppointmentMail(v: AppointmentMailVars): string {
  const mailHref = `mailto:info@aivancolumbus.com?subject=Afspraak%20verzetten%20${v.dateUrl}`;
  const waHref = `https://wa.me/31639291340?text=Hoi%20Anton%2C%20ik%20wil%20graag%20onze%20afspraak%20van%20${v.dateUrl}%20verzetten.`;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 0;font-family:${FONT};font-size:15px;color:#666666;width:110px;" valign="top">${label}</td><td style="padding:4px 0;font-family:${FONT};font-size:15px;color:#111111;font-weight:bold;">${esc(value)}</td></tr>`;
  const points = v.agendaPoints.filter((p) => p.trim()).slice(0, 4);
  const p = (html: string) => `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:#333333;">${html}</p>`;
  const h2 = (t: string) => `<h2 style="margin:0 0 12px;font-family:${FONT};font-size:18px;line-height:24px;color:${ORANGE};">${t}</h2>`;

  return `<!DOCTYPE html>
<html lang="nl" xmlns="http://www.w3.org/1999/xhtml">
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
<tr><td bgcolor="#000000" class="px" style="background:#000000;padding:24px 40px;" align="left">
<img src="${esc(v.logoUrl)}" alt="AI van Columbus" width="180" style="display:block;width:180px;max-width:180px;height:auto;border:0;color:#ffffff;font-family:${FONT};font-size:18px;">
</td></tr>
<tr><td height="4" bgcolor="${ORANGE}" style="background:${ORANGE};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="px" style="padding:40px 40px 8px;">
<h1 style="margin:0 0 24px;font-family:${FONT};font-size:26px;line-height:32px;color:#111111;">${esc(v.heading)}</h1>
${p(`Beste ${esc(v.firstName)},`)}
${p(esc(v.intro))}
${v.customMessage ? p(esc(v.customMessage).replace(/\n/g, "<br>")) : ""}
</td></tr>
<tr><td class="px" style="padding:8px 40px 24px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #E5E5E5;border-left:4px solid ${ORANGE};background:#FAFAFA;">
<tr><td style="padding:18px 20px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
${row("Datum", v.dateStr)}${row("Tijd", v.timeStr)}${row("Locatie", v.location)}${row("Onderwerp", v.subject)}
</table></td></tr></table>
</td></tr>
${v.cancelled ? "" : `<tr><td class="px" align="center" style="padding:8px 40px 32px;">${solidButton(v.agendaLink, "Zet in mijn agenda")}
${v.confirmUrl ? `<p style="margin:14px 0 0;font-family:${FONT};font-size:13px;color:#666666;"><a href="${esc(v.confirmUrl)}?a=confirm" style="color:${ORANGE};">Afspraak bevestigen</a></p>` : ""}</td></tr>`}
${points.length && !v.cancelled ? `<tr><td class="px" style="padding:0 40px 24px;">${h2("Wat bespreken we?")}
<table role="presentation" cellspacing="0" cellpadding="0" border="0">${points.map((pt) => `<tr><td valign="top" style="padding:0 10px 8px 0;font-family:${FONT};font-size:15px;line-height:22px;color:${ORANGE};font-weight:bold;">&bull;</td><td style="padding:0 0 8px;font-family:${FONT};font-size:15px;line-height:22px;color:#333333;">${esc(pt)}</td></tr>`).join("")}</table>
</td></tr>` : ""}
${v.cancelled ? "" : `<tr><td class="px" style="padding:8px 40px 24px;border-top:1px solid #EEEEEE;">
<div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
${h2("Afspraak verzetten?")}
${p("Lukt het onverhoopt niet? Geen probleem. Laat het me even weten, dan plannen we een nieuw moment.")}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td class="stack" width="33%" style="padding-right:6px;" valign="top">${outlineButton(mailHref, "Mail om te verzetten")}</td>
<td class="stack" width="33%" style="padding:0 3px;" valign="top">${outlineButton("tel:+31639291340", "Bel mij")}</td>
<td class="stack" width="33%" style="padding-left:6px;" valign="top">${outlineButton(waHref, "WhatsApp")}</td>
</tr></table>
</td></tr>`}
<tr><td class="px" style="padding:16px 40px 24px;">
${p("Met vriendelijke groet,<br><strong>Anton Hogervorst</strong><br>AI van Columbus")}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="font-family:${FONT};font-size:14px;line-height:22px;color:#333333;">
<tr><td style="padding-right:10px;color:#666666;">Mobiel</td><td><a href="tel:+31639291340" style="color:#111111;text-decoration:none;">+31 6 39 29 13 40</a></td></tr>
<tr><td style="padding-right:10px;color:#666666;">E-mail</td><td><a href="mailto:info@aivancolumbus.com" style="color:${ORANGE};text-decoration:none;">info@aivancolumbus.com</a></td></tr>
<tr><td style="padding-right:10px;color:#666666;">Website</td><td><a href="https://aivancolumbus.com" style="color:${ORANGE};text-decoration:none;">aivancolumbus.com</a></td></tr>
</table>
</td></tr>
<tr><td class="px" bgcolor="#F9F9F9" style="background:#F9F9F9;padding:18px 40px;border-top:1px solid #EEEEEE;font-family:${FONT};font-size:12px;line-height:18px;color:#999999;" align="center">
AI van Columbus B.V. &middot; Ecu 23, 8305 BA Emmeloord &middot; KvK 42088548<br>
Je ontvangt deze mail omdat je een afspraak met ons hebt gemaakt.
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
