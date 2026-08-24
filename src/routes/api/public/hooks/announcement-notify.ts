import { createFileRoute } from "@tanstack/react-router";

function esc(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

type Row = {
  id: string;
  organization_id: string;
  title: string;
  body: string;
  category: string;
  created_at: string;
};

/**
 * Verstuurt directe e-mails voor automatisch aangemaakte mededelingen
 * (nieuwe leads, nieuwe klanten, leadstatuswijzigingen) aan collega's die
 * "direct" als frequentie hebben staan. Digest-gebruikers krijgen ze later.
 */
async function runNotify() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const key = process.env["RESEND_API_KEY"];
  const fromEmail = process.env["OUTREACH_FROM_EMAIL"] || "onboarding@resend.dev";

  const { data, error } = await supabaseAdmin
    .from("announcements")
    .select("id, organization_id, title, body, category, created_at")
    .is("emailed_at", null)
    .neq("source", "handmatig")
    .gt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Row[];
  if (!rows.length) return { sent: 0, announcements: 0 };

  const orgIds = [...new Set(rows.map((r) => r.organization_id))];

  const { data: members } = await supabaseAdmin
    .from("organization_members")
    .select("user_id, organization_id")
    .in("organization_id", orgIds);

  const { data: prefs } = await supabaseAdmin
    .from("notification_preferences")
    .select("user_id, organization_id, email_enabled, categories, email_frequency")
    .in("organization_id", orgIds);

  const prefByKey = new Map(
    (prefs ?? []).map((p) => [
      `${(p as { organization_id: string }).organization_id}:${(p as { user_id: string }).user_id}`,
      p as unknown as {
        email_enabled: boolean;
        categories: string[] | null;
        email_frequency: string | null;
      },
    ]),
  );

  const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map(
    (list.data?.users ?? []).filter((u) => u.email).map((u) => [u.id, u.email as string]),
  );

  let sent = 0;

  for (const row of rows) {
    const recipients = (members ?? [])
      .filter((m) => (m as { organization_id: string }).organization_id === row.organization_id)
      .map((m) => (m as { user_id: string }).user_id)
      .filter((uid) => {
        const p = prefByKey.get(`${row.organization_id}:${uid}`);
        if (!p) return true;
        if ((p.email_frequency ?? "direct") !== "direct") return false;
        return p.email_enabled && (p.categories ?? []).includes(row.category);
      })
      .map((uid) => emailById.get(uid))
      .filter((e): e is string => !!e);

    if (key && recipients.length) {
      const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">
        <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b">${esc(row.category)}</p>
        <h2 style="margin:0 0 12px">${esc(row.title)}</h2>
        <div style="white-space:pre-wrap;color:#334155">${esc(row.body)}</div>
      </div>`;
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({
            from: `AI van Columbus <${fromEmail}>`,
            to: recipients,
            subject: `[Mededeling] ${row.title}`,
            html,
          }),
        });
        if (res.ok) sent += recipients.length;
        else console.warn("[announcement-notify] resend fout", res.status, await res.text());
      } catch (e) {
        console.warn("[announcement-notify] mail mislukt", e);
      }
    }

    await supabaseAdmin
      .from("announcements")
      .update({ emailed_at: new Date().toISOString() } as never)
      .eq("id", row.id);
  }

  return { sent, announcements: rows.length };
}

function checkAuth(request: Request): Response | null {
  const anonKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  const cronSecret = process.env["CRON_SECRET"];
  if (anonKey && request.headers.get("apikey") === anonKey) return null;
  if (cronSecret && request.headers.get("x-cron-secret") === cronSecret) return null;
  return new Response("Unauthorized", { status: 401 });
}

export const Route = createFileRoute("/api/public/hooks/announcement-notify")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const unauth = checkAuth(request);
        if (unauth) return unauth;
        return Response.json(await runNotify());
      },
      POST: async ({ request }) => {
        const unauth = checkAuth(request);
        if (unauth) return unauth;
        return Response.json(await runNotify());
      },
    },
  },
});
