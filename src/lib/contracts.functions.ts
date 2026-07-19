import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertOrgAccess(context: { supabase: any; userId: string }, orgId: string) {
  const { data, error } = await context.supabase
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", orgId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Geen toegang tot deze organisatie");
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: alleen admins");
}

export const listContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ organizationId: z.string().uuid(), status: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("contracts")
      .select(
        "id, title, status, billing_frequency, start_date, end_date, monthly_amount_cents, setup_fee_cents, next_invoice_date, last_invoiced_at, auto_invoice, client_id, project_id, created_at",
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status as never);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const clientIds = Array.from(new Set((rows ?? []).map((r: any) => r.client_id).filter(Boolean)));
    let clientsById = new Map<string, string>();
    if (clientIds.length) {
      const { data: cs } = await context.supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds);
      clientsById = new Map((cs ?? []).map((c: any) => [c.id as string, c.name as string]));
    }
    return (rows ?? []).map((r: any) => ({ ...r, client_name: clientsById.get(r.client_id) ?? "—" }));
  });

export const getContract = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: c, error } = await context.supabase
      .from("contracts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) throw new Error("Contract niet gevonden");
    const [{ data: lines }, { data: runs }, { data: client }] = await Promise.all([
      context.supabase
        .from("contract_lines")
        .select("*")
        .eq("contract_id", data.id)
        .order("position", { ascending: true }),
      context.supabase
        .from("recurring_invoice_runs")
        .select("*")
        .eq("contract_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("clients")
        .select("id, name, email, contact_person")
        .eq("id", (c as any).client_id)
        .maybeSingle(),
    ]);
    return { contract: c, lines: lines ?? [], runs: runs ?? [], client };
  });

const createSchema = z.object({
  organizationId: z.string().uuid(),
  clientId: z.string().uuid(),
  title: z.string().min(1).max(200),
  monthlyCents: z.number().int().min(0),
  setupCents: z.number().int().min(0).default(0),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  billingFrequency: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
  paymentTermsDays: z.number().int().min(0).max(120).default(14),
  autoInvoice: z.boolean().default(true),
  asDraft: z.boolean().default(false),
});

export const createContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgAccess(context, data.organizationId);
    const { data: c, error } = await context.supabase
      .from("contracts")
      .insert({
        organization_id: data.organizationId,
        client_id: data.clientId,
        title: data.title,
        monthly_amount_cents: data.monthlyCents,
        setup_fee_cents: data.setupCents,
        start_date: data.startDate,
        billing_frequency: data.billingFrequency,
        payment_terms_days: data.paymentTermsDays,
        auto_invoice: data.autoInvoice,
        status: "active",
        next_invoice_date: data.startDate,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const contractId = (c as any).id as string;
    if (data.monthlyCents > 0) {
      await context.supabase.from("contract_lines").insert({
        contract_id: contractId,
        description: `${data.title} — maandelijks abonnement`,
        quantity: 1,
        unit_price_cents: data.monthlyCents,
        vat_rate: 21,
        position: 0,
      } as never);
    }
    if (data.setupCents > 0) {
      await context.supabase.from("contract_lines").insert({
        contract_id: contractId,
        description: "Eenmalige implementatiekosten",
        quantity: 1,
        unit_price_cents: data.setupCents,
        vat_rate: 21,
        position: 1,
      } as never);
    }
    return { id: contractId };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    title: z.string().min(1).max(200).optional(),
    status: z.enum(["draft", "active", "paused", "cancelled", "ended"]).optional(),
    billing_frequency: z.enum(["monthly", "quarterly", "yearly"]).optional(),
    monthly_amount_cents: z.number().int().min(0).optional(),
    setup_fee_cents: z.number().int().min(0).optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    next_invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    payment_terms_days: z.number().int().min(0).max(120).optional(),
    auto_invoice: z.boolean().optional(),
    notes: z.string().max(2000).nullable().optional(),
    payment_link_enabled: z.boolean().optional(),
    payment_link_url: z.string().trim().max(500).url("Ongeldige URL").nullable().optional().or(z.literal("").transform(() => null)),
  }),
});

export const updateContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contracts")
      .update(data.patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const lineSchema = z.object({
  contractId: z.string().uuid(),
  description: z.string().min(1).max(300),
  quantity: z.number().min(0),
  unitPriceCents: z.number().int().min(0),
  vatRate: z.number().min(0).max(30).default(21),
});

export const addContractLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => lineSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("contract_lines")
      .select("position")
      .eq("contract_id", data.contractId)
      .order("position", { ascending: false })
      .limit(1);
    const nextPos = ((existing?.[0]?.position as number | undefined) ?? -1) + 1;
    const { error } = await context.supabase.from("contract_lines").insert({
      contract_id: data.contractId,
      description: data.description,
      quantity: data.quantity,
      unit_price_cents: data.unitPriceCents,
      vat_rate: data.vatRate,
      position: nextPos,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteContractLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("contract_lines").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateInvoiceNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ contractId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Ensure caller can see the contract (RLS)
    const { data: c, error: cErr } = await context.supabase
      .from("contracts")
      .select("id, next_invoice_date, status, auto_invoice")
      .eq("id", data.contractId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!c) throw new Error("Contract niet gevonden");

    const status = (c as any).status as string;
    if (status !== "active") {
      throw new Error(
        `Contract is ${status} — activeer het contract eerst voordat je handmatig een factuur genereert.`,
      );
    }
    if (!(c as any).auto_invoice) {
      throw new Error("Automatische facturatie staat uit voor dit contract — zet dit eerst aan.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // If next_invoice_date is in the future, temporarily pull it forward
    // so the shared generator picks this contract up. Restore afterwards.
    const today = new Date().toISOString().slice(0, 10);
    const originalNext = (c as any).next_invoice_date as string | null;
    const pulledForward = !originalNext || originalNext > today;
    if (pulledForward) {
      await supabaseAdmin
        .from("contracts")
        .update({ next_invoice_date: today } as never)
        .eq("id", data.contractId);
    }

    const { data: result, error } = await supabaseAdmin.rpc("generate_recurring_invoices", {
      _only_contract_id: data.contractId,
    });

    // If the generator did not advance next_invoice_date (e.g. it errored),
    // restore the original date so we don't leave the contract in a pulled-forward state.
    if (pulledForward) {
      const { data: after } = await supabaseAdmin
        .from("contracts")
        .select("next_invoice_date")
        .eq("id", data.contractId)
        .maybeSingle();
      if ((after as any)?.next_invoice_date === today) {
        await supabaseAdmin
          .from("contracts")
          .update({ next_invoice_date: originalNext } as never)
          .eq("id", data.contractId);
      }
    }

    if (error) throw new Error(error.message);
    const first = Array.isArray(result) ? result[0] : result;
    return { ok: true, invoiceId: first?.invoice_id ?? null, status: first?.status ?? "no-op" };
  });

export const runRecurringInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("generate_recurring_invoices", {} as never);
    if (error) throw new Error(error.message);
    const rows = (Array.isArray(data) ? data : []) as Array<{
      contract_id: string;
      invoice_id: string | null;
      status: string;
      error: string | null;
    }>;
    return {
      ok: true,
      generated: rows.filter((r) => r.status === "ok").length,
      failed: rows.filter((r) => r.status === "error").length,
      rows,
    };
  });
