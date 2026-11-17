import { createFileRoute } from "@tanstack/react-router";
import { normalizeAddresses, threadReferences, verifySvixSignature } from "@/lib/mail-security";

/**
 * Resend inbound webhook for general mail. Configure in Resend dashboard
 * signed with Svix using $RESEND_WEBHOOK_SECRET (whsec_...).
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
        // Only a valid Resend (Svix) signature within the replay window is accepted.
        if (!(await verifySvixSignature(request.headers, raw, secret))) {
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

        // Organization is determined ONLY by the receiving address. No guessing.
        let organization_id: string | null = null;
        let thread_id: string | null = null;
        const addrs = normalizeAddresses([...toList, ...ccList]);
        if (addrs.length) {
          const list = addrs.map((x) => `"${x}"`).join(",");
          const { data: ms } = await supabaseAdmin
            .from("mail_settings")
            .select("organization_id")
            .or(`reply_to.in.(${list}),from_email.in.(${list}),ticket_notify_email.in.(${list}),ticket_reply_to.in.(${list})`)
            .limit(20);
          const orgs = [...new Set(((ms ?? []) as { organization_id: string }[]).map((r) => r.organization_id))];
          if (orgs.length === 1) organization_id = orgs[0]!;
          else if (orgs.length > 1) console.warn("[mail-inbound] ambiguous recipient, ignored", { addrs, count: orgs.length });
        }
        if (!organization_id) {
          console.warn("[mail-inbound] unknown recipient, ignored", { to: addrs, email_id: emailId });
          return Response.json({ ok: true, ignored: "unknown-recipient" });
        }

        // Thread matching within this organization: X-header, In-Reply-To, References.
        const refs = threadReferences(d.headers, inReplyTo);
        const candidates = [
          ...(mailHeader && /^[0-9a-f-]{36}$/i.test(mailHeader) ? [{ col: "id", vals: [mailHeader] }] : []),
          ...(refs.length ? [{ col: "provider_message_id", vals: refs }] : []),
        ];
        for (const c of candidates) {
          const { data: orig } = await supabaseAdmin
            .from("mail_messages")
            .select("thread_id, id")
            .eq("organization_id", organization_id)
            .in(c.col, c.vals)
            .limit(1)
            .maybeSingle();
          if (orig) {
            const o = orig as { thread_id: string | null; id: string };
            thread_id = o.thread_id ?? o.id;
            break;
          }
        }

        const providerId = d.email_id ?? d.message_id ?? request.headers.get("svix-id");
        if (providerId) {
          const { data: dup } = await supabaseAdmin
            .from("mail_messages").select("id").eq("organization_id", organization_id).eq("provider_message_id", providerId).limit(1).maybeSingle();
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
          provider_message_id: providerId,
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
