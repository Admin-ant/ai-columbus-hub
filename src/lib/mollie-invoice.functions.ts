import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { centsToEuros } from "@/lib/currency";

/**
 * Genereert een Mollie-betaallink voor een bestaande factuur.
 * Slaat de checkout-URL op in `invoices.mollie_checkout_url` en
 * `invoices.payment_link_url` zodat de klant hem via mail of PDF krijgt.
 * De webhook `/api/public/hooks/mollie` markeert de factuur als betaald.
 */

function appBase() {
  return (
    process.env.APP_URL ||
    process.env.SITE_URL ||
    "https://project--0addc860-2162-4de8-8a00-3906ef74a397.lovable.app"
  ).replace(/\/$/, "");
}

const METHODS = [
  "ideal",
  "creditcard",
  "bancontact",
  "paypal",
  "banktransfer",
  "applepay",
  "sofort",
] as const;
export type MolliePaymentMethod = (typeof METHODS)[number];

export const createMollieInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        invoice_id: z.string().uuid(),
        // Voorkeur: klant kan in checkout nog wisselen tenzij restrict=true
        preferred_method: z.enum(METHODS).nullable().optional(),
        restrict: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.MOLLIE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Mollie is niet geconfigureerd. Voeg een MOLLIE_API_KEY toe in Cloud secrets.",
      );
    }

    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select(
        "id, organization_id, invoice_number, total_cents, currency, status, client_name, mollie_checkout_url, mollie_payment_id",
      )
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (error || !inv) throw new Error(error?.message ?? "Factuur niet gevonden");
    const row = inv as {
      id: string;
      organization_id: string;
      invoice_number: string;
      total_cents: number;
      currency: string | null;
      status: string;
      client_name: string | null;
      mollie_checkout_url: string | null;
      mollie_payment_id: string | null;
    };

    if (row.status === "paid") throw new Error("Deze factuur is al betaald");
    if (row.status === "cancelled") throw new Error("Deze factuur is geannuleerd");
    if (!row.total_cents || row.total_cents <= 0) {
      throw new Error("Totaalbedrag is 0 — factuur eerst afronden");
    }

    // Als er al een open link is, gebruik die opnieuw (idempotent).
    if (row.mollie_checkout_url && row.mollie_payment_id) {
      try {
        const check = await fetch(
          `https://api.mollie.com/v2/payments/${encodeURIComponent(row.mollie_payment_id)}`,
          { headers: { Authorization: `Bearer ${apiKey}` } },
        );
        if (check.ok) {
          const p = (await check.json()) as { status?: string };
          if (p.status === "open" || p.status === "pending") {
            return { ok: true, checkoutUrl: row.mollie_checkout_url, reused: true };
          }
        }
      } catch {
        /* fall through and create a new one */
      }
    }

    const base = appBase();
    const amount = centsToEuros(row.total_cents);
    const restrict = data.restrict === true && !!data.preferred_method;
    const body = {
      amount: {
        currency: (row.currency || "EUR").toUpperCase(),
        value: amount.toFixed(2),
      },
      description: `Factuur ${row.invoice_number}${row.client_name ? ` — ${row.client_name}` : ""}`.slice(0, 255),
      ...(restrict ? { method: data.preferred_method } : {}),
      redirectUrl: `${base}/invoices/${row.id}?paid=1`,
      webhookUrl: `${base}/api/public/hooks/mollie`,
      metadata: {
        invoice_id: row.id,
        invoice_number: row.invoice_number,
        preferred_method: data.preferred_method ?? null,
      },
    };

    const res = await fetch("https://api.mollie.com/v2/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Mollie fout (${res.status}): ${txt.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      id: string;
      status?: string;
      _links?: { checkout?: { href?: string } };
    };
    const checkoutUrl = json._links?.checkout?.href;
    if (!checkoutUrl) throw new Error("Mollie gaf geen checkout-URL terug");

    const { error: upErr } = await context.supabase
      .from("invoices")
      .update({
        mollie_payment_id: json.id,
        mollie_checkout_url: checkoutUrl,
        payment_link_url: checkoutUrl,
        preferred_payment_method: data.preferred_method ?? null,
      } as never)
      .eq("id", row.id);
    if (upErr) throw new Error(upErr.message);

    await context.supabase.from("invoice_payment_events").insert({
      invoice_id: row.id,
      organization_id: row.organization_id,
      event_type: "created",
      mollie_payment_id: json.id,
      status: json.status ?? "open",
      amount_cents: row.total_cents,
      method: data.preferred_method ?? null,
      metadata: { restrict, checkout_url: checkoutUrl },
    } as never);

    return { ok: true, checkoutUrl, reused: false, status: json.status ?? "open" };
  });

export const revokeMollieInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: inv } = await context.supabase
      .from("invoices")
      .select("id, organization_id, mollie_payment_id")
      .eq("id", data.invoice_id)
      .maybeSingle();

    const { error } = await context.supabase
      .from("invoices")
      .update({
        mollie_checkout_url: null,
        payment_link_url: null,
      } as never)
      .eq("id", data.invoice_id);
    if (error) throw new Error(error.message);

    if (inv) {
      const row = inv as { id: string; organization_id: string; mollie_payment_id: string | null };
      await context.supabase.from("invoice_payment_events").insert({
        invoice_id: row.id,
        organization_id: row.organization_id,
        event_type: "revoked",
        mollie_payment_id: row.mollie_payment_id,
        status: "revoked",
        metadata: {},
      } as never);
    }
    return { ok: true };
  });

/** Haalt de betalings-events op voor een factuur (nieuwste eerst). */
export const listInvoicePaymentEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("invoice_payment_events")
      .select("id, event_type, mollie_payment_id, status, amount_cents, method, metadata, created_at")
      .eq("invoice_id", data.invoice_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { events: (rows ?? []) as Array<{
      id: string;
      event_type: string;
      mollie_payment_id: string | null;
      status: string | null;
      amount_cents: number | null;
      method: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
    }> };
  });

/** Refresh: haalt actuele status uit Mollie en logt een event bij statuswijziging. */
export const refreshMollieInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.MOLLIE_API_KEY;
    if (!apiKey) throw new Error("Mollie is niet geconfigureerd.");
    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select("id, organization_id, mollie_payment_id, total_cents")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (error || !inv) throw new Error("Factuur niet gevonden");
    const row = inv as { id: string; organization_id: string; mollie_payment_id: string | null; total_cents: number };
    if (!row.mollie_payment_id) return { ok: true, status: null };

    const res = await fetch(
      `https://api.mollie.com/v2/payments/${encodeURIComponent(row.mollie_payment_id)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!res.ok) throw new Error(`Mollie fout (${res.status})`);
    const p = (await res.json()) as { status?: string; method?: string | null };

    // Log een polled-event zodat de history bijblijft; webhook doet zelf status-events.
    await context.supabase.from("invoice_payment_events").insert({
      invoice_id: row.id,
      organization_id: row.organization_id,
      event_type: "polled",
      mollie_payment_id: row.mollie_payment_id,
      status: p.status ?? null,
      method: p.method ?? null,
      amount_cents: row.total_cents,
      metadata: {},
    } as never);

    return { ok: true, status: p.status ?? null, method: p.method ?? null };
  });
