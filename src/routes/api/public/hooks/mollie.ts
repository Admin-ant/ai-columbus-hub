import { createFileRoute } from "@tanstack/react-router";

// Mollie webhook: POST application/x-www-form-urlencoded with field `id`
// We re-fetch the payment from Mollie to verify status.

export const Route = createFileRoute("/api/public/hooks/mollie")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.MOLLIE_API_KEY;
        if (!apiKey) {
          return new Response("Mollie not configured", { status: 503 });
        }
        let paymentId: string | null = null;
        try {
          const ct = request.headers.get("content-type") || "";
          if (ct.includes("application/json")) {
            const j = (await request.json().catch(() => null)) as { id?: string } | null;
            paymentId = j?.id ?? null;
          } else {
            const form = await request.formData();
            const v = form.get("id");
            paymentId = typeof v === "string" ? v : null;
          }
        } catch {
          /* ignore */
        }
        if (!paymentId || !/^tr_[A-Za-z0-9]+$/.test(paymentId)) {
          return new Response("Missing id", { status: 400 });
        }

        const res = await fetch(
          `https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}`,
          { headers: { Authorization: `Bearer ${apiKey}` } },
        );
        if (!res.ok) return new Response("Mollie lookup failed", { status: 502 });
        const payment = (await res.json()) as {
          id: string;
          status: string;
          paidAt?: string | null;
          metadata?: {
            quote_id?: string;
            token?: string;
            invoice_id?: string;
            invoice_number?: string;
          } | null;
        };

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // --- Path A: betaling gekoppeld aan een bestaande factuur ---
        const invoiceId = payment.metadata?.invoice_id;
        if (invoiceId) {
          if (payment.status === "paid") {
            const paidAtIso = payment.paidAt ?? new Date().toISOString();
            const { data: existing } = await supabaseAdmin
              .from("invoices")
              .select("id, status, paid_at")
              .eq("id", invoiceId)
              .maybeSingle();
            if (existing && (existing as { paid_at: string | null }).paid_at == null) {
              await supabaseAdmin
                .from("invoices")
                .update({
                  status: "paid",
                  paid_at: paidAtIso,
                  mollie_payment_id: payment.id,
                } as never)
                .eq("id", invoiceId);
              try {
                await supabaseAdmin.rpc("post_invoice_journal", {
                  _invoice_id: invoiceId,
                } as never);
              } catch {
                /* journal is best-effort */
              }
            }
          }
          return new Response("ok", { status: 200 });
        }

        // --- Path B: betaling gekoppeld aan een offerte (legacy quote flow) ---
        const token = payment.metadata?.token;
        if (!token) return new Response("ok", { status: 200 });

        const { data: q } = await supabaseAdmin
          .from("quotes")
          .select("id, organization_id, total_amount, paid_at")
          .eq("public_token", token)
          .maybeSingle();
        if (!q) return new Response("ok", { status: 200 });

        if (payment.status === "paid" && !q.paid_at) {
          const paidAtIso = payment.paidAt ?? new Date().toISOString();
          await supabaseAdmin
            .from("quotes")
            .update({
              status: "approved_paid",
              paid_at: paidAtIso,
              mollie_payment_id: payment.id,
            } as never)
            .eq("id", q.id);

          await supabaseAdmin.from("quote_status_events").insert({
            quote_id: q.id,
            organization_id: q.organization_id,
            event_type: "paid",
            metadata: { payment_id: payment.id, amount: q.total_amount, provider: "mollie" },
          } as never);

          // Best-effort: create invoice via existing flow
          try {
            type RpcFn = (
              name: "next_invoice_number",
              args: { _org_id: string },
            ) => Promise<{ data: string | null; error: { message: string } | null }>;
            const rpc = (supabaseAdmin.rpc as unknown as RpcFn).bind(supabaseAdmin);
            const { data: num } = await rpc("next_invoice_number", { _org_id: q.organization_id });
            if (num) {
              const total = Number(q.total_amount ?? 0);
              const subtotal_cents = Math.round((total / 1.21) * 100);
              const total_cents = Math.round(total * 100);
              const vat_cents = total_cents - subtotal_cents;
              const due = new Date();
              due.setDate(due.getDate() + 14);
              const { data: inv } = await supabaseAdmin
                .from("invoices")
                .insert({
                  organization_id: q.organization_id,
                  quote_id: q.id,
                  invoice_number: String(num),
                  amount: total,
                  subtotal_cents,
                  vat_cents,
                  total_cents,
                  status: "paid",
                  due_date: due.toISOString().slice(0, 10),
                  sent_at: new Date().toISOString(),
                  paid_at: paidAtIso,
                } as never)
                .select("id, invoice_number")
                .single();
              if (inv) {
                await supabaseAdmin.rpc("post_invoice_journal", { _invoice_id: inv.id } as never);
                await supabaseAdmin.from("quote_status_events").insert({
                  quote_id: q.id,
                  organization_id: q.organization_id,
                  event_type: "invoice_created",
                  metadata: { invoice_id: inv.id, invoice_number: inv.invoice_number },
                } as never);
              }
            }
          } catch {
            // invoice generation is best-effort
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
