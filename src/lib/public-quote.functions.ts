import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TokenSchema = z.object({ token: z.string().min(10).max(128) });

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getPublicQuote = createServerFn({ method: "GET" })
  .inputValidator((d) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const sb = await loadAdmin();
    const { data: q, error } = await sb
      .from("quotes")
      .select(
        "id, title, content_json, total_amount, status, signature_svg, signed_at, mollie_payment_id, public_token, organization_id, created_at",
      )
      .eq("public_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!q) throw new Error("Offerte niet gevonden");
    const { data: org } = await sb
      .from("organizations")
      .select("name, logo_url, brand_color, invoice_prefix")
      .eq("id", q.organization_id)
      .maybeSingle();
    return { quote: q, organization: org };
  });

export const signPublicQuote = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token: z.string().min(10).max(128),
        signature_svg: z.string().min(20).max(200_000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await loadAdmin();
    const { data: q, error: e1 } = await sb
      .from("quotes")
      .select("id, status")
      .eq("public_token", data.token)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!q) throw new Error("Offerte niet gevonden");
    if (q.status === "approved_paid")
      throw new Error("Offerte is al betaald");

    const { error } = await sb
      .from("quotes")
      .update({
        signature_svg: data.signature_svg,
        signed_at: new Date().toISOString(),
        status: "signed",
      })
      .eq("id", q.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const payPublicQuote = createServerFn({ method: "POST" })
  .inputValidator((d) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const sb = await loadAdmin();
    const { data: q, error: e1 } = await sb
      .from("quotes")
      .select("id, organization_id, title, total_amount, status, mollie_payment_id")
      .eq("public_token", data.token)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!q) throw new Error("Offerte niet gevonden");
    if (q.status === "approved_paid" && q.mollie_payment_id) {
      return { ok: true, mock: true, payment_id: q.mollie_payment_id, invoice_number: null };
    }

    // Mock Mollie payment
    const payment_id = `tr_mock_${Math.random().toString(36).slice(2, 12)}`;

    // next_invoice_number is missing from the generated rpc overload union; cast via unknown.
    type RpcFn = (
      name: "next_invoice_number",
      args: { _org_id: string },
    ) => Promise<{ data: string | null; error: { message: string } | null }>;
    const rpcCall = (sb.rpc as unknown as RpcFn).bind(sb);
    const { data: num, error: nErr } = await rpcCall("next_invoice_number", {
      _org_id: q.organization_id,
    });
    if (nErr) throw new Error(nErr.message);
    if (!num) throw new Error("Kon factuurnummer niet genereren");

    const total = Number(q.total_amount ?? 0);
    const subtotal_cents = Math.round((total / 1.21) * 100);
    const vat_cents = Math.round(total * 100) - subtotal_cents;
    const total_cents = Math.round(total * 100);
    const due = new Date();
    due.setDate(due.getDate() + 14);

    const { data: inv, error: iErr } = await sb
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
        paid_at: new Date().toISOString(),
      })
      .select("id, invoice_number")
      .single();
    if (iErr) throw new Error(iErr.message);

    // Post double-entry journal
    await sb.rpc("post_invoice_journal", { _invoice_id: inv.id } as never);

    const { error: uErr } = await sb
      .from("quotes")
      .update({ status: "approved_paid", mollie_payment_id: payment_id })
      .eq("id", q.id);
    if (uErr) throw new Error(uErr.message);

    return { ok: true, mock: true, payment_id, invoice_number: inv.invoice_number };
  });
