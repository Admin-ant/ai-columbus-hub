/** Pure helpers for mail security checks (testable, no secrets). */

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_MAIL_ATTACHMENTS_BYTES = 25 * 1024 * 1024;

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at < 0 ? "" : email.slice(at + 1).trim().toLowerCase();
}

/** Sender is allowed only when its domain (or a parent domain) is verified. */
export function isAllowedSender(fromEmail: string, verifiedDomains: string[]): boolean {
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(fromEmail)) return false;
  const d = emailDomain(fromEmail);
  return verifiedDomains.some((v) => {
    const vd = v.toLowerCase();
    return d === vd || d.endsWith(`.${vd}`);
  });
}

/** Strip characters that could inject extra headers into a display name. */
export function safeDisplayName(name: string | null | undefined): string | null {
  const v = (name ?? "").replace(/[\r\n<>"]/g, "").trim().slice(0, 120);
  return v || null;
}

/** Path must live in the organization's own folder. */
export function isOrgPath(path: string, orgId: string): boolean {
  return typeof path === "string" && path.startsWith(`${orgId}/`) && !path.includes("..");
}

export function checkAttachmentSizes(sizes: number[]): string | null {
  if (sizes.some((s) => s > MAX_ATTACHMENT_BYTES)) return "Een bijlage is groter dan 10 MB";
  if (sizes.reduce((a, b) => a + b, 0) > MAX_MAIL_ATTACHMENTS_BYTES) return "Bijlagen samen zijn groter dan 25 MB";
  return null;
}

/** Normalize an address list (from "Naam <a@b>" etc.) to plain lowercase emails. */
export function normalizeAddresses(list: string[]): string[] {
  return list
    .map((a) => (/<([^>]+)>/.exec(a)?.[1] ?? a).trim().toLowerCase())
    .filter((a) => /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(a));
}

/** Message-ids referenced by In-Reply-To and References headers. */
export function threadReferences(headers: Record<string, string> | undefined, inReplyTo?: string | null): string[] {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) h[k.toLowerCase()] = String(v);
  const raw = [inReplyTo ?? "", h["in-reply-to"] ?? "", h["references"] ?? ""].join(" ");
  const ids = raw.match(/<[^<>\s]+>/g) ?? [];
  const out = new Set<string>();
  for (const id of ids) { out.add(id); out.add(id.slice(1, -1)); }
  return [...out].slice(0, 40);
}

/** Verify a Svix (Resend) webhook signature with a 5-minute replay window. */
export async function verifySvixSignature(
  h: { get(name: string): string | null },
  body: string,
  secret: string,
  nowSeconds = Date.now() / 1000,
): Promise<boolean> {
  const id = h.get("svix-id"), ts = h.get("svix-timestamp"), sig = h.get("svix-signature");
  if (!id || !ts || !sig || !secret) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(nowSeconds - tsNum) > 300) return false;
  const keyB64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try { keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0)); } catch { return false; }
  const key = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return sig.split(" ").some((p) => {
    const [ver, v = ""] = p.split(",");
    if (ver !== "v1" || v.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < v.length; i++) diff |= v.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}
