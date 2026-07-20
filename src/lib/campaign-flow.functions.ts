import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import logoEmailAsset from "@/assets/logo-columbus-email.png.asset.json";

async function sendCampaignFlowResend(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY ontbreekt");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as { id: string };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCampaignEmailHtml(opts: {
  bodyText: string;
  trackingUrl?: string | null;
  logoUrl: string;
  senderName?: string | null;
  senderTitle?: string | null;
  brandColor?: string;
}): string {
  const brand = opts.brandColor ?? "#F26A1F";
  const paragraphs = (opts.bodyText ?? "")
    .split(/\n{2,}/)
    .map((p) => esc(p.trim()).replace(/\n/g, "<br />"))
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.65;color:#1f2937">${p}</p>`,
    )
    .join("");

  const cta = opts.trackingUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 4px">
         <tr><td style="border-radius:8px;background:${brand}">
           <a href="${esc(opts.trackingUrl)}" style="display:inline-block;padding:12px 22px;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">
             Bekijk meer →
           </a>
         </td></tr>
       </table>`
    : "";

  const senderName = esc(opts.senderName ?? "AI van Columbus");
  const senderTitle = opts.senderTitle ? esc(opts.senderTitle) : "";

  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>&nbsp;</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f5f7;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06)">
        <tr><td style="padding:28px 32px 8px;border-bottom:1px solid #f1f1f4">
          <img src="${esc(opts.logoUrl)}" alt="AI van Columbus" height="44" style="display:block;height:44px;width:auto;border:0;outline:none;text-decoration:none" />
        </td></tr>
        <tr><td style="padding:28px 32px 8px">
          ${paragraphs}
          ${cta}
        </td></tr>
        <tr><td style="padding:20px 32px 28px">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-top:1px solid #f1f1f4;padding-top:16px">
            <tr><td style="font-family:Inter,Segoe UI,Arial,sans-serif;font-size:13px;color:#4b5563;line-height:1.55">
              <div style="font-weight:600;color:#111827">${senderName}</div>
              ${senderTitle ? `<div style="color:#6b7280">${senderTitle}</div>` : ""}
              <div style="margin-top:6px;color:#9ca3af;font-size:12px">AI van Columbus · aiqloud.nl</div>
            </td></tr>
          </table>
        </td></tr>
      </table>
      <div style="margin-top:14px;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:11px;color:#9ca3af">
        Deze mail is verstuurd via AI van Columbus.
      </div>
    </td></tr>
  </table>
</body></html>`;
}

export const sendCampaignFlowEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      to: string;
      subject: string;
      body: string;
      trackingUrl?: string | null;
      contactName?: string | null;
      company?: string | null;
      senderName?: string | null;
      senderTitle?: string | null;
    }) => input,
  )
  .handler(async ({ data }) => {
    const to = (data.to ?? "").trim();
    if (!to || !/.+@.+\..+/.test(to)) {
      throw new Error("Ongeldig e-mailadres voor prospect");
    }
    const from = process.env.OUTREACH_FROM_EMAIL ?? "outreach@resend.dev";
    const publicBase = (
      process.env.PUBLIC_APP_URL ??
      process.env.VITE_PUBLIC_APP_URL ??
      "https://aiqloud.nl"
    ).replace(/\/$/, "");
    const logoRel = logoEmailAsset.url;
    const logoUrl = logoRel.startsWith("http") ? logoRel : `${publicBase}${logoRel}`;

    const html = renderCampaignEmailHtml({
      bodyText: data.body ?? "",
      trackingUrl: data.trackingUrl ?? null,
      logoUrl,
      senderName: data.senderName ?? null,
      senderTitle: data.senderTitle ?? null,
    });
    const subject =
      (data.subject ?? "").trim() ||
      `Even kort, ${data.company ?? ""}`.trim();
    const r = await sendCampaignFlowResend({ from, to, subject, html });
    return { ok: true as const, providerMessageId: r.id };
  });

export type CampaignFlowLead = {
  id: string;
  name: string;
  company: string;
  email: string;
  website: string;
  email_preview: string | null;
  tracking_link_id: string | null;
  tracking_token: string | null;
  email_sent_at: string | null;
  clicked_at: string | null;
  stage: number;
  closed_at: string | null;
  created_at: string;
};

