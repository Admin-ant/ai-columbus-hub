import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";

export const Route = createFileRoute("/api/public/l/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const token = params.token;

        const { data: link } = await supabaseAdmin
          .from("campaign_tracking_links")
          .select("id, destination_url, click_count, first_visited_at")
          .eq("token", token)
          .maybeSingle();

        if (!link) {
          return new Response("Link niet gevonden", { status: 404 });
        }

        const now = new Date().toISOString();
        const ua = request.headers.get("user-agent") ?? null;
        const referer = request.headers.get("referer") ?? null;
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          null;
        const ipHash = ip
          ? createHash("sha256").update(ip).digest("hex").slice(0, 32)
          : null;

        await supabaseAdmin.from("campaign_link_visits").insert({
          link_id: link.id,
          user_agent: ua,
          referer,
          ip_hash: ipHash,
        });

        await supabaseAdmin
          .from("campaign_tracking_links")
          .update({
            click_count: (link.click_count ?? 0) + 1,
            first_visited_at: link.first_visited_at ?? now,
            last_visited_at: now,
          })
          .eq("id", link.id);

        return new Response(null, {
          status: 302,
          headers: {
            Location: link.destination_url,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
