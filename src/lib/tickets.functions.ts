import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TICKET_STATUSES = [
  "nieuw",
  "in_behandeling",
  "wachten_op_klant",
  "opgelost",
  "gesloten",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["laag", "normaal", "hoog", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_SOURCES = ["manual", "web", "email", "whatsapp", "sms", "intern"] as const;
export type TicketSource = (typeof TICKET_SOURCES)[number];

const uuid = z.string().uuid();

function esc(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  nieuw: "Nieuw",
  in_behandeling: "In behandeling",
  wachten_op_klant: "Wachten op klant",
  opgelost: "Opgelost",
  gesloten: "Gesloten",
};

async function ticketPortalUrl(
  supabase: any,
  organizationId: string,
  portalToken: string | null | undefined,
): Promise<string | null> {
  if (!portalToken) return null;
  const { data: org } = await supabase
    .from("organizations")
    .select("slug, id")
    .eq("id", organizationId)
    .maybeSingle();
  const slug = (org as any)?.slug || organizationId;
  const base = (process.env["PUBLIC_APP_URL"] || "https://aiqloud.nl").replace(/\/$/, "");
  return `${base}/portaal/${encodeURIComponent(slug)}?t=${portalToken}`;
}

type TicketMailConfig = {
  organizationId: string;
  fromEmail: string;
  fromName: string | null;
  replyTo: string | null;
  notifyTo: string | null;
  statusNotify: boolean;
};

async function ticketMailConfig(supabase: any, organizationId: string): Promise<TicketMailConfig> {
  const [{ data: ms }, { data: org }] = await Promise.all([
    supabase
      .from("mail_settings")
      .select("from_email, from_name, reply_to, ticket_reply_to, ticket_notify_email, ticket_status_notify")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase.from("organizations").select("email").eq("id", organizationId).maybeSingle(),
  ]);
  const s = (ms ?? {}) as any;
  return {
    organizationId,
    fromEmail: s.from_email || process.env["OUTREACH_FROM_EMAIL"] || "support@resend.dev",
    fromName: s.from_name ?? null,
    replyTo: s.ticket_reply_to || s.reply_to || null,
    notifyTo: s.ticket_notify_email || s.reply_to || (org as any)?.email || s.from_email || null,
    statusNotify: s.ticket_status_notify !== false,
  };
}

async function sendTicketMail(
  cfg: TicketMailConfig,
  msg: { to: string; subject: string; html: string; replyTo?: string | null; folder?: "inbox" | "sent" },
) {
  const key = process.env["RESEND_API_KEY"];
  if (!key) throw new Error("RESEND_API_KEY ontbreekt");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail,
      to: [msg.to],
      reply_to: msg.replyTo ?? cfg.replyTo ?? undefined,
      subject: msg.subject,
      html: msg.html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  const { logMailMessage } = await import("@/lib/mail-log.server");
  await logMailMessage({
    organizationId: cfg.organizationId,
    folder: msg.folder ?? (msg.to === cfg.notifyTo ? "inbox" : "sent"),
    fromEmail: cfg.fromEmail,
    fromName: cfg.fromName,
    to: [msg.to],
    subject: msg.subject,
    html: msg.html,
  });
}

async function assertOrgAccess(
  supabase: { from: (t: string) => any },
  userId: string,
  organizationId: string,
) {
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Geen toegang tot deze omgeving");
}

async function actorName(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", userId)
    .maybeSingle();
  return (data?.display_name as string) || (data?.email as string) || null;
}

/* ------------------------------------------------------------------ list */

const LIST_SCHEMA = z.object({
  organization_id: uuid,
  status: z.array(z.enum(TICKET_STATUSES)).optional(),
  priority: z.array(z.enum(TICKET_PRIORITIES)).optional(),
  category_id: uuid.nullish(),
  assigned_to: z.string().nullish(),
  client_id: uuid.nullish(),
  search: z.string().max(200).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export const listTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => LIST_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("tickets")
      .select(
        "id, ticket_number, subject, status, priority, source, category_id, client_id, assigned_to, requester_name, requester_email, requester_phone, is_internal, tags, last_message_at, created_at, updated_at, resolved_at",
      )
      .eq("organization_id", data.organization_id)
      .order("last_message_at", { ascending: false })
      .limit(data.limit);

    if (data.status?.length) q = q.in("status", data.status);
    if (data.priority?.length) q = q.in("priority", data.priority);
    if (data.category_id) q = q.eq("category_id", data.category_id);
    if (data.assigned_to === "unassigned") q = q.is("assigned_to", null);
    else if (data.assigned_to) q = q.eq("assigned_to", data.assigned_to);
    if (data.client_id) q = q.eq("client_id", data.client_id);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.search?.trim()) {
      const s = data.search.trim().replace(/[%,]/g, "");
      q = q.or(`subject.ilike.%${s}%,ticket_number.ilike.%${s}%,requester_name.ilike.%${s}%`);
    }

    const { data: rows, error } = await q;
    if (error) throw error;
    const tickets = (rows ?? []) as any[];

    const clientIds = [...new Set(tickets.map((t) => t.client_id).filter(Boolean))];
    const userIds = [...new Set(tickets.map((t) => t.assigned_to).filter(Boolean))];

    const [clientsRes, profilesRes, catsRes] = await Promise.all([
      clientIds.length
        ? context.supabase.from("clients").select("id, name, contact_person").in("id", clientIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length
        ? context.supabase.from("profiles").select("id, display_name, email").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      context.supabase
        .from("ticket_categories")
        .select("id, name, color")
        .eq("organization_id", data.organization_id),
    ]);

    const clientById = new Map((clientsRes.data ?? []).map((c: any) => [c.id, c]));
    const profileById = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]));
    const catById = new Map((catsRes.data ?? []).map((c: any) => [c.id, c]));

    return {
      rows: tickets.map((t) => ({
        ...t,
        client_name:
          (clientById.get(t.client_id)?.name as string) ||
          (clientById.get(t.client_id)?.contact_person as string) ||
          null,
        assignee_name:
          (profileById.get(t.assigned_to)?.display_name as string) ||
          (profileById.get(t.assigned_to)?.email as string) ||
          null,
        category_name: (catById.get(t.category_id)?.name as string) ?? null,
        category_color: (catById.get(t.category_id)?.color as string) ?? null,
      })),
      categories: (catsRes.data ?? []) as any[],
    };
  });

