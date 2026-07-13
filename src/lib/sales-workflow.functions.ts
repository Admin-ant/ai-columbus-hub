import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OrgSchema = z.object({ organizationId: z.string().uuid() });
const LeadIdSchema = z.object({ leadId: z.string().uuid() });

const RequirementsSchema = z.object({
  leadId: z.string().uuid(),
  organizationId: z.string().uuid(),
  scope: z.string().max(4000).default(""),
  oneTimeCents: z.number().int().min(0).max(100_000_000).default(0),
  recurringCents: z.number().int().min(0).max(100_000_000).default(0),
  currency: z.string().min(3).max(3).default("EUR"),
  notes: z.string().max(2000).nullable().optional(),
});

const GenerateSchema = z.object({
  leadId: z.string().uuid(),
  organizationId: z.string().uuid(),
});

export type PipelineLead = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  stage: string;
  source: string | null;
  created_at: string;
  potential_monthly_value: number;
  converted_client_id: string | null;
  requirements: {
    id: string;
    scope: string;
    one_time_cents: number;
    recurring_cents: number;
    notes: string | null;
  } | null;
  quote: {
    id: string;
    title: string;
    status: string;
    total_amount: number;
    signed_at: string | null;
    public_token: string;
    sent_at: string | null;
    paid_at: string | null;
  } | null;
  contract: {
    id: string;
    status: string;
    monthly_amount_cents: number;
    setup_fee_cents: number;
    next_invoice_date: string | null;
    project_id: string | null;
  } | null;
  invoice_count: number;
};

export const listSalesPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => OrgSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: leads, error } = await context.supabase
      .from("leads")
      .select(
        `
        id,name,company,email,phone,stage,source,created_at,potential_monthly_value,converted_client_id
        `,
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const leadIds = (leads ?? []).map((lead) => lead.id);

    const [{ data: requirementsRows, error: reqError }, { data: quoteRows, error: quoteError }] =
      leadIds.length > 0
        ? await Promise.all([
            context.supabase
              .from("client_requirements")
              .select("id,lead_id,scope,one_time_cents,recurring_cents,notes")
              .eq("organization_id", data.organizationId)
              .in("lead_id", leadIds),
            context.supabase
              .from("quotes")
              .select("id,lead_id,title,status,total_amount,signed_at,public_token,sent_at,paid_at,created_at")
              .eq("organization_id", data.organizationId)
              .in("lead_id", leadIds),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
          ];

    if (reqError) throw new Error(reqError.message);
    if (quoteError) throw new Error(quoteError.message);

    const requirementsByLeadId = new Map(
      (requirementsRows ?? []).map((req) => [req.lead_id, req]),
    );
    const quotesByLeadId = new Map<string, Array<{
      id: string;
      lead_id: string | null;
      title: string;
      status: string;
      total_amount: number;
      signed_at: string | null;
      public_token: string;
      sent_at: string | null;
      paid_at: string | null;
      created_at: string;
    }>>();
    for (const quote of quoteRows ?? []) {
      if (!quote.lead_id) continue;
      const existing = quotesByLeadId.get(quote.lead_id) ?? [];
      existing.push(quote);
      quotesByLeadId.set(quote.lead_id, existing);
    }

    const results: PipelineLead[] = [];
    for (const l of leads ?? []) {
      const req = requirementsByLeadId.get(l.id) ?? null;
      const quotesArr = quotesByLeadId.get(l.id) ?? [];
      const quote = quotesArr
        .slice()
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0] ?? null;

      let contract: PipelineLead["contract"] = null;
      let invoiceCount = 0;
      if (l.converted_client_id) {
        const [{ data: c }, { count }] = await Promise.all([
          context.supabase
            .from("contracts")
            .select("id,status,monthly_amount_cents,setup_fee_cents,next_invoice_date,project_id")
            .eq("client_id", l.converted_client_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          context.supabase
            .from("invoices")
            .select("id", { count: "exact", head: true })
            .eq("client_id", l.converted_client_id),
        ]);
        contract = c ?? null;
        invoiceCount = count ?? 0;
      }

      results.push({
        id: l.id,
        name: l.name,
        company: l.company,
        email: l.email,
        phone: l.phone,
        stage: l.stage,
        source: l.source,
        created_at: l.created_at,
        potential_monthly_value: Number(l.potential_monthly_value ?? 0),
        converted_client_id: l.converted_client_id,
        requirements: req
          ? {
              id: req.id,
              scope: req.scope ?? "",
              one_time_cents: Number(req.one_time_cents ?? 0),
              recurring_cents: Number(req.recurring_cents ?? 0),
              notes: req.notes,
            }
          : null,
        quote: quote
          ? {
              id: quote.id,
              title: quote.title,
              status: quote.status,
              total_amount: Number(quote.total_amount ?? 0),
              signed_at: quote.signed_at,
              public_token: quote.public_token,
              sent_at: quote.sent_at,
              paid_at: quote.paid_at,
            }
          : null,
        contract,
        invoice_count: invoiceCount,
      });
    }
    return results;
  });

