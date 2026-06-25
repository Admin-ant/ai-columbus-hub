import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertOrgAccess(userId: string, organizationId: string) {
  const sb = await loadAdmin();
  const { data, error } = await sb
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Geen toegang tot organisatie");
}

export const nextInvoiceNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ org_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgAccess(context.userId, data.org_id);
    const sb = await loadAdmin();
    const { data: num, error } = await (sb.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: string | null; error: { message: string } | null }>)(
      "next_invoice_number",
      { _org_id: data.org_id },
    );
    if (error) throw new Error(error.message);
    return { number: num };
  });

export const postInvoiceJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await loadAdmin();
    const { data: inv, error: e0 } = await sb
      .from("invoices")
      .select("organization_id")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (e0) throw new Error(e0.message);
    if (!inv) throw new Error("Factuur niet gevonden");
    await assertOrgAccess(context.userId, inv.organization_id);
    const { error } = await sb.rpc("post_invoice_journal" as never, {
      _invoice_id: data.invoice_id,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const postExpenseJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        expense_id: z.string().uuid(),
        counter_code: z.string().min(1).max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = await loadAdmin();
    const { data: exp, error: e0 } = await sb
      .from("expenses")
      .select("organization_id")
      .eq("id", data.expense_id)
      .maybeSingle();
    if (e0) throw new Error(e0.message);
    if (!exp) throw new Error("Uitgave niet gevonden");
    await assertOrgAccess(context.userId, exp.organization_id);
    const { error } = await (sb.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>)(
      "post_expense_journal",
      { _expense_id: data.expense_id, _counter_code: data.counter_code ?? null },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reverseExpenseJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        expense_id: z.string().uuid(),
        reason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = await loadAdmin();
    const { data: exp, error: e0 } = await sb
      .from("expenses")
      .select("organization_id")
      .eq("id", data.expense_id)
      .maybeSingle();
    if (e0) throw new Error(e0.message);
    if (!exp) throw new Error("Uitgave niet gevonden");
    await assertOrgAccess(context.userId, exp.organization_id);
    const { error } = await sb.rpc("reverse_expense_journal" as never, {
      _expense_id: data.expense_id,
      _reason: data.reason ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
