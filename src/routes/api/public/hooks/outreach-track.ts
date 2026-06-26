import { createFileRoute } from "@tanstack/react-router";
import { verifyTrackingId } from "@/lib/outreach-tracking";

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export const Route = createFileRoute("/api/public/hooks/outreach-track")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get("t");
        const id = url.searchParams.get("id");
        const sig = url.searchParams.get("sig");
        const target = url.searchParams.get("u");

        const secret = process.env.CRON_SECRET;
        if (!secret || !id || !sig || (type !== "open" && type !== "click")) {
          // Fail open for pixel, fail closed for click
          if (type === "click") return new Response("Bad request", { status: 400 });
          return new Response(PIXEL, {
            headers: {
              "content-type": "image/gif",
              "cache-control": "no-store, no-cache, must-revalidate",
            },
          });
        }

        const ok = verifyTrackingId(id, sig, secret);
        if (ok) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const patch =
              type === "open"
                ? { opened_at: new Date().toISOString() }
                : { clicked_at: new Date().toISOString(), opened_at: new Date().toISOString() };
            // Only set if not already set (idempotent for first event)
            await supabaseAdmin
              .from("outreach_messages")
              .update(patch as never)
              .eq("id", id)
              .is(type === "open" ? "opened_at" : "clicked_at", null);
          } catch {
            // best-effort
          }
        }

        if (type === "click") {
          if (!target || !/^https?:\/\//i.test(target)) {
            return new Response("Bad target", { status: 400 });
          }
          return new Response(null, { status: 302, headers: { location: target } });
        }

        return new Response(PIXEL, {
          headers: {
            "content-type": "image/gif",
            "cache-control": "no-store, no-cache, must-revalidate",
          },
        });
      },
    },
  },
});