/* ------------------------------------------------------------------ detail */

export const getTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ticket, error } = await context.supabase
      .from("tickets")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!ticket) throw new Error("Ticket niet gevonden");
    const t = ticket as any;

    const [msgRes, evRes, attRes, clientRes, catRes] = await Promise.all([
      context.supabase
        .from("ticket_messages")
        .select("*")
        .eq("ticket_id", data.id)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("ticket_events")
        .select("*")
        .eq("ticket_id", data.id)
        .order("created_at", { ascending: false })
        .limit(100),
      context.supabase
        .from("ticket_attachments")
        .select("*")
        .eq("ticket_id", data.id)
        .order("created_at", { ascending: true }),
      t.client_id
        ? context.supabase
            .from("clients")
            .select("id, name, contact_person, email, phone")
            .eq("id", t.client_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      context.supabase
        .from("ticket_categories")
        .select("id, name, color")
        .eq("organization_id", t.organization_id)
        .order("sort_order"),
    ]);

    return {
      ticket: t,
      messages: (msgRes.data ?? []) as any[],
      events: (evRes.data ?? []) as any[],
      attachments: (attRes.data ?? []) as any[],
      client: (clientRes as any).data ?? null,
      categories: (catRes.data ?? []) as any[],
    };
  });

/* ------------------------------------------------------------------ create */

const CREATE_SCHEMA = z.object({
  organization_id: uuid,
  subject: z.string().trim().min(1).max(300),
  body: z.string().max(20000).default(""),
  status: z.enum(TICKET_STATUSES).default("nieuw"),
  priority: z.enum(TICKET_PRIORITIES).default("normaal"),
  source: z.enum(TICKET_SOURCES).default("manual"),
  category_id: uuid.nullish(),
  client_id: uuid.nullish(),
  contact_id: uuid.nullish(),
  assigned_to: uuid.nullish(),
  requester_name: z.string().max(200).nullish(),
  requester_email: z.string().email().max(255).nullish().or(z.literal("")),
  requester_phone: z.string().max(50).nullish(),
  is_internal: z.boolean().default(false),
});

