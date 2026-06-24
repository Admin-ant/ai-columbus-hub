import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const IdSchema = z.object({ id: z.string().uuid() });

export const revokeQuoteLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => IdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("quotes")
      .update({ revoked_at: new Date().toISOString(), revoked_by: context.userId } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreQuoteLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => IdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("quotes")
      .update({ revoked_at: null, revoked_by: null } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const regenerateQuoteToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => IdSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Generate a 48-char hex token client-side; matches gen_random_bytes(24)
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await context.supabase
      .from("quotes")
      .update({ public_token: token, revoked_at: null, revoked_by: null } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, token };
  });

export const updateQuoteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        intro_video_url: z.string().url().nullable().optional(),
        intro_message: z.string().max(2000).nullable().optional(),
        notify_email: z.string().email().nullable().optional(),
        client_email: z.string().email().nullable().optional(),
        followup_enabled: z.boolean().optional(),
        followup_after_days: z.number().int().min(1).max(60).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) cleaned[k] = v === "" ? null : v;
    }
    const { error } = await context.supabase
      .from("quotes")
      .update(cleaned as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markQuoteSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => IdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("quotes")
      .update({ sent_at: new Date().toISOString(), status: "sent" } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
