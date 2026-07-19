import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/recurring-invoices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Accept either the anon apikey (used by pg_cron in this project)
        // or an explicit x-cron-secret header.
        const cronSecret = process.env.CRON_SECRET;
        const secret = request.headers.get("x-cron-secret");
        if (!cronSecret || secret !== cronSecret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("generate_recurring_invoices", {} as never);
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const rows = (Array.isArray(data) ? data : []) as Array<{
          contract_id: string;
          invoice_id: string | null;
          status: string;
          error: string | null;
        }>;
        const summary = {
          ok: true,
          generated: rows.filter((r) => r.status === "ok").length,
          failed: rows.filter((r) => r.status === "error").length,
          rows,
          at: new Date().toISOString(),
        };
        return new Response(JSON.stringify(summary), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