export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CREATE_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgAccess(context.supabase as any, context.userId, data.organization_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: numberRow, error: numErr } = await supabaseAdmin.rpc("next_ticket_number", {
      _org_id: data.organization_id,
    } as never);
    if (numErr) throw new Error(numErr.message);
    const ticket_number = numberRow as unknown as string;

    const name = await actorName(context.supabase as any, context.userId);

    const { data: row, error } = await context.supabase
      .from("tickets")
      .insert({
        organization_id: data.organization_id,
        ticket_number,
        subject: data.subject,
        status: data.status,
        priority: data.priority,
        source: data.source,
        category_id: data.category_id ?? null,
        client_id: data.client_id ?? null,
        contact_id: data.contact_id ?? null,
        assigned_to: data.assigned_to ?? null,
        requester_name: data.requester_name ?? null,
        requester_email: data.requester_email || null,
        requester_phone: data.requester_phone ?? null,
        is_internal: data.is_internal,
        created_by: context.userId,
      } as never)
      .select("id, ticket_number")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Ticket aanmaken mislukt");
    const id = (row as any).id as string;

    if (data.body.trim()) {
      await context.supabase.from("ticket_messages").insert({
        ticket_id: id,
        organization_id: data.organization_id,
        direction: "in",
        is_internal: false,
        body: data.body,
        author_id: context.userId,
        author_name: name,
        channel: "app",
      } as never);
    }

    await context.supabase.from("ticket_events").insert({
      ticket_id: id,
      organization_id: data.organization_id,
      actor_id: context.userId,
      actor_name: name,
      field: "created",
      new_value: ticket_number,
    } as never);

    if (data.client_id) {
      await context.supabase.from("crm_activities").insert({
        organization_id: data.organization_id,
        client_id: data.client_id,
        kind: "note",
        title: `Ticket ${ticket_number}: ${data.subject}`,
        body: data.body.slice(0, 1000),
        created_by: context.userId,
      } as never);
    }

    return { id, ticket_number };
  });

/* ------------------------------------------------------------------ update */

const UPDATE_SCHEMA = z.object({
  id: uuid,
  subject: z.string().trim().min(1).max(300).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  category_id: uuid.nullable().optional(),
  client_id: uuid.nullable().optional(),
  assigned_to: uuid.nullable().optional(),
  requester_name: z.string().max(200).nullable().optional(),
  requester_email: z.string().max(255).nullable().optional(),
  requester_phone: z.string().max(50).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export const updateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UPDATE_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: before } = await context.supabase
      .from("tickets")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!before) throw new Error("Ticket niet gevonden");
    const prev = before as any;

    const update: Record<string, unknown> = { ...patch };
    if (patch.status === "opgelost" && prev.status !== "opgelost")
      update.resolved_at = new Date().toISOString();
    if (patch.status === "gesloten" && prev.status !== "gesloten")
      update.closed_at = new Date().toISOString();
    if (patch.status && patch.status !== "opgelost" && patch.status !== "gesloten") {
      update.resolved_at = null;
      update.closed_at = null;
    }

    const { error } = await context.supabase
      .from("tickets")
      .update(update as never)
      .eq("id", id);
    if (error) throw new Error(error.message);

    const name = await actorName(context.supabase as any, context.userId);
    const events = Object.entries(patch)
      .filter(([k, v]) => String(prev[k] ?? "") !== String(v ?? ""))
      .map(([k, v]) => ({
        ticket_id: id,
        organization_id: prev.organization_id,
        actor_id: context.userId,
        actor_name: name,
        field: k,
        old_value: prev[k] === null || prev[k] === undefined ? null : String(prev[k]),
        new_value: v === null || v === undefined ? null : String(v),
      }));
    if (events.length) await context.supabase.from("ticket_events").insert(events as never);

    // Interne melding bij statuswijziging (mag falen)
    if (patch.status && patch.status !== prev.status) {
      try {
        const cfg = await ticketMailConfig(context.supabase, prev.organization_id);
        if (cfg.statusNotify && cfg.notifyTo) {
          const { data: atts } = await context.supabase
            .from("ticket_attachments")
            .select("file_name, mime_type, file_size")
            .eq("ticket_id", id)
            .limit(20);
          const attList = ((atts ?? []) as any[])
            .map(
              (a) =>
                `<li>${esc(a.file_name)} <span style="color:#6b7280">(${esc(a.mime_type ?? "bestand")}${
                  a.file_size ? ` · ${Math.max(1, Math.round(Number(a.file_size) / 1024))} kB` : ""
                })</span></li>`,
            )
            .join("");
          const portalUrl = await ticketPortalUrl(
            context.supabase,
            prev.organization_id,
            prev.portal_token,
          );
          await sendTicketMail(cfg, {
            to: cfg.notifyTo,
            subject: `[${prev.ticket_number}] status: ${STATUS_LABEL[patch.status]}`,
            html: `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">
              <p><b>${esc(prev.ticket_number)}</b> — ${esc(prev.subject ?? "")}</p>
              <p>Status gewijzigd van <b>${esc(STATUS_LABEL[prev.status as TicketStatus] ?? String(prev.status))}</b>
                 naar <b>${esc(STATUS_LABEL[patch.status])}</b>${name ? ` door ${esc(name)}` : ""}.</p>
              ${patch.priority ? `<p>Prioriteit: <b>${esc(patch.priority)}</b></p>` : ""}
              ${attList ? `<p><b>Bijlagen</b></p><ul>${attList}</ul>` : "<p>Geen bijlagen.</p>"}
              ${portalUrl ? `<p><a href="${portalUrl}">Open het ticket</a></p>` : ""}
            </div>`,
            folder: "inbox",
          });
        }
      } catch (e) {
        console.error("[tickets] status mail failed", e);
      }
    }

    return { ok: true };
  });

