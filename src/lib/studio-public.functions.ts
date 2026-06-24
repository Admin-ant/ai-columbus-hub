import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TokenSchema = z.object({ token: z.string().min(10).max(128) });

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getPublicStudioQuote = createServerFn({ method: "GET" })
  .inputValidator((d) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const sb = await loadAdmin();
    const { data: q, error } = await sb
      .from("studio_quotes")
      .select(
        "id, title, client_name, cover_image_url, theme, sections, status, accepted_at, accepted_by_name, accepted_signature, organization_id, created_at",
      )
      .eq("public_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!q) throw new Error("Offerte niet gevonden");

    const { data: org } = await sb
      .from("organizations")
      .select("name, logo_url, brand_color")
      .eq("id", q.organization_id)
      .maybeSingle();

    return { quote: q, organization: org };
  });

export const acceptPublicStudioQuote = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token: z.string().min(10).max(128),
        name: z.string().min(2).max(120),
        signature_svg: z.string().min(20).max(200_000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await loadAdmin();
    const { data: q, error: e1 } = await sb
      .from("studio_quotes")
      .select("id, status, accepted_at")
      .eq("public_token", data.token)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!q) throw new Error("Offerte niet gevonden");
    if (q.accepted_at) throw new Error("Deze offerte is al geaccepteerd");

    const { error } = await sb
      .from("studio_quotes")
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by_name: data.name,
        accepted_signature: data.signature_svg,
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", q.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function randToken(n = 40) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const createShareToken = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await loadAdmin();
    const { data: existing } = await sb
      .from("studio_quotes")
      .select("public_token")
      .eq("id", data.id)
      .maybeSingle();
    if (existing?.public_token) return { token: existing.public_token };
    const token = randToken();
    const { error } = await sb
      .from("studio_quotes")
      .update({ public_token: token })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { token };
  });
