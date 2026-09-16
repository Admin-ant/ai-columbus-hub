import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";

/**
 * Publiek klantportaal voor tickets.
 *
 * POST /api/public/hooks/ticket-portal
 *   { action: "ticket", token }                  -> ticket via persoonlijke link
 *   { action: "request_code", org, email }       -> e-mailcode versturen
 *   { action: "verify_code", org, email, code }  -> sessietoken
 *   { action: "list", session }                  -> alle tickets van dat adres
 *   { action: "reply", ticket_id, body, token? , session? }
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const UUID_RE = /^[0-9a-f-]{36}$/i;

const Payload = z.object({
  action: z.enum(["ticket", "request_code", "verify_code", "list", "reply", "new_ticket"]),
  org: z.string().trim().max(200).nullish(),
  email: z.string().trim().email().max(255).nullish(),
  code: z.string().trim().max(12).nullish(),
  token: z.string().trim().max(200).nullish(),
  session: z.string().trim().max(200).nullish(),
  ticket_id: z.string().uuid().nullish(),
  body: z.string().trim().max(10000).nullish(),
  subject: z.string().trim().max(300).nullish(),
  name: z.string().trim().max(200).nullish(),
  phone: z.string().trim().max(50).nullish(),
});

const hits = new Map<string, number[]>();
function rateLimited(key: string, max = 10) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Admin;
}

async function resolveOrg(db: Admin, orgParam: string) {
  const q = db.from("organizations").select("id, name, slug");
  const { data } = UUID_RE.test(orgParam)
    ? await q.eq("id", orgParam).maybeSingle()
    : await q.eq("slug", orgParam).maybeSingle();
  return (data ?? null) as { id: string; name: string; slug: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  nieuw: "Nieuw",
  in_behandeling: "In behandeling",
  wachten_op_klant: "Wachten op jouw reactie",
  opgelost: "Opgelost",
  gesloten: "Gesloten",
};

async function ticketPayload(db: Admin, ticket: Record<string, unknown>) {
  const id = ticket['id'] as string;
  const [{ data: messages }, { data: attachments }] = await Promise.all([
    db
      .from("ticket_messages")
      .select("id, direction, body, author_name, channel, is_internal, created_at")
      .eq("ticket_id", id)
      .eq("is_internal", false)
      .order("created_at", { ascending: true }),
    db
      .from("ticket_attachments")
      .select("id, filename, mime_type, size_bytes, storage_path, created_at")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
  ]);

  const files: { id: string; filename: string; mime: string | null; size: number | null; url: string | null }[] = [];
  for (const a of (attachments ?? []) as Record<string, unknown>[]) {
    const { data: signed } = await db.storage
      .from("ticket-attachments")
      .createSignedUrl(a['storage_path'] as string, 60 * 60);
    files.push({
      id: a['id'] as string,
      filename: a['filename'] as string,
      mime: (a['mime_type'] as string) ?? null,
      size: (a['size_bytes'] as number) ?? null,
      url: signed?.signedUrl ?? null,
    });
  }

  return {
    id,
    ticket_number: ticket['ticket_number'],
    subject: ticket['subject'],
    status: ticket['status'],
    status_label: STATUS_LABEL[String(ticket['status'])] ?? String(ticket['status']),
    priority: ticket['priority'],
    created_at: ticket['created_at'],
    last_message_at: ticket['last_message_at'],
    requester_name: ticket['requester_name'],
    requester_email: ticket['requester_email'],
    portal_token: ticket['portal_token'],
    messages: ((messages ?? []) as Record<string, unknown>[]).map((m) => ({
      id: m['id'],
      direction: m['direction'],
      body: m['body'],
      author_name: m['author_name'],
      channel: m['channel'],
      created_at: m['created_at'],
    })),
    attachments: files,
  };
}

async function sendPortalMail(
  db: Admin,
  organizationId: string,
  orgName: string,
  to: string,
  subject: string,
  html: string,
) {
  const key = process.env['RESEND_API_KEY'];
  const { data: ms } = await db
    .from("mail_settings")
    .select("from_email, from_name, reply_to, ticket_reply_to")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const s = (ms ?? {}) as Record<string, string | null>;
  const fromEmail = s['from_email'] || process.env['OUTREACH_FROM_EMAIL'] || "support@resend.dev";
  const replyTo = s['ticket_reply_to'] || s['reply_to'] || fromEmail;
  if (key) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${orgName} Support <${fromEmail}>`,
        to: [to],
        reply_to: replyTo,
        subject,
        html,
      }),
    });
  }
  const { logMailMessage } = await import("@/lib/mail-log.server");
  await logMailMessage({
    organizationId,
    folder: "sent",
    fromEmail,
    fromName: `${orgName} Support`,
    to: [to],
    subject,
    html,
  });
}

export const Route = createFileRoute("/api/public/hooks/ticket-portal")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const parsed = Payload.safeParse(raw);
        if (!parsed.success) return json({ error: "Invalid payload" }, 400);
        const p = parsed.data;
        const ip =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown";

        const db = await admin();
        const origin = new URL(request.url).origin;

        /* ------------------------------------------------ ticket via link */
        if (p.action === "ticket") {
          if (!p.token) return json({ error: "Geen link" }, 400);
          const { data: t } = await db
            .from("tickets")
            .select("*")
            .eq("portal_token", p.token)
            .maybeSingle();
          if (!t) return json({ error: "Niet gevonden" }, 404);
          return json({ ticket: await ticketPayload(db, t as Record<string, unknown>) });
        }

        /* ------------------------------------------------ code aanvragen */
        if (p.action === "request_code") {
          if (!p.org || !p.email) return json({ error: "Onvolledig" }, 400);
          if (rateLimited(`code:${ip}`, 8)) return json({ error: "Te veel aanvragen" }, 429);
          const org = await resolveOrg(db, p.org);
          if (!org) return json({ error: "Niet gevonden" }, 404);

          // Iedereen kan zich zelf aanmelden met zijn e-mailadres; de code
          // bewijst dat het adres van hem is.
          const code = String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, "0");
          await db.from("ticket_portal_sessions").insert({
            organization_id: org.id,
            email: p.email.toLowerCase(),
            code_hash: sha(code),
            code_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          } as never);
          await sendPortalMail(
            db,
            org.id,
            org.name,
            p.email,
            "Inlogcode voor je meldingen",
            `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">
                 <p>Gebruik deze code om je meldingen te bekijken of een nieuwe melding te maken:</p>
                 <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
                 <p>De code is 15 minuten geldig.</p>
               </div>`,
          );
          return json({ ok: true });
        }

        /* ------------------------------------------------ code controleren */
        if (p.action === "verify_code") {
          if (!p.org || !p.email || !p.code) return json({ error: "Onvolledig" }, 400);
          if (rateLimited(`verify:${ip}`, 20)) return json({ error: "Te veel pogingen" }, 429);
          const org = await resolveOrg(db, p.org);
          if (!org) return json({ error: "Niet gevonden" }, 404);
          const { data: row } = await db
            .from("ticket_portal_sessions")
            .select("id, code_hash, code_expires_at")
            .eq("organization_id", org.id)
            .eq("email", p.email.toLowerCase())
            .not("code_hash", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const r = row as { id: string; code_hash: string; code_expires_at: string } | null;
          if (!r || sha(p.code) !== r.code_hash || new Date(r.code_expires_at) < new Date()) {
            return json({ error: "Code klopt niet of is verlopen" }, 401);
          }
          const session = randomBytes(24).toString("hex");
          await db
            .from("ticket_portal_sessions")
            .update({
              code_hash: null,
              session_token: session,
              session_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            } as never)
            .eq("id", r.id);
          return json({ session });
        }

        /* ------------------------------------------------ overzicht */
        if (p.action === "list") {
          if (!p.session) return json({ error: "Niet ingelogd" }, 401);
          const { data: s } = await db
            .from("ticket_portal_sessions")
            .select("organization_id, email, session_expires_at")
            .eq("session_token", p.session)
            .maybeSingle();
          const sess = s as { organization_id: string; email: string; session_expires_at: string } | null;
          if (!sess || new Date(sess.session_expires_at) < new Date()) {
            return json({ error: "Sessie verlopen" }, 401);
          }
          const { data: rows } = await db
            .from("tickets")
            .select(
              "id, ticket_number, subject, status, priority, created_at, last_message_at, portal_token",
            )
            .eq("organization_id", sess.organization_id)
            .ilike("requester_email", sess.email)
            .order("last_message_at", { ascending: false })
            .limit(100);
          return json({
            email: sess.email,
            tickets: ((rows ?? []) as Record<string, unknown>[]).map((t) => ({
              ...t,
              status_label: STATUS_LABEL[String(t['status'])] ?? String(t['status']),
            })),
          });
        }

        /* ------------------------------------------------ reactie */
        if (p.action === "reply") {
          if (!p.ticket_id || !p.body) return json({ error: "Onvolledig" }, 400);
          if (rateLimited(`reply:${ip}`, 30)) return json({ error: "Te veel berichten" }, 429);

          let allowed = false;
          let email: string | null = null;
          if (p.token) {
            const { data: t } = await db
              .from("tickets")
              .select("id, requester_email")
              .eq("portal_token", p.token)
              .maybeSingle();
            const tk = t as { id: string; requester_email: string | null } | null;
            allowed = !!tk && tk.id === p.ticket_id;
            email = tk?.requester_email ?? null;
          } else if (p.session) {
            const { data: s } = await db
              .from("ticket_portal_sessions")
              .select("organization_id, email, session_expires_at")
              .eq("session_token", p.session)
              .maybeSingle();
            const sess = s as { organization_id: string; email: string; session_expires_at: string } | null;
            if (sess && new Date(sess.session_expires_at) >= new Date()) {
              const { data: t } = await db
                .from("tickets")
                .select("id, requester_email")
                .eq("id", p.ticket_id)
                .eq("organization_id", sess.organization_id)
                .ilike("requester_email", sess.email)
                .maybeSingle();
              allowed = !!t;
              email = sess.email;
            }
          }
          if (!allowed) return json({ error: "Geen toegang" }, 403);

          const { data: t } = await db
            .from("tickets")
            .select("id, organization_id, status, requester_name")
            .eq("id", p.ticket_id)
            .maybeSingle();
          const tk = t as {
            id: string;
            organization_id: string;
            status: string;
            requester_name: string | null;
          } | null;
          if (!tk) return json({ error: "Niet gevonden" }, 404);

          await db.from("ticket_messages").insert({
            ticket_id: tk.id,
            organization_id: tk.organization_id,
            direction: "in",
            body: p.body,
            author_name: tk.requester_name || email || "Klant",
            channel: "portaal",
          } as never);

          if (tk.status === "opgelost" || tk.status === "gesloten" || tk.status === "wachten_op_klant") {
            await db.from("tickets").update({ status: "in_behandeling" } as never).eq("id", tk.id);
          }
          return json({ ok: true, origin });
        }

        /* ------------------------------------------------ nieuwe melding */
        if (p.action === "new_ticket") {
          if (!p.session || !p.subject || !p.body) return json({ error: "Onvolledig" }, 400);
          if (rateLimited(`new:${ip}`, 10)) return json({ error: "Te veel meldingen" }, 429);
          const { data: s } = await db
            .from("ticket_portal_sessions")
            .select("organization_id, email, session_expires_at")
            .eq("session_token", p.session)
            .maybeSingle();
          const sess = s as { organization_id: string; email: string; session_expires_at: string } | null;
          if (!sess || new Date(sess.session_expires_at) < new Date()) {
            return json({ error: "Sessie verlopen" }, 401);
          }
          const { data: org } = await db
            .from("organizations")
            .select("id, name, slug")
            .eq("id", sess.organization_id)
            .maybeSingle();
          const o = (org ?? { id: sess.organization_id, name: "Support", slug: sess.organization_id }) as {
            id: string;
            name: string;
            slug: string;
          };

          // Bestaande klant zoeken op e-mailadres
          const { data: byClient } = await db
            .from("clients")
            .select("id")
            .eq("organization_id", o.id)
            .ilike("email", sess.email)
            .maybeSingle();
          let clientId = (byClient as { id: string } | null)?.id ?? null;
          if (!clientId) {
            const { data: byContact } = await db
              .from("client_contacts")
              .select("client_id")
              .ilike("email", sess.email)
              .limit(1)
              .maybeSingle();
            clientId = (byContact as { client_id: string } | null)?.client_id ?? null;
          }

          const { data: numRes } = await db.rpc("next_ticket_number", { _org_id: o.id } as never);
          const ticketNumber = (numRes as unknown as string) ?? `TCK-${Date.now()}`;

          const { data: inserted, error: insErr } = await db
            .from("tickets")
            .insert({
              organization_id: o.id,
              ticket_number: ticketNumber,
              subject: p.subject,
              status: "nieuw",
              priority: "normaal",
              source: "web",
              requester_name: p.name || null,
              requester_email: sess.email,
              requester_phone: p.phone || null,
              client_id: clientId,
              last_message_at: new Date().toISOString(),
            } as never)
            .select("id, portal_token")
            .single();
          if (insErr || !inserted) return json({ error: "Aanmaken mislukt" }, 500);
          const created = inserted as { id: string; portal_token: string | null };

          await db.from("ticket_messages").insert({
            ticket_id: created.id,
            organization_id: o.id,
            direction: "in",
            body: p.body,
            author_name: p.name || sess.email,
            channel: "portaal",
          } as never);

          const portalUrl = `${origin}/portaal/${encodeURIComponent(o.slug || o.id)}?t=${created.portal_token ?? ""}`;
          await sendPortalMail(
            db,
            o.id,
            o.name,
            sess.email,
            `[${ticketNumber}] ${p.subject}`,
            `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">
               <p>Bedankt voor je melding. We hebben ticket <b>${ticketNumber}</b> aangemaakt.</p>
               <p><a href="${portalUrl}">Volg je melding online</a></p>
             </div>`,
          );
          const { data: ms } = await db
            .from("mail_settings")
            .select("ticket_notify_email, reply_to")
            .eq("organization_id", o.id)
            .maybeSingle();
          const notify =
            (ms as { ticket_notify_email: string | null; reply_to: string | null } | null)
              ?.ticket_notify_email ??
            (ms as { reply_to: string | null } | null)?.reply_to ??
            null;
          if (notify) {
            await sendPortalMail(
              db,
              o.id,
              o.name,
              notify,
              `Nieuwe melding ${ticketNumber}: ${p.subject}`,
              `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">
                 <p><b>Nieuwe melding via het klantportaal</b></p>
                 <p>Van: ${p.name ? `${p.name} · ` : ""}${sess.email}</p>
                 <p>${p.body.replace(/</g, "&lt;")}</p>
               </div>`,
            );
          }
          return json({ ok: true, ticket_number: ticketNumber, token: created.portal_token });
        }

        return json({ error: "Onbekende actie" }, 400);
      },
    },
  },
});
