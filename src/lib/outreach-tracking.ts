import { createHmac, timingSafeEqual } from "crypto";

/**
 * Sign a message-id for email open/click tracking.
 * Uses CRON_SECRET as shared HMAC key (server-side only).
 */
export function signTrackingId(messageId: string, secret: string): string {
  return createHmac("sha256", secret).update(messageId).digest("hex").slice(0, 24);
}

export function verifyTrackingId(
  messageId: string,
  signature: string,
  secret: string,
): boolean {
  const expected = signTrackingId(messageId, secret);
  if (signature.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Inject a 1x1 tracking pixel + rewrite links to go through the
 * tracking endpoint, so we capture opens and clicks per message.
 */
export function injectTracking(opts: {
  html: string;
  messageId: string;
  signature: string;
  baseUrl: string;
}): string {
  const base = opts.baseUrl.replace(/\/$/, "");
  // Rewrite anchors (only http(s) links, skip mailto/anchors)
  const rewritten = opts.html.replace(
    /<a\s+([^>]*?)href=["'](https?:\/\/[^"']+)["']([^>]*)>/gi,
    (_m, pre: string, href: string, post: string) => {
      const u = `${base}/api/public/hooks/outreach-track?t=click&id=${encodeURIComponent(opts.messageId)}&sig=${opts.signature}&u=${encodeURIComponent(href)}`;
      return `<a ${pre}href="${u}"${post}>`;
    },
  );
  const pixel = `<img src="${base}/api/public/hooks/outreach-track?t=open&id=${encodeURIComponent(opts.messageId)}&sig=${opts.signature}" width="1" height="1" alt="" style="display:block;border:0;outline:none;width:1px;height:1px" />`;
  return rewritten + pixel;
}
