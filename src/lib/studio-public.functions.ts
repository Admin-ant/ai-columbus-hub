import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStudioQuoteAccess(userId: string, quoteId: string) {
  const sb = await loadAdmin();
  const { data: q } = await sb
    .from("studio_quotes")
    .select("organization_id")
    .eq("id", quoteId)
    .maybeSingle();
  if (!q) throw new Error("Offerte niet gevonden");
  const { data: m } = await sb
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", q.organization_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!m) throw new Error("Geen toegang");
  return q.organization_id as string;
}

async function assertTemplateAccess(userId: string, templateId: string) {
  const sb = await loadAdmin();
  const { data: t } = await sb
    .from("quote_templates")
    .select("organization_id")
    .eq("id", templateId)
    .maybeSingle();
  if (!t) throw new Error("Sjabloon niet gevonden");
  const { data: m } = await sb
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", t.organization_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!m) throw new Error("Geen toegang");
  return t.organization_id as string;
}

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
        "id, title, client_name, cover_image_url, theme, sections, status, accepted_at, accepted_by_name, accepted_signature, organization_id, created_at, intro_video_url, packages, selected_package_id",
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

    // Throttled "viewed" event — at most once per hour per quote.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await sb
      .from("studio_quote_events")
      .select("id")
      .eq("quote_id", q.id)
      .eq("event_type", "viewed")
      .gte("occurred_at", oneHourAgo)
      .maybeSingle();
    if (!recent) {
      await sb.from("studio_quote_events").insert({
        quote_id: q.id,
        organization_id: q.organization_id,
        event_type: "viewed",
      });
      await sb
        .from("studio_quotes")
        .update({
          last_viewed_at: new Date().toISOString(),
          view_count: ((q as { view_count?: number }).view_count ?? 0) + 1,
        })
        .eq("id", q.id);
    }

    return { quote: q, organization: org };
  });

export const trackSectionView = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token: z.string().min(10).max(128),
        section_key: z.string().min(1).max(64),
        duration_ms: z.number().int().min(0).max(60 * 60 * 1000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await loadAdmin();
    const { data: q } = await sb
      .from("studio_quotes")
      .select("id, organization_id")
      .eq("public_token", data.token)
      .maybeSingle();
    if (!q) return { ok: false };
    await sb.from("studio_quote_events").insert({
      quote_id: q.id,
      organization_id: q.organization_id,
      event_type: "section_view",
      section_key: data.section_key,
      duration_ms: data.duration_ms,
    });
    return { ok: true };
  });

export const selectPackage = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ token: z.string().min(10).max(128), package_id: z.string().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await loadAdmin();
    const { data: q } = await sb
      .from("studio_quotes")
      .select("id, organization_id")
      .eq("public_token", data.token)
      .maybeSingle();
    if (!q) throw new Error("Offerte niet gevonden");
    const { error } = await sb
      .from("studio_quotes")
      .update({ selected_package_id: data.package_id })
      .eq("id", q.id);
    if (error) throw new Error(error.message);
    await sb.from("studio_quote_events").insert({
      quote_id: q.id,
      organization_id: q.organization_id,
      event_type: "package_selected",
      metadata: { package_id: data.package_id },
    });
    return { ok: true };
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
      .select("id, organization_id, status, accepted_at")
      .eq("public_token", data.token)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!q) throw new Error("Offerte niet gevonden");
    if (q.accepted_at) throw new Error("Deze offerte is al geaccepteerd");

    const { sanitizeSignatureSvg } = await import("./signature-svg");
    const safeSig = sanitizeSignatureSvg(data.signature_svg);
    if (!safeSig) throw new Error("Ongeldige handtekening");
    const { error } = await sb
      .from("studio_quotes")
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by_name: data.name,
        accepted_signature: safeSig,
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", q.id);
    if (error) throw new Error(error.message);

    await sb.from("studio_quote_events").insert({
      quote_id: q.id,
      organization_id: q.organization_id,
      event_type: "accepted",
      metadata: { name: data.name },
    });
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

export const createTemplatePreviewToken = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        hours: z.number().int().min(1).max(24 * 30).default(72),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await loadAdmin();
    const token = randToken();
    const expiresAt = new Date(Date.now() + data.hours * 3600 * 1000).toISOString();
    const { error } = await sb
      .from("quote_templates")
      .update({
        preview_token: token,
        preview_token_expires_at: expiresAt,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { token, expires_at: expiresAt };
  });

export const revokeTemplatePreviewToken = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await loadAdmin();
    const { error } = await sb
      .from("quote_templates")
      .update({
        preview_token: null,
        preview_token_expires_at: null,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getTemplatePreviewInfo = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await loadAdmin();
    const { data: row } = await sb
      .from("quote_templates")
      .select("preview_token, preview_token_expires_at")
      .eq("id", data.id)
      .maybeSingle();
    const r = row as { preview_token?: string | null; preview_token_expires_at?: string | null } | null;
    if (!r?.preview_token) return { token: null as string | null, expires_at: null as string | null };
    if (r.preview_token_expires_at && new Date(r.preview_token_expires_at) < new Date()) {
      return { token: null, expires_at: r.preview_token_expires_at };
    }
    return { token: r.preview_token, expires_at: r.preview_token_expires_at ?? null };
  });

export const getPublicTemplatePreview = createServerFn({ method: "GET" })
  .inputValidator((d) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const sb = await loadAdmin();
    const { data: t, error } = await sb
      .from("quote_templates")
      .select(
        "id, name, description, cover_image_url, theme, sections, packages, organization_id, preview_token_expires_at",
      )
      .eq("preview_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!t) throw new Error("Preview niet gevonden of ingetrokken");
    const row = t as unknown as { preview_token_expires_at?: string | null; organization_id: string };
    if (row.preview_token_expires_at && new Date(row.preview_token_expires_at) < new Date()) {
      throw new Error("Deze preview-link is verlopen");
    }
    const { data: org } = await sb
      .from("organizations")
      .select("name, logo_url, brand_color")
      .eq("id", row.organization_id)
      .maybeSingle();
    return { template: t, organization: org };
  });