export const getRequirementsForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => LeadIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("client_requirements")
      .select("*")
      .eq("lead_id", data.leadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const upsertRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RequirementsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      lead_id: data.leadId,
      organization_id: data.organizationId,
      scope: data.scope,
      one_time_cents: data.oneTimeCents,
      recurring_cents: data.recurringCents,
      currency: data.currency,
      notes: data.notes ?? null,
      created_by: context.userId,
    };
    const { data: row, error } = await context.supabase
      .from("client_requirements")
      .upsert(payload as never, { onConflict: "lead_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const AI_PROMPT = `Je bent een offerte-assistent. Uit de gegeven lead-informatie destilleer je een compacte klantwensen-samenvatting voor een Nederlandse offerte.

Antwoord UITSLUITEND met geldig JSON in dit formaat (geen markdown, geen uitleg):
{
  "scope": string,              // bullet-list als één string met \\n als scheiding, max 8 bullets, begin elke regel met "- "
  "one_time_eur": number,       // geschatte eenmalige implementatiekosten in hele euro's, 0 als onbekend
  "recurring_eur": number,      // geschat maandbedrag in hele euro's, 0 als onbekend
  "notes": string | null        // 1-2 zinnen samenvatting
}

Wees realistisch en gebruik alleen wat expliciet blijkt uit de tekst. Bij twijfel: 0.`;

export const aiDraftRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => LeadIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is niet geconfigureerd (LOVABLE_API_KEY ontbreekt).");

    const { data: lead, error } = await context.supabase
      .from("leads")
      .select("name,company,email,notes,potential_monthly_value,source")
      .eq("id", data.leadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Lead niet gevonden");

    const text = [
      lead.company ? `Bedrijf: ${lead.company}` : null,
      lead.name ? `Contact: ${lead.name}` : null,
      lead.email ? `Email: ${lead.email}` : null,
      lead.source ? `Bron: ${lead.source}` : null,
      lead.potential_monthly_value
        ? `Geschatte maandwaarde (indicatief): €${lead.potential_monthly_value}`
        : null,
      lead.notes ? `Aanvraag/notities:\n${lead.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: AI_PROMPT },
          { role: "user", content: text.slice(0, 8000) || "(geen leadinformatie beschikbaar)" },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) throw new Error("AI is druk, probeer het zo opnieuw.");
    if (res.status === 402) throw new Error("AI-credits op.");
    if (!res.ok) throw new Error(`AI-fout: ${res.status}`);

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          parsed = {};
        }
      }
    }
    const scope = typeof parsed.scope === "string" ? parsed.scope : "";
    const oneTime = Number(parsed.one_time_eur ?? 0);
    const recurring = Number(parsed.recurring_eur ?? 0);
    const notes = typeof parsed.notes === "string" ? parsed.notes : null;
    return {
      scope,
      oneTimeCents: Math.max(0, Math.round(oneTime * 100)),
      recurringCents: Math.max(0, Math.round(recurring * 100)),
      notes,
    };
  });

export const generateQuoteFromRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => GenerateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: req, error: reqErr } = await context.supabase
      .from("client_requirements")
      .select("*")
      .eq("lead_id", data.leadId)
      .maybeSingle();
    if (reqErr) throw new Error(reqErr.message);
    if (!req) throw new Error("Vul eerst de klantwensen in.");

    const { data: lead, error: leadErr } = await context.supabase
      .from("leads")
      .select("id,name,company,email,organization_id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) throw new Error("Lead niet gevonden");

    const oneTime = Number(req.one_time_cents ?? 0);
    const monthly = Number(req.recurring_cents ?? 0);

    type Line = {
      description: string;
      quantity: number;
      unit_price_cents: number;
      vat_rate: number;
      subtotal_cents: number;
      vat_cents: number;
      total_cents: number;
    };
    const lines: Line[] = [];
    if (oneTime > 0) {
      const vat = Math.round((oneTime * 21) / 100);
      lines.push({
        description: "Eenmalige implementatiekosten",
        quantity: 1,
        unit_price_cents: oneTime,
        vat_rate: 21,
        subtotal_cents: oneTime,
        vat_cents: vat,
        total_cents: oneTime + vat,
      });
    }
    if (monthly > 0) {
      const vat = Math.round((monthly * 21) / 100);
      lines.push({
        description: "Maandelijks abonnement (per maand)",
        quantity: 1,
        unit_price_cents: monthly,
        vat_rate: 21,
        subtotal_cents: monthly,
        vat_cents: vat,
        total_cents: monthly + vat,
      });
    }

    const totalOneTime = oneTime + Math.round((oneTime * 21) / 100);
    const title = `Offerte — ${lead.company ?? lead.name}`;

    const { data: q, error: qErr } = await context.supabase
      .from("quotes")
      .insert({
        organization_id: data.organizationId,
        lead_id: lead.id,
        title,
        content_json: {
          lines,
          scope: req.scope ?? "",
          recurring_cents: monthly,
          one_time_cents: oneTime,
          notes: req.notes ?? null,
        } as never,
        total_amount: (totalOneTime / 100),
        client_email: lead.email,
        status: "draft",
      } as never)
      .select("id,public_token")
      .single();
    if (qErr) throw new Error(qErr.message);

    return { quoteId: q.id, publicToken: q.public_token };
  });