export const deleteTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("tickets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ messages */

const MSG_SCHEMA = z.object({
  ticket_id: uuid,
  body: z.string().trim().min(1).max(20000),
  is_internal: z.boolean().default(false),
  send_email: z.boolean().default(false),
});

export const addTicketMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MSG_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    const { data: t } = await context.supabase
      .from("tickets")
      .select("id, organization_id, ticket_number, subject, requester_email, portal_token")
      .eq("id", data.ticket_id)
      .maybeSingle();
    if (!t) throw new Error("Ticket niet gevonden");
    const ticket = t as any;
    const name = await actorName(context.supabase as any, context.userId);

    let emailed = false;
    let emailError: string | null = null;

    if (data.send_email && !data.is_internal) {
      const to = ticket.requester_email as string | null;
      if (!to) {
        emailError = "Geen e-mailadres bij dit ticket";
      } else {
        try {
          const { data: settings } = await context.supabase
            .from("mail_settings")
            .select("from_email, from_name, reply_to, signature")
            .eq("organization_id", ticket.organization_id)
            .maybeSingle();
          const s = (settings ?? null) as any;
          const fromEmail = s?.from_email || process.env.OUTREACH_FROM_EMAIL || "support@resend.dev";
          const from = s?.from_name ? `${s.from_name} <${fromEmail}>` : fromEmail;
          const full = s?.signature ? `${data.body}\n\n${s.signature}` : data.body;
          const portalUrl = await ticketPortalUrl(
            context.supabase,
            ticket.organization_id,
            ticket.portal_token,
          );
          const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;white-space:pre-wrap">${esc(full)}</div>${
            portalUrl
              ? `<p style="font-family:Inter,Arial,sans-serif;font-size:14px"><a href="${portalUrl}">Bekijk je ticket online</a></p>`
              : ""
          }`;
          const key = process.env.RESEND_API_KEY;
          if (!key) throw new Error("RESEND_API_KEY ontbreekt");
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
            body: JSON.stringify({
              from,
              to: [to],
              reply_to: s?.reply_to || undefined,
              subject: `[${ticket.ticket_number}] ${ticket.subject}`,
              html,
              text: full,
            }),
          });
          if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
          emailed = true;
          const { logMailMessage } = await import("@/lib/mail-log.server");
          await logMailMessage({
            organizationId: ticket.organization_id,
            folder: "sent",
            fromEmail,
            fromName: s?.from_name ?? null,
            to: [to],
            subject: `[${ticket.ticket_number}] ${ticket.subject}`,
            html,
            text: full,
          });
        } catch (e) {
          emailError = e instanceof Error ? e.message : String(e);
        }
      }
    }

    const { error } = await context.supabase.from("ticket_messages").insert({
      ticket_id: data.ticket_id,
      organization_id: ticket.organization_id,
      direction: "out",
      is_internal: data.is_internal,
      body: data.body,
      author_id: context.userId,
      author_name: name,
      channel: emailed ? "email" : "app",
    } as never);
    if (error) throw new Error(error.message);

    return { ok: true, emailed, emailError };
  });

/* ------------------------------------------------------------------ categories */

export const upsertTicketCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: uuid.nullish(),
        organization_id: uuid,
        name: z.string().trim().min(1).max(60),
        color: z.string().max(30).nullish(),
        sort_order: z.number().int().min(0).max(999).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const row = {
      organization_id: data.organization_id,
      name: data.name,
      color: data.color ?? null,
      sort_order: data.sort_order,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("ticket_categories")
        .update(row as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("ticket_categories")
      .insert(row as never)
      .select("id")
      .single();
    if (error || !ins) throw new Error(error?.message ?? "Opslaan mislukt");
    return { id: (ins as any).id as string };
  });

export const deleteTicketCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ticket_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ people */

export const listTicketAgents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organization_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: members } = await context.supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", data.organization_id);
    const ids = (members ?? []).map((m: any) => m.user_id);
    if (!ids.length) return [];
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", ids);
    return (profiles ?? []).map((p: any) => ({
      id: p.id as string,
      name: (p.display_name as string) || (p.email as string) || "Onbekend",
    }));
  });

export const listTicketClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organization_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("clients")
      .select("id, name, contact_person, email, phone")
      .eq("organization_id", data.organization_id)
      .order("name")
      .limit(1000);
    return (rows ?? []) as any[];
  });

/* ------------------------------------------------------------------ attachments */

export const uploadTicketAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        ticket_id: uuid,
        filename: z.string().min(1).max(200),
        mime_type: z.string().max(120).nullish(),
        base64: z.string().min(1).max(14_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: t } = await context.supabase
      .from("tickets")
      .select("id, organization_id")
      .eq("id", data.ticket_id)
      .maybeSingle();
    if (!t) throw new Error("Ticket niet gevonden");
    const orgId = (t as any).organization_id as string;

    const bytes = Buffer.from(data.base64, "base64");
    const safe = data.filename.replace(/[^\w.\-]+/g, "_").slice(-120);
    const path = `${orgId}/${data.ticket_id}/${Date.now()}-${safe}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage
      .from("ticket-attachments")
      .upload(path, bytes, { contentType: data.mime_type || "application/octet-stream" });
    if (upErr) throw new Error(upErr.message);

    const { error } = await context.supabase.from("ticket_attachments").insert({
      ticket_id: data.ticket_id,
      organization_id: orgId,
      storage_path: path,
      filename: data.filename,
      mime_type: data.mime_type ?? null,
      size_bytes: bytes.byteLength,
      uploaded_by: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getTicketAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("ticket_attachments")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Bijlage niet gevonden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("ticket-attachments")
      .createSignedUrl((row as any).storage_path as string, 300);
    if (error || !signed) throw new Error(error?.message ?? "Link maken mislukt");
    return { url: signed.signedUrl };
  });

export const deleteTicketAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("ticket_attachments")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return { ok: true };
    const { error } = await context.supabase.from("ticket_attachments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage
      .from("ticket-attachments")
      .remove([(row as any).storage_path as string]);
    return { ok: true };
  });

/* ------------------------------------------------------------- mail settings */

export const getTicketMailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organization_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgAccess(context.supabase as any, context.userId, data.organization_id);
    const { data: ms } = await context.supabase
      .from("mail_settings")
      .select("from_email, reply_to, ticket_reply_to, ticket_notify_email, ticket_status_notify")
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    const { data: org } = await context.supabase
      .from("organizations")
      .select("email")
      .eq("id", data.organization_id)
      .maybeSingle();
    const s = (ms ?? {}) as any;
    return {
      ticket_reply_to: (s.ticket_reply_to as string) ?? "",
      ticket_notify_email: (s.ticket_notify_email as string) ?? "",
      ticket_status_notify: s.ticket_status_notify !== false,
      fallback_reply_to: (s.reply_to as string) || (s.from_email as string) || "",
      fallback_notify: (s.reply_to as string) || ((org as any)?.email as string) || "",
    };
  });

