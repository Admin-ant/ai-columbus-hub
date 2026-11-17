import { describe, expect, test } from "bun:test";
import { sanitizeIncomingMailHtml } from "../src/lib/mail-html-sanitize";
import { checkAttachmentSizes, isAllowedSender, isOrgPath, normalizeAddresses, threadReferences, verifySvixSignature } from "../src/lib/mail-security";

const hdrs = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
const SECRET = "whsec_" + btoa("supersecretkey-1234567890");
async function sign(id: string, ts: string, body: string) {
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(atob(SECRET.slice(6)), (c) => c.charCodeAt(0)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  return "v1," + btoa(String.fromCharCode(...new Uint8Array(mac)));
}

describe("veilige weergave", () => {
  test("script en onerror worden verwijderd", () => {
    const { html } = sanitizeIncomingMailHtml('<p>Hoi</p><script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">k</a><form action="/x"><input></form><iframe src="https://e.vil"></iframe>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<iframe");
    expect(html).toContain("Hoi");
  });
  test("externe afbeeldingen geblokkeerd tot toestemming, links in nieuw tabblad", () => {
    const src = '<img src="https://track.example/p.gif"><a href="https://a.nl">a</a><link rel="stylesheet" href="https://x/y.css">';
    const blocked = sanitizeIncomingMailHtml(src);
    expect(blocked.html).not.toContain("track.example");
    expect(blocked.blockedImages).toBe(1);
    expect(blocked.html).toContain('rel="noopener noreferrer"');
    expect(blocked.html).toContain('target="_blank"');
    expect(blocked.html).not.toContain("<link");
    expect(sanitizeIncomingMailHtml(src, { allowImages: true }).html).toContain("track.example");
  });
});

describe("bijlagen", () => {
  test("pad van andere organisatie geweigerd", () => {
    expect(isOrgPath("org-a/1-file.pdf", "org-a")).toBe(true);
    expect(isOrgPath("org-b/1-file.pdf", "org-a")).toBe(false);
    expect(isOrgPath("org-a/../org-b/x", "org-a")).toBe(false);
  });
  test("max 10 MB per bijlage en 25 MB per mail", () => {
    expect(checkAttachmentSizes([11 * 1024 * 1024])).not.toBeNull();
    expect(checkAttachmentSizes([9e6, 9e6, 9e6])).not.toBeNull();
    expect(checkAttachmentSizes([5e6, 5e6])).toBeNull();
  });
});

describe("webhook-handtekening", () => {
  const body = '{"type":"email.received"}';
  const ts = String(Math.floor(Date.now() / 1000));
  test("ontbrekend of fout geweigerd", async () => {
    expect(await verifySvixSignature(hdrs({}), body, SECRET)).toBe(false);
    expect(await verifySvixSignature(hdrs({ "svix-id": "m1", "svix-timestamp": ts, "svix-signature": "v1,AAAA" }), body, SECRET)).toBe(false);
  });
  test("geldig geaccepteerd, verlopen of gewijzigd geweigerd", async () => {
    const sig = await sign("m1", ts, body);
    expect(await verifySvixSignature(hdrs({ "svix-id": "m1", "svix-timestamp": ts, "svix-signature": sig }), body, SECRET)).toBe(true);
    expect(await verifySvixSignature(hdrs({ "svix-id": "m1", "svix-timestamp": ts, "svix-signature": sig }), body + " ", SECRET)).toBe(false);
    const old = String(Number(ts) - 600);
    expect(await verifySvixSignature(hdrs({ "svix-id": "m1", "svix-timestamp": old, "svix-signature": await sign("m1", old, body) }), body, SECRET)).toBe(false);
  });
  test("threads via In-Reply-To en References", () => {
    const r = threadReferences({ References: "<a@x> <b@y>" }, "<c@z>");
    expect(r).toContain("a@x"); expect(r).toContain("b@y"); expect(r).toContain("c@z");
    expect(normalizeAddresses(['Info <INFO@Bedrijf.nl>', 'x"),(evil'])).toEqual(["info@bedrijf.nl"]);
  });
});

describe("afzender", () => {
  test("alleen geverifieerde domeinen", () => {
    expect(isAllowedSender("info@aivancolumbus.com", ["aivancolumbus.com"])).toBe(true);
    expect(isAllowedSender("ceo@bank.nl", ["aivancolumbus.com"])).toBe(false);
    expect(isAllowedSender("x@aivancolumbus.com.evil.nl", ["aivancolumbus.com"])).toBe(false);
  });
});
