import { createFileRoute } from "@tanstack/react-router";

function esc(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

type Pref = {
  user_id: string;
  organization_id: string;
  email_enabled: boolean;
  categories: string[] | null;
  email_frequency: string | null;
  last_digest_sent_at: string | null;
};

type Announcement = {
  id: string;
  title: string;
  body: string;
  category: string;
  created_at: string;
};

const WINDOW_MS = { daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 };

async function runDigest(frequency: "daily" | "weekly" | "all") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = Date.now();

  const query = supabaseAdmin
    .from("notification_preferences")
    .select("user_id, organization_id, email_enabled, categories, email_frequency, last_digest_sent_at")
    .eq("email_enabled", true);
  const { data, error } =
    frequency === "all"
      ? await query.in("email_frequency", ["daily", "weekly"])
      : await query.eq("email_frequency", frequency);
  if (error) throw new Error(error.message);

  const prefs = ((data ?? []) as Pref[]).filter((p) => {
    const freq = (p.email_frequency ?? "direct") as keyof typeof WINDOW_MS;
    if (!WINDOW_MS[freq]) return false;
    if (!p.last_digest_sent_at) return true;
    return now - new Date(p.last_digest_sent_at).getTime() >= WINDOW_MS[freq] - 5 * 60 * 1000;
  });
  if (!prefs.length) return { sent: 0, considered: 0 };

  const key = process.env.RESEND_API_KEY;
  const fromEmail = process.env.OUTREACH_FROM_EMAIL || "onboarding@resend.dev";

  const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map(
    (list.data?.users ?? []).filter((u) => u.email).map((u) => [u.id, u.email as string]),
  );

  let sent = 0;
  for (const p of prefs) {
    const freq = (p.email_frequency ?? "daily") as keyof typeof WINDOW_MS;
    const since = new Date(p.last_digest_sent_at ?? new Date(now - WINDOW_MS[freq]).toISOString());

    const { data: rows } = await supabaseAdmin
      .from("announcements")
      .select("id, title, body, category, created_at")
      .eq("organization_id", p.organization_id)
      .gt("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    const cats = p.categories ?? [];
    const items = ((rows ?? []) as Announcement[]).filter((a) => cats.includes(a.category));
    if (!items.length) {
      await supabaseAdmin
        .from("notification_preferences")
        .update({ last_digest_sent_at: new Date(now).toISOString() } as never)
        .eq("user_id", p.user_id)
        .eq("organization_id", p.organization_id);
      continue;
    }

    const to = emailById.get(p.user_id);
    if (!to || !key) continue;

    const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">
      <h2 style="margin:0 0 12px">${items.length} nieuwe mededeling(en)</h2>
      ${items
        .map(
          (a) => `<div style="border-top:1px solid #e2e8f0;padding:12px 0">
            <p style="margin:0 0 2px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b">${esc(a.category)} · ${new Date(a.created_at).toLocaleDateString("nl-NL")}</p>
            <p style="margin:0 0 6px;font-weight:600">${esc(a.title)}</p>
            <div style="white-space:pre-wrap;color:#334155">${esc(a.body)}</div>
          </div>`,
        )
        .join("")}
      <p style="margin-top:24px;font-size:12px;color:#64748b">Je ontvangt deze ${freq === "daily" ? "dagelijkse" : "wekelijkse"} samenvatting op basis van je meldingsvoorkeuren in het portaal.</p>
    </div>`;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          from: `AI van Columbus <${fromEmail}>`,
          to: [to],
          subject: `[Mededelingen] ${freq === "daily" ? "Dagelijkse" : "Wekelijkse"} samenvatting — ${items.length} bericht(en)`,
          html,
        }),
      });
      if (res.ok) {
        sent += 1;
        await supabaseAdmin
          .from("notification_preferences")
          .update({ last_digest_sent_at: new Date(now).toISOString() } as never)
          .eq("user_id", p.user_id)
          .eq("organization_id", p.organization_id);
      }
    } catch (e) {
      console.warn("[announcement-digest] mail mislukt", e);
    }
  }

  return { sent, considered: prefs.length };
}

function checkAuth(request: Request): Response | null {
  const anonKey = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? process.env['SUPABASE_ANON_KEY'];
  const cronSecret = process.env['CRON_SECRET'];
  const apikey = request.headers.get("apikey");
  const secret = request.headers.get("x-cron-secret");
  if (anonKey && apikey === anonKey) return null;
  if (cronSecret && secret === cronSecret) return null;
  return new Response("Unauthorized", { status: 401 });
}

function parseFreq(request: Request): "daily" | "weekly" | "all" {
  const f = new URL(request.url).searchParams.get("frequency");
  return f === "daily" || f === "weekly" ? f : "all";
}

export const Route = createFileRoute("/api/public/hooks/announcement-digest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const unauth = checkAuth(request);
        if (unauth) return unauth;
        return Response.json(await runDigest(parseFreq(request)));
      },
      POST: async ({ request }) => {
        const unauth = checkAuth(request);
        if (unauth) return unauth;
        return Response.json(await runDigest(parseFreq(request)));
      },
    },
  },
});
