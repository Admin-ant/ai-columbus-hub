import { createFileRoute } from "@tanstack/react-router";

const FOLLOWUP_DAYS = 3;

async function runTick() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date();
  const cutoff = new Date(now.getTime() - FOLLOWUP_DAYS * 24 * 60 * 60 * 1000);

  // 1. Fetch open leads (not yet closed) with their tracking-link click count
  const { data: leads, error } = await supabaseAdmin
    .from("campaign_flow_leads")
    .select(
      "id, user_id, name, company, email_sent_at, clicked_at, stage, tracking_link_id, closed_at",
    )
    .is("closed_at", null)
    .limit(500);
  if (error) throw new Error(error.message);

  let callTasksCreated = 0;
  let followupTasksCreated = 0;
  let leadsUpdated = 0;

  for (const lead of leads ?? []) {
    let clickCount = 0;
    let lastVisited: string | null = null;
    if (lead.tracking_link_id) {
      const { data: link } = await supabaseAdmin
        .from("campaign_tracking_links")
        .select("click_count, last_visited_at")
        .eq("id", lead.tracking_link_id)
        .maybeSingle();
      clickCount = link?.click_count ?? 0;
      lastVisited = link?.last_visited_at ?? null;
    }

    // A) Bel-taak wanneer er een klik is en er nog geen bel-taak bestaat
    if (clickCount > 0) {
      if (!lead.clicked_at) {
        await supabaseAdmin
          .from("campaign_flow_leads")
          .update({
            clicked_at: lastVisited ?? now.toISOString(),
            stage: 4,
          })
          .eq("id", lead.id);
        leadsUpdated++;
      }
      const { data: task, error: taskErr } = await supabaseAdmin
        .from("campaign_flow_tasks")
        .insert({
          user_id: lead.user_id,
          lead_id: lead.id,
          action: "call",
          reason: "Heeft landingspagina bezocht",
        })
        .select("id")
        .maybeSingle();
      if (!taskErr && task) callTasksCreated++;
      continue;
    }

    // B) Opvolg-taak wanneer mail is verstuurd, >3 dagen geleden, geen klik
    if (
      lead.email_sent_at &&
      new Date(lead.email_sent_at) <= cutoff &&
      clickCount === 0
    ) {
      const { data: task, error: taskErr } = await supabaseAdmin
        .from("campaign_flow_tasks")
        .insert({
          user_id: lead.user_id,
          lead_id: lead.id,
          action: "followup",
          reason: `Geen reactie na ${FOLLOWUP_DAYS} dagen`,
        })
        .select("id")
        .maybeSingle();
      if (!taskErr && task) {
        followupTasksCreated++;
        await supabaseAdmin
          .from("campaign_flow_leads")
          .update({ stage: 4 })
          .eq("id", lead.id);
        leadsUpdated++;
      }
    }
  }

  return {
    scanned: leads?.length ?? 0,
    callTasksCreated,
    followupTasksCreated,
    leadsUpdated,
    ranAt: now.toISOString(),
  };
}

export const Route = createFileRoute("/api/public/hooks/campaign-flow-tick")({
  server: {
    handlers: {
      GET: async () => {
        const result = await runTick();
        return Response.json(result);
      },
      POST: async () => {
        const result = await runTick();
        return Response.json(result);
      },
    },
  },
});
