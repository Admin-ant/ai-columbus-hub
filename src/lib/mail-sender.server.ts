import { isAllowedSender } from "@/lib/mail-security";

let cache: { at: number; domains: string[] } | null = null;

/** Verified sending domains from the mail service (cached 5 minutes). */
export async function getVerifiedDomains(): Promise<string[]> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.domains;
  const key = process.env.RESEND_API_KEY;
  if (!key) return [];
  const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) { console.error("[mail-sender] domains failed", r.status); return cache?.domains ?? []; }
  const j = (await r.json()) as { data?: Array<{ name: string; status: string }> };
  const domains = (j.data ?? []).filter((d) => d.status === "verified").map((d) => d.name.toLowerCase());
  cache = { at: Date.now(), domains };
  return domains;
}

/** Throws when the organization's configured sender is not on a verified domain. */
export async function assertAllowedSender(fromEmail: string): Promise<void> {
  const domains = await getVerifiedDomains();
  if (!isAllowedSender(fromEmail, domains)) {
    throw new Error(`Afzenderadres ${fromEmail} hoort niet bij een geverifieerd domein van je organisatie. Pas het aan in Mail-instellingen.`);
  }
}
