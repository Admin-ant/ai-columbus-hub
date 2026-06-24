import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TokenSchema = z.object({ token: z.string().min(10).max(128) });

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function sendSignedNotification(opts: {
  to: string;
  orgName: string;
  quoteTitle: string;
  signerName: string;
  signedAt: string;
  publicUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.OUTREACH_FROM_EMAIL;
  if (!apiKey || !from || !opts.to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: `Offerte ondertekend: ${opts.quoteTitle}`,
        html: `<div style="font-family:Inter,Arial,sans-serif;max-width:560px">
          <h2 style="margin:0 0 12px">Offerte ondertekend ✅</h2>
          <p>Goed nieuws — <strong>${escapeHtml(opts.signerName)}</strong> heeft zojuist je offerte
          <strong>${escapeHtml(opts.quoteTitle)}</strong> ondertekend.</p>
          <p style="color:#555">Organisatie: ${escapeHtml(opts.orgName)}<br/>
          Tijdstip: ${new Date(opts.signedAt).toLocaleString("nl-NL")}</p>
          <p><a href="${opts.publicUrl}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Bekijk de getekende offerte</a></p>
          <p style="color:#888;font-size:12px;margin-top:24px">Automatisch verstuurd vanuit het Offerte Studio platform.</p>
        </div>`,
      }),
    });
  } catch {
    // notification is best-effort
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export const getPublicQuote = createServerFn({ method: "GET" })
  .inputValidator((d) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const sb = await loadAdmin();
    const { data: q, error } = await sb
      .from("quotes")
      .select(
        "id, title, content_json, total_amount, status, signature_svg, signed_at, mollie_payment_id, public_token, organization_id, created_at, accepted_at, accepted_by_name, intro_video_url, intro_message, revoked_at, last_viewed_at, sent_at",
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

    // Track view (counter + status promotion sent->viewed); ignored if revoked/accepted
    if (!q.revoked_at && !q.accepted_at) {
      await sb.rpc("track_quote_view", { _token: data.token } as never);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentView } = await sb
        .from("quote_status_events")
        .select("id")
        .eq("quote_id", q.id)
        .eq("event_type", "viewed")
        .gte("occurred_at", oneHourAgo)
        .maybeSingle();
      if (!recentView) {
        await sb.from("quote_status_events").insert({
          quote_id: q.id,
          organization_id: q.organization_id,
          event_type: "viewed",
        });
      }
    }

    const { data: events } = await sb
      .from("quote_status_events")
      .select("id, event_type, occurred_at, metadata")
      .eq("quote_id", q.id)
      .order("occurred_at", { ascending: false });

    let journal_entry_id: string | null = null;
    const { data: inv } = await sb
      .from("invoices")
      .select("id")
      .eq("quote_id", q.id)
      .maybeSingle();
    if (inv) {
      const { data: je } = await sb
        .from("journal_entries")
        .select("id")
        .eq("invoice_id", inv.id)
        .maybeSingle();
      if (je) journal_entry_id = je.id;
    }

    return { quote: q, organization: org, events: events ?? [], journal_entry_id };
  });

export const signPublicQuote = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token: z.string().min(10).max(128),
        signature_svg: z.string().min(20).max(200_000),
        name: z.string().trim().min(2).max(120),
        terms_accepted: z.literal(true),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await loadAdmin();
    const { data: q, error: e1 } = await sb
      .from("quotes")
      .select("id, organization_id, status, revoked_at, notify_email, title, public_token")
      .eq("public_token", data.token)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!q) throw new Error("Offerte niet gevonden");
    if (q.revoked_at) throw new Error("Deze offertelink is ingetrokken");
    if (q.status === "approved_paid") throw new Error("Offerte is al betaald");

    const nowIso = new Date().toISOString();
    const { error } = await sb
      .from("quotes")
      .update({
        signature_svg: data.signature_svg,
        signed_at: nowIso,
        accepted_at: nowIso,
        accepted_by_name: data.name,
        terms_accepted_at: nowIso,
        status: "signed",
      } as never)
      .eq("id", q.id);
    if (error) throw new Error(error.message);

    await sb.from("quote_status_events").insert({
      quote_id: q.id,
      organization_id: q.organization_id,
      event_type: "signed",
    });

    // Best-effort notification e-mail
    if (q.notify_email) {
      const { data: org } = await sb
        .from("organizations")
        .select("name")
        .eq("id", q.organization_id)
        .maybeSingle();
      const base = process.env.APP_URL || process.env.SITE_URL || "";
      const publicUrl = `${base.replace(/\/$/, "")}/accept/quote/${q.public_token}`;
      await sendSignedNotification({
        to: q.notify_email,
        orgName: org?.name ?? "",
        quoteTitle: q.title,
        signerName: data.name,
        signedAt: nowIso,
        publicUrl,
      });
    }

    return { ok: true };
  });

export const payPublicQuote = createServerFn({ method: "POST" })
  .inputValidator((d) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const sb = await loadAdmin();
    const { data: q, error: e1 } = await sb
      .from("quotes")
      .select("id, organization_id, title, total_amount, status, mollie_payment_id, revoked_at")
      .eq("public_token", data.token)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!q) throw new Error("Offerte niet gevonden");
    if (q.revoked_at) throw new Error("Deze offertelink is ingetrokken");
    if (q.status === "approved_paid" && q.mollie_payment_id) {
      return { ok: true, mock: true, payment_id: q.mollie_payment_id, invoice_number: null };
    }

    const payment_id = `tr_mock_${Math.random().toString(36).slice(2, 12)}`;

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

    await sb.rpc("post_invoice_journal", { _invoice_id: inv.id } as never);

    const { error: uErr } = await sb
      .from("quotes")
      .update({ status: "approved_paid", mollie_payment_id: payment_id })
      .eq("id", q.id);
    if (uErr) throw new Error(uErr.message);

    await sb.from("quote_status_events").insert([
      {
        quote_id: q.id,
        organization_id: q.organization_id,
        event_type: "paid",
        metadata: { payment_id, amount: total },
      },
      {
        quote_id: q.id,
        organization_id: q.organization_id,
        event_type: "invoice_created",
        metadata: { invoice_id: inv.id, invoice_number: inv.invoice_number },
      },
    ]);

    return { ok: true, mock: true, payment_id, invoice_number: inv.invoice_number };
  });
