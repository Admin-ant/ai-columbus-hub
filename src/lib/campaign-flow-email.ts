// Client-safe renderer for the Campaign Flow kennismakingsmail.
// Used by both the server function that sends via Resend and the in-app
// live preview dialog.

import logoEmailAsset from "@/assets/logo-columbus-email.png.asset.json";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderCampaignEmailHtml(opts: {
  bodyText: string;
  trackingUrl?: string | null;
  logoUrl: string;
  senderName?: string | null;
  senderTitle?: string | null;
  brandColor?: string;
}): string {
  const brand = opts.brandColor ?? "#F26A1F";
  const paragraphs = (opts.bodyText ?? "")
    .split(/\n{2,}/)
    .map((p) => esc(p.trim()).replace(/\n/g, "<br />"))
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.65;color:#1f2937">${p}</p>`,
    )
    .join("");

  const cta = opts.trackingUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 4px">
         <tr><td style="border-radius:8px;background:${brand}">
           <a href="${esc(opts.trackingUrl)}" style="display:inline-block;padding:12px 22px;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">
             Bekijk meer →
           </a>
         </td></tr>
       </table>`
    : "";

  const senderName = esc(opts.senderName ?? "AI van Columbus");
  const senderTitle = opts.senderTitle ? esc(opts.senderTitle) : "";

  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>&nbsp;</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f5f7;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06)">
        <tr><td style="padding:28px 32px 8px;border-bottom:1px solid #f1f1f4">
          <img src="${esc(opts.logoUrl)}" alt="AI van Columbus" height="44" style="display:block;height:44px;width:auto;border:0;outline:none;text-decoration:none" />
        </td></tr>
        <tr><td style="padding:28px 32px 8px">
          ${paragraphs}
          ${cta}
        </td></tr>
        <tr><td style="padding:20px 32px 28px">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-top:1px solid #f1f1f4;padding-top:16px">
            <tr><td style="font-family:Inter,Segoe UI,Arial,sans-serif;font-size:13px;color:#4b5563;line-height:1.55">
              <div style="font-weight:600;color:#111827">${senderName}</div>
              ${senderTitle ? `<div style="color:#6b7280">${senderTitle}</div>` : ""}
              <div style="margin-top:6px;color:#9ca3af;font-size:12px">AI van Columbus · aiqloud.nl</div>
            </td></tr>
          </table>
        </td></tr>
      </table>
      <div style="margin-top:14px;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:11px;color:#9ca3af">
        Deze mail is verstuurd via AI van Columbus.
      </div>
    </td></tr>
  </table>
</body></html>`;
}

export function resolveCampaignLogoUrl(publicBase?: string): string {
  const base = (publicBase ?? "").replace(/\/$/, "");
  const rel = logoEmailAsset.url;
  if (rel.startsWith("http")) return rel;
  if (base) return `${base}${rel}`;
  if (typeof window !== "undefined") return `${window.location.origin}${rel}`;
  return rel;
}
