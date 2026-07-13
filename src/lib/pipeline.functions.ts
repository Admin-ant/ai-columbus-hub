import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const winSchema = z.object({
  leadId: z.string().uuid(),
  monthlyCents: z.number().int().min(0),
  setupCents: z.number().int().min(0).default(0),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1).max(200),
});

export const winLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => winSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Verify caller has access to the lead's org
    const { data: lead, error: leadErr } = await context.supabase
      .from("leads")
      .select("id, organization_id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) throw new Error("Lead niet gevonden of geen toegang");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rpcData, error } = await supabaseAdmin.rpc("convert_lead_to_customer", {
      _lead_id: data.leadId,
      _monthly_cents: data.monthlyCents,
      _setup_cents: data.setupCents,
      _start_date: data.startDate,
      _title: data.title,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    return {
      clientId: row?.out_client_id as string,
      projectId: row?.out_project_id as string,
      contractId: row?.out_contract_id as string,
    };
  });

export const createCustomerFromLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => winSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: lead, error: leadErr } = await context.supabase
      .from("leads")
      .select("id, organization_id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) throw new Error("Lead niet gevonden of geen toegang");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rpcData, error } = await supabaseAdmin.rpc("create_customer_from_lead", {
      _lead_id: data.leadId,
      _monthly_cents: data.monthlyCents,
      _setup_cents: data.setupCents,
      _start_date: data.startDate,
      _title: data.title,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    return {
      clientId: row?.out_client_id as string,
      projectId: row?.out_project_id as string,
      contractId: row?.out_contract_id as string,
    };
  });

const loseSchema = z.object({
  leadId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export const loseLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => loseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ stage: "verloren", lost_reason: data.reason ?? null } as never)
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