export type CampaignTaskStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "failed"
  | "cancelled";

export type CampaignFlowTask = {
  id: string;
  lead_id: string | null;
  action: "call" | "followup";
  reason: string;
  done: boolean;
  done_at: string | null;
  created_at: string;
  status: CampaignTaskStatus;
  result: string | null;
  error: string | null;
  started_at: string | null;
  lead_name?: string | null;
  company?: string | null;
};

export type CampaignTaskEvent = {
  id: string;
  task_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  message: string | null;
  created_at: string;
};

export const listCampaignLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CampaignFlowLead[]> => {
    const { data, error } = await context.supabase
      .from("campaign_flow_leads")
      .select(
        "id, name, company, email, website, email_preview, tracking_link_id, tracking_token, email_sent_at, clicked_at, stage, closed_at, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as CampaignFlowLead[];
  });

export const createCampaignLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      company: string;
      email: string;
      website: string;
      emailPreview?: string;
      trackingLinkId?: string;
      trackingToken?: string;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<CampaignFlowLead> => {
    const now = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("campaign_flow_leads")
      .insert({
        user_id: context.userId,
        name: data.name,
        company: data.company,
        email: data.email,
        website: data.website,
        email_preview: data.emailPreview ?? null,
        tracking_link_id: data.trackingLinkId ?? null,
        tracking_token: data.trackingToken ?? null,
        email_sent_at: now,
        stage: 2,
      })
      .select(
        "id, name, company, email, website, email_preview, tracking_link_id, tracking_token, email_sent_at, clicked_at, stage, closed_at, created_at",
      )
      .single();
    if (error) throw new Error(error.message);
    return row as CampaignFlowLead;
  });

export const deleteCampaignLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("campaign_flow_leads")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCampaignTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CampaignFlowTask[]> => {
    const { data, error } = await context.supabase
      .from("campaign_flow_tasks")
      .select(
        "id, lead_id, action, reason, done, done_at, created_at, status, result, error, started_at, lead:lead_id(name, company)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      lead_id: r.lead_id,
      action: r.action,
      reason: r.reason,
      done: r.done,
      done_at: r.done_at,
      created_at: r.created_at,
      status: (r.status ?? "pending") as CampaignTaskStatus,
      result: r.result ?? null,
      error: r.error ?? null,
      started_at: r.started_at ?? null,
      lead_name: r.lead?.name ?? null,
      company: r.lead?.company ?? null,
    }));
  });

export const updateCampaignTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      status: CampaignTaskStatus;
      result?: string | null;
      error?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const patch: {
      status: CampaignTaskStatus;
      done?: boolean;
      done_at?: string | null;
      started_at?: string | null;
      result?: string | null;
      error?: string | null;
    } = { status: data.status };
    if (data.status === "in_progress") patch.started_at = new Date().toISOString();
    if (data.status === "done") {
      patch.done = true;
      patch.done_at = new Date().toISOString();
      patch.result = data.result ?? null;
      patch.error = null;
    } else if (data.status === "failed") {
      patch.done = false;
      patch.done_at = null;
      patch.error = data.error ?? "Onbekende fout";
    } else if (data.status === "cancelled") {
      patch.done = false;
      patch.done_at = null;
    } else if (data.status === "pending") {
      patch.done = false;
      patch.done_at = null;
      patch.started_at = null;
    }
    if (data.result !== undefined && data.status !== "done") patch.result = data.result;
    if (data.error !== undefined && data.status !== "failed") patch.error = data.error;

    const { error } = await context.supabase
      .from("campaign_flow_tasks")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleCampaignTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; done: boolean }) => input)
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("campaign_flow_tasks")
      .update({
        done: data.done,
        done_at: data.done ? now : null,
        status: data.done ? "done" : "pending",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCampaignTaskEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { taskId: string }) => input)
  .handler(async ({ data, context }): Promise<CampaignTaskEvent[]> => {
    const { data: rows, error } = await context.supabase
      .from("campaign_flow_task_events")
      .select("id, task_id, event_type, from_status, to_status, message, created_at")
      .eq("task_id", data.taskId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as CampaignTaskEvent[];
  });

export const deleteCampaignTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("campaign_flow_tasks")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

