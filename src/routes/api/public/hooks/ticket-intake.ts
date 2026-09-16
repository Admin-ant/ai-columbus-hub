import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Public ticket intake.
 *
 * GET  /api/public/hooks/ticket-intake?org=<slug|uuid>   -> { name }
 * POST /api/public/hooks/ticket-intake?org=<slug|uuid>   -> { ok, ticket_number }
 *
 * Used by the public support form (/support/$orgSlug). Protected by a honeypot
 * field and a simple per-IP rate limit; no PII is ever returned.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const Payload = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(50).nullish().transform((v) => v ?? undefined),
  subject: z.string().trim().min(3).max(300),
  message: z.string().trim().min(3).max(10000),
  priority: z.enum(["laag", "normaal", "hoog", "urgent"]).nullish().transform((v) => v ?? "normaal"),
  company: z.string().trim().max(200).nullish().transform((v) => v ?? undefined), // honeypot
});

const UUID_RE = /^[0-9a-f-]{36}$/i;

async function resolveOrg(orgParam: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const q = supabaseAdmin.from("organizations").select("id, name, slug");
  const { data } = UUID_RE.test(orgParam)
    ? await q.eq("id", orgParam).maybeSingle()
    : await q.eq("slug", orgParam).maybeSingle();
  return (data ?? null) as { id: string; name: string; slug: string } | null;
}

const hits = new Map<string, number[]>();
function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

export const Route = createFileRoute("/api/public/hooks/ticket-intake")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const orgParam = new URL(request.url).searchParams.get("org");
        if (!orgParam) return json({ error: "Missing ?org=" }, 400);
        const org = await resolveOrg(orgParam);
        if (!org) return json({ error: "Not found" }, 404);
        return json({ name: org.name });
      },

      POST: async ({ request }) => {
        const orgParam = new URL(request.url).searchParams.get("org");
        if (!orgParam) return json({ error: "Missing ?org=" }, 400);

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const parsed = Payload.safeParse(raw);
        if (!parsed.success) return json({ error: "Invalid payload" }, 400);
        const p = parsed.data;

        // Honeypot: bots fill hidden fields. Pretend success.
        if (p.company) return json({ ok: true }, 201);

        const ip =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown";
        if (rateLimited(ip)) return json({ error: "Te veel aanvragen, probeer later opnieuw" }, 429);

        const org = await resolveOrg(orgParam);
        if (!org) return json({ error: "Not found" }, 404);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: numberRow, error: numErr } = await supabaseAdmin.rpc("next_ticket_number", {
          _org_id: org.id,
        } as never);
        if (numErr) {
          console.error("[ticket-intake] number failed", numErr);
          return json({ error: "Aanmaken mislukt" }, 500);
        }
        const ticket_number = numberRow as unknown as string;

        // Match an existing client on e-mail
        const { data: client } = await supabaseAdmin
          .from("clients")
          .select("id")
          .eq("organization_id", org.id)
          .ilike("email", p.email)
          .maybeSingle();

        const { data: ticket, error: insErr } = await supabaseAdmin
          .from("tickets")
          .insert({
            organization_id: org.id,
            ticket_number,
            subject: p.subject,
            priority: p.priority,
            source: "web",
            client_id: (client as { id: string } | null)?.id ?? null,
            requester_name: p.name,
            requester_email: p.email,
            requester_phone: p.phone ?? null,
          } as never)
          .select("id")
          .single();
        if (insErr || !ticket) {
          console.error("[ticket-intake] insert failed", insErr);
          return json({ error: "Aanmaken mislukt" }, 500);
        }

        await supabaseAdmin.from("ticket_messages").insert({
          ticket_id: (ticket as { id: string }).id,
          organization_id: org.id,
          direction: "in",
          body: p.message,
          author_name: p.name,
          channel: "web",
        } as never);

        // Bevestiging naar de melder + interne melding (mogen falen)
        try {
          const key = process.env.RESEND_API_KEY;
          const from = process.env.OUTREACH_FROM_EMAIL || "info@aivancolumbus.com";
          if (key) {
            const send = (to: string[], subject: string, html: string, replyTo?: string) =>
              fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  from: `${org.name} Support <${from}>`,
                  to,
                  subject,
                  html,
                  ...(replyTo ? { reply_to: replyTo } : {}),
                }),
              });

            await send(
              [p.email],
              `[${ticket_number}] ${p.subject}`,
              `<p>Bedankt voor je melding. We hebben ticket <b>${ticket_number}</b> aangemaakt en nemen zo snel mogelijk contact op.</p>`,
            );

            // Interne melding naar het support-adres van de organisatie
            const { data: ms } = await supabaseAdmin
              .from("mail_settings")
              .select("reply_to, from_email")
              .eq("organization_id", org.id)
              .maybeSingle();
            const settings = (ms ?? null) as { reply_to: string | null; from_email: string | null } | null;
            const { data: orgRow } = await supabaseAdmin
              .from("organizations")
              .select("email")
              .eq("id", org.id)
              .maybeSingle();
            const notify =
              process.env.TICKET_NOTIFY_EMAIL ||
              settings?.reply_to ||
              (orgRow as { email: string | null } | null)?.email ||
              settings?.from_email ||
              null;

            if (notify) {
              const esc = (s: string) =>
                s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
              await send(
                [notify],
                `Nieuw ticket ${ticket_number}: ${p.subject}`,
                `<p><b>Nieuwe melding via het supportformulier</b></p>
                 <p><b>Ticket:</b> ${ticket_number}<br/>
                 <b>Prioriteit:</b> ${esc(p.priority)}<br/>
                 <b>Van:</b> ${esc(p.name)} &lt;${esc(p.email)}&gt;${p.phone ? ` (${esc(p.phone)})` : ""}</p>
                 <p><b>Onderwerp:</b> ${esc(p.subject)}</p>
                 <p style="white-space:pre-wrap">${esc(p.message)}</p>`,
                p.email,
              );
            }
          }
        } catch (e) {
          console.error("[ticket-intake] mail failed", e);
        }

        return json({ ok: true, ticket_number }, 201);
      },
    },
  },
});
