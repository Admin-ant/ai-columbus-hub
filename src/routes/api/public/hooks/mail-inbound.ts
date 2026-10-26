import { createFileRoute } from "@tanstack/react-router";

/**
 * Resend inbound webhook for general mail. Configure in Resend dashboard
 * with header `x-webhook-secret: $RESEND_WEBHOOK_SECRET`.
 * Routes inbound mail to mail_messages.inbox for the organization that
 * owns the recipient address (matched via OUTREACH_FROM_EMAIL).
 */
export const Route = createFileRoute("/api/public/hooks/mail-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RESEND_WEBHOOK_SECRET;
        if (!secret) return new Response("Not configured", { status: 503 });
        const raw = await request.text();
        const headerOk = request.headers.get("x-webhook-secret") === secret;
        if (!headerOk && !(await verifySvix(request.headers, raw, secret))) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const evType = (payload as { type?: string }).type;
        if (evType && evType !== "email.received") return Response.json({ ok: true, ignored: evType });

        const ev = payload as {
          type?: string;
          data?: {
            from?: string;
            to?: string | string[];
            cc?: string | string[];
            subject?: string;
            text?: string;
            html?: string;
            in_reply_to?: string;
            message_id?: string;
            email_id?: string;
            headers?: Record<string, string>;
          };
        };
        const d = ev.data ?? {};
        const emailId = d.email_id ?? null;
        // Resend "email.received" webhooks carry metadata only; fetch the content.
        if (emailId && !d.text && !d.html && process.env.RESEND_API_KEY) {
          try {
            const r = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
              headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
            });
            if (r.ok) {
              const full = (await r.json()) as typeof d;
              Object.assign(d, { ...full, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v)) });
              d.text = full.text ?? d.text; d.html = full.html ?? d.html; d.headers = full.headers ?? d.headers;
            } else console.error("[mail-inbound] fetch body failed", r.status, await r.text());
          } catch (e) { console.error("[mail-inbound] fetch body error", e); }
        }
        const fromRaw = d.from ?? "";
        const fromMatch = /<([^>]+)>/.exec(fromRaw);
        const fromEmail = fromMatch?.[1] ?? fromRaw.trim();
        const fromName = fromRaw.replace(/<[^>]+>/, "").trim().replace(/^"|"$/g, "") || null;
        const toList = Array.isArray(d.to) ? d.to : d.to ? [d.to] : [];
        const ccList = Array.isArray(d.cc) ? d.cc : d.cc ? [d.cc] : [];
        const inReplyTo =
          d.in_reply_to ?? d.headers?.["in-reply-to"] ?? d.headers?.["In-Reply-To"] ?? null;
        const mailHeader =
          d.headers?.["x-mail-message-id"] ?? d.headers?.["X-Mail-Message-Id"] ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Determine organization: prefer thread match
        let organization_id: string | null = null;
        let thread_id: string | null = null;
        if (mailHeader) {
          const { data: orig } = await supabaseAdmin
            .from("mail_messages")
            .select("organization_id, thread_id, id")
            .eq("id", mailHeader)
            .maybeSingle();
          if (orig) {
            organization_id = (orig as { organization_id: string }).organization_id;
            thread_id = (orig as { thread_id: string | null; id: string }).thread_id ?? (orig as { id: string }).id;
          }
        }
        if (!organization_id && inReplyTo) {
          const { data: orig } = await supabaseAdmin
            .from("mail_messages")
            .select("organization_id, thread_id, id")
            .eq("provider_message_id", inReplyTo)
            .maybeSingle();
          if (orig) {
            organization_id = (orig as { organization_id: string }).organization_id;
            thread_id = (orig as { thread_id: string | null; id: string }).thread_id ?? (orig as { id: string }).id;
          }
        }
        if (!organization_id) {
          const addrs = [...toList, ...ccList]
            .map((a) => (/<([^>]+)>/.exec(a)?.[1] ?? a).trim().toLowerCase())
            .filter(Boolean);
          if (addrs.length) {
            const list = addrs.map((a) => `"${a.replace(/"/g, "")}"`).join(",");
            const { data: ms } = await supabaseAdmin
              .from("mail_settings")
              .select("organization_id")
              .or(`reply_to.in.(${list}),from_email.in.(${list}),ticket_notify_email.in.(${list}),ticket_reply_to.in.(${list})`)
              .limit(1);
            organization_id = (ms as { organization_id: string }[] | null)?.[0]?.organization_id ?? null;
          }
        }
        if (!organization_id) {
          // Fallback: first org (single-tenant scenario)
          const { data: org } = await supabaseAdmin
            .from("organizations")
            .select("id")
            .limit(1)
            .maybeSingle();
          organization_id = (org as { id: string } | null)?.id ?? null;
        }
        if (!organization_id) return Response.json({ ok: false, reason: "no-org" });

        const providerId = d.email_id ?? d.message_id ?? null;
        if (providerId) {
          const { data: dup } = await supabaseAdmin
            .from("mail_messages").select("id").eq("provider_message_id", providerId).maybeSingle();
          if (dup) return Response.json({ ok: true, duplicate: true });
        }
        const { error: insErr } = await supabaseAdmin.from("mail_messages").insert({
          organization_id,
          folder: "inbox",
          thread_id,
          from_email: fromEmail,
          from_name: fromName,
          to_emails: toList,
          cc_emails: ccList,
          subject: d.subject ?? null,
          body_text: d.text ?? null,
          body_html: d.html ?? null,
          in_reply_to: inReplyTo,
          provider_message_id: d.email_id ?? d.message_id ?? null,
          status: "received",
          received_at: new Date().toISOString(),
        } as never);
        if (insErr) {
          console.error("[mail-inbound] insert failed", insErr);
          return new Response("Insert failed", { status: 500 });
        }

        // Ticketreactie: onderwerp bevat [TCK-JJJJ-NNNN] -> bericht aan het ticket toevoegen
        try {
          const match = /\[?(TCK-\d{4}-\d{4})\]?/i.exec(d.subject ?? "");
          if (match) {
            const ticketNumber = match[1]!.toUpperCase();
            const { data: ticket } = await supabaseAdmin
              .from("tickets")
              .select("id, organization_id, status")
              .eq("organization_id", organization_id)
              .eq("ticket_number", ticketNumber)
              .maybeSingle();
            const tk = ticket as { id: string; organization_id: string; status: string } | null;
            if (tk) {
              await supabaseAdmin.from("ticket_messages").insert({
                ticket_id: tk.id,
                organization_id: tk.organization_id,
                direction: "in",
                body: (d.text ?? d.html ?? "").slice(0, 20000),
                author_name: fromName || fromEmail,
                channel: "email",
                external_id: d.email_id ?? d.message_id ?? null,
              } as never);
              if (tk.status === "opgelost" || tk.status === "gesloten" || tk.status === "wachten_op_klant") {
                await supabaseAdmin
                  .from("tickets")
                  .update({ status: "in_behandeling" } as never)
                  .eq("id", tk.id);
              }
            }
          }
        } catch (e) {
          console.error("[mail-inbound] ticket reply failed", e);
        }

        return Response.json({ ok: true });
      },
    },
  },
});

async function verifySvix(h: Headers, body: string, secret: string): Promise<boolean> {
  const id = h.get("svix-id"), ts = h.get("svix-timestamp"), sig = h.get("svix-signature");
  if (!id || !ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const keyB64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try { keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0)); } catch { return false; }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return sig.split(" ").some((p) => {
    const v = p.split(",")[1] ?? "";
    if (v.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < v.length; i++) diff |= v.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}
