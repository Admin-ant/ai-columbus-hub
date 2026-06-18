import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BOOTSTRAP_EMAIL = "ah.hogervorst@gmail.com";
const BOOTSTRAP_PASSWORD = "TelkpN1020304!";
const BOOTSTRAP_NAME = "Admin";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: alleen admins");
}

/** Bootstraps the very first admin account. Idempotent: only works as long as no admin exists. */
export const bootstrapAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { count, error: countErr } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (countErr) throw new Error(countErr.message);
  if ((count ?? 0) > 0) {
    return { ok: false, message: "Er bestaat al een admin." };
  }

  // Try to find existing auth user
  let userId: string | null = null;
  const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (list.error) throw new Error(list.error.message);
  const existing = list.data.users.find(
    (u) => (u.email ?? "").toLowerCase() === BOOTSTRAP_EMAIL.toLowerCase(),
  );
  if (existing) {
    userId = existing.id;
    const upd = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password: BOOTSTRAP_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: BOOTSTRAP_NAME },
    });
    if (upd.error) throw new Error(upd.error.message);
  } else {
    const created = await supabaseAdmin.auth.admin.createUser({
      email: BOOTSTRAP_EMAIL,
      password: BOOTSTRAP_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: BOOTSTRAP_NAME },
    });
    if (created.error) throw new Error(created.error.message);
    userId = created.data.user!.id;
  }

  // Ensure admin role
  const { error: roleErr } = await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId!, role: "admin" }, { onConflict: "user_id,role" });
  if (roleErr) throw new Error(roleErr.message);

  return { ok: true, email: BOOTSTRAP_EMAIL };
});

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
