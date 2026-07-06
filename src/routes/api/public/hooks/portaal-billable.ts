import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Universele portaal-webhook (Columbus Portaal / inzet.nl / …).
 *
 * Endpoint:  POST /api/public/hooks/portaal-billable?org=<organization_id>
 * Auth:      header  x-webhook-secret: <PORTAL_WEBHOOK_SECRET>
 *
 * Payload:
 * {
 *   "source":      "columbus_portaal" | "inzet_nl" | string,
 *   "event":       "invoice.ready" | "quote.requested" | "client.updated" | "candidate.new",
 *   "external_id": "COL-2026-00123",
 *   "external_url":"https://portaal.example/…",
 *   "client": { "name": "...", "kvk": "...", "vat": "...", "email": "...", "phone": "...",
 *               "address_line1": "...", "postal_code": "...", "city": "...",
 *               "contact_person": "...", "external_id": "..." },
 *   "invoice": { "issue_date": "2026-07-01", "due_date": "2026-07-31", "currency": "EUR",
 *                "lines": [ { "description": "...", "quantity": 1, "unit_price_cents": 12500, "vat_rate": 21 } ] },
 *   "quote":   { "title": "...", "lines": [ … ] },
 *   "lead":    { "name": "...", "email": "...", "phone": "...", "company": "...", "role": "..." }
 * }
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

const LineSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  quantity: z.number().positive().default(1),
  unit_price_cents: z.number().int().nonnegative(),
  vat_rate: z.number().min(0).max(30).default(21),
});

const ClientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kvk: z.string().trim().max(50).optional(),
  vat: z.string().trim().max(50).optional(),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().max(50).optional(),
  address_line1: z.string().trim().max(200).optional(),
  postal_code: z.string().trim().max(20).optional(),
  city: z.string().trim().max(100).optional(),
  contact_person: z.string().trim().max(200).optional(),
  external_id: z.string().trim().max(120).optional(),
});

const PayloadSchema = z.object({
  source: z.string().trim().min(1).max(60),
  event: z.enum(["invoice.ready", "quote.requested", "client.updated", "candidate.new"]),
  external_id: z.string().trim().min(1).max(120),
  external_url: z.string().url().max(500).optional(),
  client: ClientSchema.optional(),
  invoice: z
    .object({
      issue_date: z.string().optional(),
      due_date: z.string().optional(),
      currency: z.string().length(3).default("EUR"),
      lines: z.array(LineSchema).min(1),
    })
    .optional(),
  quote: z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
      lines: z.array(LineSchema).min(1),
    })
    .optional(),
  lead: z
    .object({
      name: z.string().trim().min(1).max(200),
      email: z.string().trim().email().max(255).optional(),
      phone: z.string().trim().max(50).optional(),
      company: z.string().trim().max(200).optional(),
      role: z.string().trim().max(200).optional(),
    })
    .optional(),
});

type SB = Awaited<ReturnType<typeof import("@/integrations/supabase/client.server").supabaseAdmin["from"] extends never ? never : () => never>>;

export const Route = createFileRoute("/api/public/hooks/portaal-billable")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        const secret = process.env.PORTAL_WEBHOOK_SECRET;
        if (!secret) {
          console.error("[portaal-billable] PORTAL_WEBHOOK_SECRET not configured");
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

        const { data: org } = await supabaseAdmin
          .from("organizations")
          .select("id")
          .eq("id", orgId)
          .maybeSingle();
        if (!org) return json({ error: "Organization not found" }, 404);

        // Audit start
        const { data: evt } = await supabaseAdmin
          .from("integration_events")
          .insert({
            organization_id: orgId,
            source: p.source,
            event: p.event,
            external_id: p.external_id,
            status: "processing",
            payload: p as never,
          } as never)
          .select("id")
          .single();

        const eventId = evt?.id;
        const finalize = async (patch: Record<string, unknown>) => {
          if (eventId) await supabaseAdmin.from("integration_events").update(patch as never).eq("id", eventId);
        };

        try {
          // 1. Upsert client if payload has one
          let clientId: string | null = null;
          let clientName: string | null = null;
          if (p.client) {
            const c = p.client;
            // Try match: external, then kvk, then email, then name
            let existing: { id: string; name: string } | null = null;
            const tries: Array<[string, string]> = [];
            if (c.external_id) tries.push(["external_id", c.external_id]);
            if (c.kvk) tries.push(["kvk_number", c.kvk]);
            if (c.email) tries.push(["email", c.email]);
            for (const [col, val] of tries) {
              const { data } = await supabaseAdmin
                .from("clients")
                .select("id,name")
                .eq("organization_id", orgId)
                .eq(col, val)
                .maybeSingle();
              if (data) { existing = data; break; }
            }

            const patch = {
              organization_id: orgId,
              name: c.name,
              kvk_number: c.kvk ?? null,
              vat_number: c.vat ?? null,
              email: c.email ?? null,
              phone: c.phone ?? null,
              address_line1: c.address_line1 ?? null,
              postal_code: c.postal_code ?? null,
              city: c.city ?? null,
              contact_person: c.contact_person ?? null,
              external_source: p.source,
              external_id: c.external_id ?? null,
            };

            if (existing) {
              const { error } = await supabaseAdmin.from("clients").update(patch).eq("id", existing.id);
              if (error) throw new Error("client update: " + error.message);
              clientId = existing.id;
              clientName = c.name;
            } else {
              const { data, error } = await supabaseAdmin
                .from("clients")
                .insert({ ...patch, monthly_value: 0 })
                .select("id,name")
                .single();
              if (error) throw new Error("client insert: " + error.message);
              clientId = data.id;
              clientName = data.name;
            }
          }

          // 2. Route by event
          if (p.event === "client.updated") {
            await finalize({ status: "ok", created_client_id: clientId });
            return json({ ok: true, client_id: clientId });
          }

          if (p.event === "candidate.new" && p.lead) {
            const { data: existing } = await supabaseAdmin
              .from("leads")
              .select("id")
              .eq("organization_id", orgId)
              .eq("external_source", p.source)
              .eq("external_id", p.external_id)
              .maybeSingle();
            let leadId = existing?.id;
            if (!leadId) {
              const { data, error } = await supabaseAdmin
                .from("leads")
                .insert({
                  organization_id: orgId,
                  name: p.lead.name,
                  email: p.lead.email ?? null,
                  phone: p.lead.phone ?? null,
                  company: p.lead.company ?? null,
                  source: p.source,
                  stage: "nieuwe",
                  notes: p.lead.role ? `Rol: ${p.lead.role}` : null,
                  external_source: p.source,
                  external_id: p.external_id,
                  external_url: p.external_url ?? null,
                })
                .select("id")
                .single();
              if (error) throw new Error("lead insert: " + error.message);
              leadId = data.id;
            }
            await finalize({ status: "ok", created_lead_id: leadId, created_client_id: clientId });
            return json({ ok: true, lead_id: leadId });
          }

          if (p.event === "invoice.ready") {
            if (!p.invoice) throw new Error("invoice.ready requires 'invoice' payload");
            // Idempotent: already imported?
            const { data: dup } = await supabaseAdmin
              .from("invoices")
              .select("id")
              .eq("organization_id", orgId)
              .eq("external_source", p.source)
              .eq("external_id", p.external_id)
              .maybeSingle();
            if (dup) {
              await finalize({ status: "ok", result: { duplicate: true }, created_invoice_id: dup.id });
              return json({ ok: true, invoice_id: dup.id, duplicate: true });
            }

            const lines = p.invoice.lines.map((l, i) => {
              const subtotal = Math.round(l.unit_price_cents * l.quantity);
              const vat = Math.round((subtotal * l.vat_rate) / 100);
              return {
                position: i + 1,
                description: l.description,
                quantity: l.quantity,
                unit_price_cents: l.unit_price_cents,
                vat_rate: l.vat_rate,
                subtotal_cents: subtotal,
                vat_cents: vat,
                total_cents: subtotal + vat,
              };
            });
            const subtotal_cents = lines.reduce((s, l) => s + l.subtotal_cents, 0);
            const vat_cents = lines.reduce((s, l) => s + l.vat_cents, 0);
            const total_cents = subtotal_cents + vat_cents;

            // Get invoice number via SECURITY DEFINER rpc (calls app_private helper)
            const { data: numData, error: numErr } = await (
              supabaseAdmin.rpc as unknown as (
                fn: string,
                args: Record<string, unknown>,
              ) => Promise<{ data: string | null; error: { message: string } | null }>
            )("next_invoice_number", { _org_id: orgId });
            if (numErr) throw new Error("invoice_number: " + numErr.message);
            const invoice_number = numData ?? `EXT-${Date.now()}`;

            const today = p.invoice.issue_date ?? new Date().toISOString().slice(0, 10);
            const due = p.invoice.due_date ?? new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

            const { data: inv, error: invErr } = await supabaseAdmin
              .from("invoices")
              .insert({
                organization_id: orgId,
                invoice_number,
                client_id: clientId,
                client_name: clientName ?? "Onbekend",
                amount: total_cents / 100,
                subtotal_cents,
                vat_cents,
                total_cents,
                currency: p.invoice.currency ?? "EUR",
                issue_date: today,
                due_date: due,
                status: "draft",
                external_source: p.source,
                external_id: p.external_id,
                external_url: p.external_url ?? null,
              })
              .select("id")
              .single();
            if (invErr) throw new Error("invoice insert: " + invErr.message);

            const { error: linesErr } = await supabaseAdmin
              .from("invoice_lines")
              .insert(lines.map((l) => ({ ...l, invoice_id: inv.id })));
            if (linesErr) throw new Error("invoice_lines insert: " + linesErr.message);

            // Post journal entry (bookkeeping)
            const { error: jErr } = await (
              supabaseAdmin.rpc as unknown as (
                fn: string,
                args: Record<string, unknown>,
              ) => Promise<{ error: { message: string } | null }>
            )("post_invoice_journal", { _invoice_id: inv.id });
            if (jErr) console.error("[portaal-billable] journal post failed:", jErr.message);

            await finalize({
              status: "ok",
              created_invoice_id: inv.id,
              created_client_id: clientId,
              result: { invoice_number, total_cents },
            });
            return json({ ok: true, invoice_id: inv.id, invoice_number }, 201);
          }

          if (p.event === "quote.requested") {
            if (!p.quote) throw new Error("quote.requested requires 'quote' payload");
            const { data: dup } = await supabaseAdmin
              .from("quotes")
              .select("id")
              .eq("organization_id", orgId)
              .eq("external_source", p.source)
              .eq("external_id", p.external_id)
              .maybeSingle();
            if (dup) {
              await finalize({ status: "ok", result: { duplicate: true }, created_quote_id: dup.id });
              return json({ ok: true, quote_id: dup.id, duplicate: true });
            }
            const total_cents = p.quote.lines.reduce((s, l) => {
              const sub = l.unit_price_cents * l.quantity;
              return s + sub + Math.round((sub * l.vat_rate) / 100);
            }, 0);
            const { data: q, error: qErr } = await supabaseAdmin
              .from("quotes")
              .insert({
                organization_id: orgId,
                client_id: clientId,
                title: p.quote.title ?? `Offerte ${p.external_id}`,
                content_json: { lines: p.quote.lines } as never,
                total_amount: total_cents / 100,
                status: "draft",
                client_email: p.client?.email ?? null,
                external_source: p.source,
                external_id: p.external_id,
                external_url: p.external_url ?? null,
              })
              .select("id")
              .single();
            if (qErr) throw new Error("quote insert: " + qErr.message);

            await finalize({ status: "ok", created_quote_id: q.id, created_client_id: clientId });
            return json({ ok: true, quote_id: q.id }, 201);
          }

          await finalize({ status: "error", error_message: "Unhandled event: " + p.event });
          return json({ error: "Unhandled event" }, 400);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[portaal-billable] failure:", msg);
          await finalize({ status: "error", error_message: msg });
          return json({ error: msg }, 500);
        }
      },
    },
  },
});
