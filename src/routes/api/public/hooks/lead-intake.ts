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

        return json({ ok: true, lead_id: lead.id }, 201);
      },
    },
  },
});
