import { createFileRoute } from "@tanstack/react-router";

/**
 * Smart follow-up hook. Vindt offertes die:
 *  - bekeken zijn (last_viewed_at) maar nog niet geaccepteerd,
 *  - sinds de laatste view > 3 dagen geleden,
 *  - en waarbij in de afgelopen 4 dagen geen follow-up is verstuurd.
 *
 * Markeert ze als "follow-up verstuurd" en logt een event. De daadwerkelijke
 * mail-verzending komt in Sprint 3 (Outreach Pro) waar Resend gekoppeld wordt.
 */
export const Route = createFileRoute("/api/public/hooks/studio-followups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        const secret = request.headers.get("x-cron-secret");
        if (!cronSecret || secret !== cronSecret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");


        const threshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const followupThreshold = new Date(
          Date.now() - 4 * 24 * 60 * 60 * 1000,
        ).toISOString();

        const { data: candidates, error } = await supabaseAdmin
          .from("studio_quotes")
          .select(
            "id, organization_id, title, client_name, last_viewed_at, followup_sent_at, followup_count, public_token, accepted_at",
          )
          .not("public_token", "is", null)
          .is("accepted_at", null)
          .not("last_viewed_at", "is", null)
          .lte("last_viewed_at", threshold);

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        let updated = 0;
        for (const q of candidates ?? []) {
          if (q.followup_sent_at && q.followup_sent_at > followupThreshold) continue;
          if ((q.followup_count ?? 0) >= 3) continue;

          await supabaseAdmin
            .from("studio_quotes")
            .update({
              followup_sent_at: new Date().toISOString(),
              followup_count: (q.followup_count ?? 0) + 1,
            })
            .eq("id", q.id);

          await supabaseAdmin.from("studio_quote_events").insert({
            quote_id: q.id,
            organization_id: q.organization_id,
            event_type: "followup_queued",
            metadata: { count: (q.followup_count ?? 0) + 1, channel: "email" },
          });

          updated++;
        }

        return new Response(
          JSON.stringify({ ok: true, candidates: candidates?.length ?? 0, updated }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
