import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PayerSchema = z.object({
  token: z.string().min(10).max(128),
  email: z.string().trim().email().max(255),
  company: z.string().trim().min(1).max(160),
  kvk: z.string().trim().max(40).optional().nullable(),
  vat: z.string().trim().max(40).optional().nullable(),
});

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function appBase() {
  return (
    process.env.APP_URL ||
    process.env.SITE_URL ||
    "https://project--0addc860-2162-4de8-8a00-3906ef74a397.lovable.app"
  ).replace(/\/$/, "");
}

export const createMolliePayment = createServerFn({ method: "POST" })
  .inputValidator((d) => PayerSchema.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.MOLLIE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Online betalen is nog niet geactiveerd. Vraag de afzender om de Mollie-koppeling te configureren.",
      );
    }

    const sb = await loadAdmin();
    const { data: q, error } = await sb
      .from("quotes")
      .select("id, organization_id, title, total_amount, status, revoked_at, paid_at, mollie_payment_id, public_token")
      .eq("public_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!q) throw new Error("Offerte niet gevonden");
    if (q.revoked_at) throw new Error("Deze offertelink is ingetrokken");
    if (q.paid_at) throw new Error("Deze offerte is al betaald");
    if (q.status !== "signed") throw new Error("Onderteken de offerte eerst");

    const amount = Number(q.total_amount ?? 0);
    if (amount <= 0) throw new Error("Bedrag is 0 — neem contact op met de afzender");

    const base = appBase();
    const body = {
      amount: { currency: "EUR", value: amount.toFixed(2) },
      description: q.title.slice(0, 255),
      method: "ideal",
      redirectUrl: `${base}/accept/quote/${q.public_token}?paid=1`,
      webhookUrl: `${base}/api/public/hooks/mollie`,
      metadata: {
        quote_id: q.id,
        token: q.public_token,
        payer_email: data.email,
        payer_company: data.company,
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
      throw new Error(`Mollie fout (${res.status}): ${txt.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      id: string;
      _links?: { checkout?: { href?: string } };
    };
    const checkoutUrl = json._links?.checkout?.href;
    if (!checkoutUrl) throw new Error("Mollie gaf geen checkout-URL terug");

    await sb
      .from("quotes")
      .update({
        mollie_payment_id: json.id,
        mollie_checkout_url: checkoutUrl,
        payer_email: data.email,
        payer_company: data.company,
        payer_kvk: data.kvk ?? null,
        payer_vat: data.vat ?? null,
      } as never)
      .eq("id", q.id);

    return { ok: true, checkoutUrl };
  });