export const saveTicketMailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organization_id: uuid,
        ticket_reply_to: z.string().trim().max(255).nullish(),
        ticket_notify_email: z.string().trim().max(255).nullish(),
        ticket_status_notify: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAccess(context.supabase as any, context.userId, data.organization_id);
    const mail = z.string().email();
    for (const v of [data.ticket_reply_to, data.ticket_notify_email]) {
      if (v && !mail.safeParse(v).success) throw new Error(`Ongeldig e-mailadres: ${v}`);
    }
    const { error } = await context.supabase.from("mail_settings").upsert(
      {
        organization_id: data.organization_id,
        ticket_reply_to: data.ticket_reply_to || null,
        ticket_notify_email: data.ticket_notify_email || null,
        ticket_status_notify: data.ticket_status_notify,
      } as never,
      { onConflict: "organization_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------- mail history */

export const emailTicketHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ ticket_id: uuid, to: z.string().email().max(255).nullish() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: t } = await context.supabase
      .from("tickets")
      .select("*")
      .eq("id", data.ticket_id)
      .maybeSingle();
    if (!t) throw new Error("Ticket niet gevonden");
    const ticket = t as any;

    const cfg = await ticketMailConfig(context.supabase, ticket.organization_id);
    const to = data.to || cfg.notifyTo;
    if (!to) throw new Error("Geen ontvanger ingesteld — vul een e-mailadres in bij de ticketinstellingen");

    const [{ data: msgs }, { data: atts }] = await Promise.all([
      context.supabase
        .from("ticket_messages")
        .select("*")
        .eq("ticket_id", data.ticket_id)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("ticket_attachments")
        .select("id, filename, mime_type, size_bytes, storage_path")
        .eq("ticket_id", data.ticket_id)
        .order("created_at", { ascending: true }),
    ]);

    const fmt = (iso: string) =>
      new Date(iso).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });

    const thread = ((msgs ?? []) as any[])
      .map((m) => {
        const internal = m.is_internal === true;
        return `<div style="border-left:3px solid ${internal ? "#f59e0b" : m.direction === "in" ? "#94a3b8" : "#2563eb"};padding:6px 0 6px 12px;margin:0 0 14px">
          <div style="font-size:12px;color:#64748b">
            ${esc(fmt(m.created_at))} — ${esc(m.author_name || (m.direction === "in" ? "Melder" : "Medewerker"))}
            ${internal ? " · <b>interne notitie</b>" : ` · ${esc(m.channel ?? "app")}`}
          </div>
          <div style="white-space:pre-wrap;font-size:14px;color:#111">${esc(String(m.body ?? ""))}</div>
        </div>`;
      })
      .join("");

    const attachmentRows = await Promise.all(
      ((atts ?? []) as any[]).map(async (a) => {
        let url: string | null = null;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: signed } = await supabaseAdmin.storage
            .from("ticket-attachments")
            .createSignedUrl(a.storage_path as string, 60 * 60 * 24 * 7);
          url = signed?.signedUrl ?? null;
        } catch {
          url = null;
        }
        const kb = a.size_bytes ? `${Math.max(1, Math.round(a.size_bytes / 1024))} kB` : "";
        const label = `${esc(a.filename)} <span style="color:#64748b">(${esc(a.mime_type || "onbekend type")}${kb ? `, ${kb}` : ""})</span>`;
        return `<li>${url ? `<a href="${url}">${label}</a>` : label}</li>`;
      }),
    );

    await sendTicketMail(cfg, {
      to,
      subject: `Historiek ${ticket.ticket_number}: ${ticket.subject}`,
      replyTo: (ticket.requester_email as string) || null,
      html: `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">
        <h2 style="margin:0 0 4px">${esc(ticket.ticket_number)} — ${esc(ticket.subject ?? "")}</h2>
        <p style="margin:0 0 16px;color:#64748b;font-size:13px">
          Status: ${esc(STATUS_LABEL[ticket.status as TicketStatus] ?? String(ticket.status))} ·
          Prioriteit: ${esc(String(ticket.priority))} ·
          Aangemaakt: ${esc(fmt(ticket.created_at))}<br/>
          Melder: ${esc(ticket.requester_name || "-")}${ticket.requester_email ? ` &lt;${esc(ticket.requester_email)}&gt;` : ""}
        </p>
        ${thread || "<p>Nog geen berichten.</p>"}
        ${attachmentRows.length ? `<h3 style="font-size:14px;margin:18px 0 6px">Bijlagen</h3><ul style="font-size:14px">${attachmentRows.join("")}</ul>` : ""}
      </div>`,
    });

    return { ok: true, to };
  });
