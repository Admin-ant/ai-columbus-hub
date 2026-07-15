import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CampaignFlowLead = {
  id: string;
  name: string;
  company: string;
  email: string;
  website: string;
  email_preview: string | null;
  tracking_link_id: string | null;
  tracking_token: string | null;
  email_sent_at: string | null;
  clicked_at: string | null;
  stage: number;
  closed_at: string | null;
  created_at: string;
};

export type CampaignTaskStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "failed"
  | "cancelled";

export type CampaignFlowTask = {
  id: string;
  lead_id: string | null;
  action: "call" | "followup";
  reason: string;
  done: boolean;
  done_at: string | null;
  created_at: string;
  status: CampaignTaskStatus;
  result: string | null;
  error: string | null;
  started_at: string | null;
  lead_name?: string | null;
  company?: string | null;
};

export type CampaignTaskEvent = {
  id: string;
  task_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  message: string | null;
  created_at: string;
};

export const listCampaignLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CampaignFlowLead[]> => {
    const { data, error } = await context.supabase
      .from("campaign_flow_leads")
      .select(
        "id, name, company, email, website, email_preview, tracking_link_id, tracking_token, email_sent_at, clicked_at, stage, closed_at, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as CampaignFlowLead[];
  });

export const createCampaignLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      company: string;
      email: string;
      website: string;
      emailPreview?: string;
      trackingLinkId?: string;
      trackingToken?: string;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<CampaignFlowLead> => {
    const now = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("campaign_flow_leads")
      .insert({
        user_id: context.userId,
        name: data.name,
        company: data.company,
        email: data.email,
        website: data.website,
        email_preview: data.emailPreview ?? null,
        tracking_link_id: data.trackingLinkId ?? null,
        tracking_token: data.trackingToken ?? null,
        email_sent_at: now,
        stage: 2,
      })
      .select(
        "id, name, company, email, website, email_preview, tracking_link_id, tracking_token, email_sent_at, clicked_at, stage, closed_at, created_at",
      )
      .single();
    if (error) throw new Error(error.message);
    return row as CampaignFlowLead;
  });

export const deleteCampaignLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("campaign_flow_leads")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCampaignTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CampaignFlowTask[]> => {
    const { data, error } = await context.supabase
      .from("campaign_flow_tasks")
      .select(
        "id, lead_id, action, reason, done, done_at, created_at, lead:lead_id(name, company)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      lead_id: r.lead_id,
      action: r.action,
      reason: r.reason,
      done: r.done,
      done_at: r.done_at,
      created_at: r.created_at,
      lead_name: r.lead?.name ?? null,
      company: r.lead?.company ?? null,
    }));
  });

export const toggleCampaignTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; done: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("campaign_flow_tasks")
      .update({ done: data.done, done_at: data.done ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCampaignTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("campaign_flow_tasks")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
