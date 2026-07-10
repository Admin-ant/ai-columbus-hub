import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: alleen admins");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (list.error) throw new Error(list.error.message);

    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rolesErr) throw new Error(rolesErr.message);

    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    }

    return list.data.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      display_name: (u.user_metadata as any)?.full_name ?? null,
      roles: rolesByUser.get(u.id) ?? [],
    }));
  });

const inviteSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  displayName: z.string().min(1).max(100),
  role: z.enum(["admin", "medewerker"]),
});

async function sendWelcomeEmail(opts: {
  to: string;
  displayName: string;
  tempPassword: string;
  resetLink: string;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[inviteUser] RESEND_API_KEY ontbreekt — welkomstmail overgeslagen");
    return;
  }
  const fromEmail = process.env.OUTREACH_FROM_EMAIL || "onboarding@resend.dev";
  const from = `AI van Columbus <${fromEmail}>`;
  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f6f7fb;font-family:Inter,Arial,sans-serif;color:#111">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
        <tr><td style="padding:24px 28px;background:#0f172a;color:#fff">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.75">AI van Columbus</div>
          <div style="font-size:20px;font-weight:700;margin-top:4px">Welkom in het portaal</div>
        </td></tr>
        <tr><td style="padding:28px">
          <p style="margin:0 0 12px;font-size:15px">Hoi ${esc(opts.displayName)},</p>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6">
            Er is een account voor je aangemaakt in het <strong>AI van Columbus Portaal</strong>.
            Log in met je e-mailadres en het tijdelijke wachtwoord hieronder, en stel daarna direct een eigen wachtwoord in.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;width:100%">
            <tr><td style="padding:12px 16px;font-size:13px;color:#6b7280">E-mail</td><td style="padding:12px 16px;font-size:14px;font-weight:600">${esc(opts.to)}</td></tr>
            <tr><td style="padding:12px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb">Tijdelijk wachtwoord</td><td style="padding:12px 16px;font-size:14px;font-weight:600;font-family:ui-monospace,Menlo,monospace;border-top:1px solid #e5e7eb">${esc(opts.tempPassword)}</td></tr>
          </table>
          <p style="margin:20px 0 12px;font-size:15px">Klik op de knop hieronder om meteen een nieuw wachtwoord in te stellen:</p>
          <p style="margin:0 0 24px">
            <a href="${opts.resetLink}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">Wachtwoord instellen</a>
          </p>
          <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6">
            Werkt de knop niet? Kopieer deze link in je browser:<br />
            <span style="word-break:break-all;color:#0f172a">${esc(opts.resetLink)}</span>
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f8fafc;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb">
          Heb je dit niet aangevraagd? Negeer dan deze e-mail.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
  const text = `Hoi ${opts.displayName},\n\nEr is een account voor je aangemaakt in het AI van Columbus Portaal.\n\nE-mail: ${opts.to}\nTijdelijk wachtwoord: ${opts.tempPassword}\n\nStel direct een nieuw wachtwoord in via:\n${opts.resetLink}\n\nHeb je dit niet aangevraagd? Negeer dan deze mail.`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: "Welkom bij AI van Columbus — stel je wachtwoord in",
      html,
      text,
    }),
  });
  if (!res.ok) {
    const b = await res.text();
    console.warn(`[inviteUser] welkomstmail mislukt: ${res.status} ${b.slice(0, 200)}`);
  }
}

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inviteSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.displayName },
    });
    if (created.error) throw new Error(created.error.message);
    const newId = created.data.user!.id;

    if (data.role === "admin") {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: newId, role: "admin" }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    }

    // Build a recovery link that lands on /reset-password
    const origin =
      process.env.PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "https://aiqloud.nl";
    const redirectTo = `${origin.replace(/\/$/, "")}/reset-password`;
    let resetLink = redirectTo;
    try {
      const link = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: data.email,
        options: { redirectTo },
      });
      if (!link.error && link.data?.properties?.action_link) {
        resetLink = link.data.properties.action_link;
      }
    } catch (e) {
      console.warn("[inviteUser] generateLink mislukt", e);
    }

    try {
      await sendWelcomeEmail({
        to: data.email,
        displayName: data.displayName,
        tempPassword: data.password,
        resetLink,
      });
    } catch (e) {
      console.warn("[inviteUser] welkomstmail fout", e);
    }

    return { ok: true, id: newId };
  });

const passwordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8).max(72),
});

export const updateUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => passwordSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "medewerker"]),
  enabled: z.boolean(),
});

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => roleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.enabled) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const deleteSchema = z.object({ userId: z.string().uuid() });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) {
      throw new Error("Je kunt jezelf niet verwijderen.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });
