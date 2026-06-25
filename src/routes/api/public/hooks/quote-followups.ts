import { createFileRoute } from "@tanstack/react-router";

interface QuoteRow {
  id: string;
  title: string;
  client_email: string | null;
  notify_email: string | null;
  public_token: string;
  organization_id: string;
  sent_at: string | null;
  last_viewed_at: string | null;
  accepted_at: string | null;
  followup_after_days: number;
  followup_count: number;
  last_followup_at: string | null;
}

async function sendFollowupEmail(opts: {
  to: string;
  orgName: string;
  quoteTitle: string;
  publicUrl: string;
  bekeken: boolean;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.OUTREACH_FROM_EMAIL;
  if (!apiKey || !from) return { skipped: true };
  const subject = opts.bekeken
    ? `Vraagje over onze offerte: ${opts.quoteTitle}`
    : `Heb je onze offerte al kunnen bekijken? ${opts.quoteTitle}`;
  const intro = opts.bekeken
    ? "We zagen dat je onze offerte hebt bekeken. Heb je nog vragen of zullen we 'm samen doorlopen?"
    : "We willen even checken of onze offerte goed is aangekomen. Klik hieronder om 'm te openen.";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject,
      html: `<div style="font-family:Inter,Arial,sans-serif;max-width:560px">
        <h2 style="margin:0 0 12px">Even een korte herinnering</h2>
        <p>${intro}</p>
        <p><a href="${opts.publicUrl}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Bekijk offerte</a></p>
        <p style="color:#888;font-size:12px;margin-top:24px">${opts.orgName}</p>
      </div>`,
    }),
  });
  return { skipped: false, ok: res.ok, status: res.status };
}

export const Route = createFileRoute("/api/public/hooks/quote-followups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
          return new Response("Cron secret not configured", { status: 503 });
        }
        if (request.headers.get("x-cron-secret") !== cronSecret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Pull candidates: sent, not accepted, not revoked, followups enabled,
        // last follow-up older than 1 day or never.
        const { data: quotes, error } = await supabaseAdmin
          .from("quotes")
          .select(
            "id, title, client_email, notify_email, public_token, organization_id, sent_at, last_viewed_at, accepted_at, followup_after_days, followup_count, last_followup_at, revoked_at, followup_enabled",
          )
          .is("accepted_at", null)
          .is("revoked_at", null)
          .eq("followup_enabled", true)
          .not("sent_at", "is", null)
          .lt("followup_count", 3);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        const now = Date.now();
        const base = process.env.APP_URL || process.env.SITE_URL || "https://project--0addc860-2162-4de8-8a00-3906ef74a397.lovable.app";
        let sent = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const q of (quotes as unknown as (QuoteRow & { revoked_at: string | null; followup_enabled: boolean })[]) ?? []) {
          const days = q.followup_after_days ?? 3;
          const reference = q.last_followup_at ?? q.sent_at;
          if (!reference) { skipped++; continue; }
          const ageDays = (now - new Date(reference).getTime()) / 86_400_000;
          if (ageDays < days) { skipped++; continue; }

          const to = q.client_email || q.notify_email;
          if (!to) { skipped++; continue; }

          try {
            const publicUrl = `${base.replace(/\/$/, "")}/accept/quote/${q.public_token}`;
            const { data: org } = await supabaseAdmin
              .from("organizations")
              .select("name")
              .eq("id", q.organization_id)
              .maybeSingle();
            const r = await sendFollowupEmail({
              to,
              orgName: org?.name ?? "",
              quoteTitle: q.title,
              publicUrl,
              bekeken: !!q.last_viewed_at,
            });
            if (r.skipped) { skipped++; continue; }
            if (!r.ok) { errors.push(`${q.id}: HTTP ${r.status}`); continue; }

            await supabaseAdmin
              .from("quotes")
              .update({
                last_followup_at: new Date().toISOString(),
                followup_count: (q.followup_count ?? 0) + 1,
              } as never)
              .eq("id", q.id);

            await supabaseAdmin.from("quote_status_events").insert({
              quote_id: q.id,
              organization_id: q.organization_id,
              event_type: "viewed",
              metadata: { followup: true, to },
            } as never);

            sent++;
          } catch (e) {
            errors.push(`${q.id}: ${(e as Error).message}`);
          }
        }

        return new Response(JSON.stringify({ ok: true, sent, skipped, errors }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
