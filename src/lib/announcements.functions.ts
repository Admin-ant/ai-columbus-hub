import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ANNOUNCEMENT_CATEGORIES = ["algemeen", "update", "urgent"] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

const SCHEMA = z.object({
  organization_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  body: z.string().max(20000).default(""),
  category: z.enum(ANNOUNCEMENT_CATEGORIES).default("algemeen"),
  pinned: z.boolean().default(false),
  notify: z.boolean().default(true),
});

function esc(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export const createAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("announcements")
      .insert({
        organization_id: data.organization_id,
        title: data.title,
        body: data.body,
        category: data.category,
        pinned: data.pinned,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Opslaan mislukt");
    const id = (row as { id: string }).id;

    if (!data.notify) return { id, notified: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: members } = await supabaseAdmin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", data.organization_id);
    const memberIds = (members ?? [])
      .map((m) => (m as { user_id: string }).user_id)
      .filter((uid) => uid && uid !== context.userId);
    if (!memberIds.length) return { id, notified: 0 };

    const { data: prefs } = await supabaseAdmin
      .from("notification_preferences")
      .select("user_id, email_enabled, categories, email_frequency")
      .eq("organization_id", data.organization_id);
    const prefByUser = new Map(
      (prefs ?? []).map((p) => [
        (p as { user_id: string }).user_id,
        p as unknown as {
          email_enabled: boolean;
          categories: string[];
          email_frequency: string | null;
        },
      ]),
    );

    const wanted = memberIds.filter((uid) => {
      const p = prefByUser.get(uid);
      if (!p) return true; // default: direct aan
      if ((p.email_frequency ?? "direct") !== "direct") return false; // digest volgt later
      return p.email_enabled && (p.categories ?? []).includes(data.category);
    });
    if (!wanted.length) return { id, notified: 0 };

    const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emails = (list.data?.users ?? [])
      .filter((u) => wanted.includes(u.id) && u.email)
      .map((u) => u.email as string);
    if (!emails.length) return { id, notified: 0 };

    const key = process.env.RESEND_API_KEY;
    if (!key) {
      console.warn("[createAnnouncement] RESEND_API_KEY ontbreekt — mail overgeslagen");
      return { id, notified: 0, warning: "E-mailmeldingen zijn niet verstuurd (mailsleutel ontbreekt)." };
    }
    const fromEmail = process.env.OUTREACH_FROM_EMAIL || "onboarding@resend.dev";
    const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">
      <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b">${esc(data.category)}</p>
      <h2 style="margin:0 0 12px">${esc(data.title)}</h2>
      <div style="white-space:pre-wrap">${esc(data.body)}</div>
      <p style="margin-top:24px;font-size:12px;color:#64748b">Je ontvangt deze melding omdat e-mailmeldingen voor deze categorie aanstaan. Je past dit aan in het portaal onder Mededelingen.</p>
    </div>`;

    let notified = 0;
    for (const to of emails) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({
            from: `AI van Columbus <${fromEmail}>`,
            to: [to],
            subject: `[Mededeling] ${data.title}`,
            html,
          }),
        });
        if (res.ok) notified += 1;
      } catch (e) {
        console.warn("[createAnnouncement] mail mislukt", e);
      }
    }

    return { id, notified };
  });
