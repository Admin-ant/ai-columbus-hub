import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Public lead-intake webhook.
 *
 * Endpoint:  POST /api/public/hooks/lead-intake?org=<organization_id>
 * Auth:      header `x-webhook-secret: <LEAD_INTAKE_SECRET>`
 * Body JSON:
 *   {
 *     "source": "campagne",
 *     "name": "Jan Jansen",
 *     "company": "Bouwbedrijf BV",
 *     "email": "jan@example.com",
 *     "phone": "+31612345678",
 *     "message": "Wil graag demo",
 *     "meta": { "page": "/campagne", "userAgent": "..." }
 *   }
 *
 * Inserts a row in `leads` for the given organization.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-webhook-secret",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const PayloadSchema = z.object({
  source: z.string().trim().max(100).optional(),
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().max(50).optional(),
  message: z.string().trim().max(5000).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const Route = createFileRoute("/api/public/hooks/lead-intake")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        const secret = process.env.LEAD_INTAKE_SECRET;
        if (!secret) {
          console.error("[lead-intake] LEAD_INTAKE_SECRET not configured");
          return json({ error: "Webhook secret not configured" }, 503);
        }
        if (request.headers.get("x-webhook-secret") !== secret) {
          return json({ error: "Unauthorized" }, 401);
        }

        const url = new URL(request.url);
        const orgId = url.searchParams.get("org");
        if (!orgId || !/^[0-9a-f-]{36}$/i.test(orgId)) {
          return json({ error: "Missing or invalid ?org= organization_id" }, 400);
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        const parsed = PayloadSchema.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
        }
        const p = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Confirm organization exists
        const { data: org, error: orgErr } = await supabaseAdmin
          .from("organizations")
          .select("id")
          .eq("id", orgId)
          .maybeSingle();
        if (orgErr) {
          console.error("[lead-intake] org lookup failed", orgErr);
          return json({ error: "Lookup failed" }, 500);
        }
        if (!org) return json({ error: "Organization not found" }, 404);

        const notesParts: string[] = [];
        if (p.message) notesParts.push(p.message);
        if (p.meta && Object.keys(p.meta).length > 0) {
          notesParts.push("---\nmeta: " + JSON.stringify(p.meta));
        }

        const { data: lead, error: insErr } = await supabaseAdmin
          .from("leads")
          .insert({
            organization_id: orgId,
            name: p.name,
            company: p.company ?? null,
            email: p.email ?? null,
            phone: p.phone ?? null,
            source: p.source ?? "webhook",
            notes: notesParts.join("\n\n") || null,
            stage: "nieuwe",
          })
          .select("id")
          .single();

        if (insErr) {
          console.error("[lead-intake] insert failed", insErr);
          return json({ error: "Insert failed", details: insErr.message }, 500);
        }

        // Notificatiemail naar info@aivancolumbus.com (fire-and-forget, faalt nooit de webhook)
        try {
          const resendKey = process.env.RESEND_API_KEY;
          const fromEmail = process.env.OUTREACH_FROM_EMAIL || "info@aivancolumbus.com";
          if (resendKey) {
            const esc = (s: string) =>
              s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const rows: Array<[string, string | null | undefined]> = [
              ["Naam", p.name],
              ["Bedrijf", p.company],
              ["Email", p.email],
              ["Telefoon", p.phone],
              ["Bron", p.source ?? "webhook"],
              ["Bericht", p.message],
            ];
            const html = `
              <h2 style="font-family:Arial,sans-serif">Nieuwe lead binnengekomen</h2>
              <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
                ${rows
                  .filter(([, v]) => v)
                  .map(
                    ([k, v]) =>
                      `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top"><b>${k}</b></td><td style="padding:4px 0">${esc(String(v))}</td></tr>`,
                  )
                  .join("")}
              </table>
              ${
                p.meta && Object.keys(p.meta).length > 0
                  ? `<p style="font-family:Arial,sans-serif;font-size:12px;color:#666"><b>Meta</b></p><pre style="background:#f5f5f5;padding:8px;border-radius:4px;font-size:12px">${esc(JSON.stringify(p.meta, null, 2))}</pre>`
                  : ""
              }
              <p style="font-family:Arial,sans-serif;font-size:12px;color:#999">Lead-ID: ${lead.id}</p>
            `;
            const mailRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: `Lead Intake <${fromEmail}>`,
                to: ["info@aivancolumbus.com"],
                reply_to: p.email || undefined,
                subject: `Nieuwe lead: ${p.name}${p.company ? ` (${p.company})` : ""}`,
                html,
              }),
            });
            if (!mailRes.ok) {
              console.error("[lead-intake] notify mail failed", mailRes.status, await mailRes.text());
            }
          } else {
            console.warn("[lead-intake] RESEND_API_KEY missing, skipping notify mail");
          }
        } catch (e) {
          console.error("[lead-intake] notify mail error", e);
        }

        return json({ ok: true, lead_id: lead.id }, 201);
      },
    },
  },
});
