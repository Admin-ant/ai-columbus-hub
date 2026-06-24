import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function aiJson(system: string, user: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ontbreekt");
  const res = await fetch(LOVABLE_GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`AI error ${res.status}`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content ?? "{}";
}

/* ============ CRM Activities ============ */

export const listCrmActivities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; target_id?: string; quote_id?: string; client_id?: string }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("crm_activities")
      .select("*")
      .eq("organization_id", data.organization_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.target_id) q = q.eq("target_id", data.target_id);
    if (data.quote_id) q = q.eq("quote_id", data.quote_id);
    if (data.client_id) q = q.eq("client_id", data.client_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

const activitySchema = z.object({
  organization_id: z.string().uuid(),
  target_id: z.string().uuid().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  quote_id: z.string().uuid().optional().nullable(),
  kind: z.enum(["note", "call", "meeting", "task", "email"]),
  title: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
  due_at: z.string().optional().nullable(),
});

export const createCrmActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => activitySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("crm_activities")
      .insert({ ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const toggleCrmActivityDone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; done: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("crm_activities")
      .update({ done: data.done, done_at: data.done ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCrmActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("crm_activities").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ============ Quote comments (with @mentions) ============ */

export const listQuoteComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { quote_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("quote_comments")
      .select("*")
      .eq("quote_id", data.quote_id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const addQuoteComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; quote_id: string; body: string; mentions?: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("quote_comments")
      .insert({
        organization_id: data.organization_id,
        quote_id: data.quote_id,
        body: data.body,
        mentions: data.mentions ?? [],
        author_id: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const resolveQuoteComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; resolved: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("quote_comments")
      .update({ resolved: data.resolved })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ============ Win/Loss AI analysis ============ */

export const analyzeWinLoss = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { quote_id: string; outcome: "won" | "lost" | "no_decision"; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: q, error } = await context.supabase
      .from("studio_quotes")
      .select("title, client_name, packages, sections, ai_brief, view_count, followup_count")
      .eq("id", data.quote_id)
      .single();
    if (error) throw error;

    const prompt = `Offerte: ${q.title}\nKlant: ${q.client_name ?? "?"}\nViews: ${q.view_count}\nFollowups: ${q.followup_count}\nBrief: ${q.ai_brief ?? "geen"}\nPakketten: ${JSON.stringify(q.packages)}\nResultaat: ${data.outcome}\nReden: ${data.reason ?? "—"}`;

    let analysis: Record<string, unknown> = {};
    try {
      const raw = await aiJson(
        "Je bent een sales-coach. Analyseer waarom deze offerte is gewonnen of verloren. Antwoord in JSON: {summary, strengths:[], weaknesses:[], lessons:[], next_actions:[]}.",
        prompt,
      );
      analysis = JSON.parse(raw) as Record<string, unknown>;
    } catch (e) {
      analysis = { error: String(e) };
    }

    const { error: updErr } = await context.supabase
      .from("studio_quotes")
      .update({
        outcome: data.outcome,
        outcome_reason: data.reason ?? null,
        outcome_at: new Date().toISOString(),
        ai_winloss: analysis as never,
      })
      .eq("id", data.quote_id);
    if (updErr) throw updErr;

    return analysis;
  });

/* ============ White-label branding ============ */

const brandingSchema = z.object({
  organization_id: z.string().uuid(),
  brand_primary_color: z.string().optional().nullable(),
  brand_accent_color: z.string().optional().nullable(),
  brand_logo_url: z.string().optional().nullable(),
  brand_font: z.string().optional().nullable(),
  brand_custom_domain: z.string().optional().nullable(),
});

export const updateBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => brandingSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { organization_id, ...rest } = data;
    const { error } = await context.supabase
      .from("organizations")
      .update(rest)
      .eq("id", organization_id);
    if (error) throw error;
    return { ok: true };
  });

/* ============ Forecast ============ */

type PkgLike = { id?: string; price_eur?: number; billing?: string };

const STAGE_WEIGHT: Record<string, number> = {
  draft: 0.1,
  sent: 0.3,
  viewed: 0.45,
  negotiation: 0.6,
  accepted: 0.95,
  rejected: 0,
};

export const computeForecast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; period_start: string; period_end: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: quotes, error } = await context.supabase
      .from("studio_quotes")
      .select("id, title, status, packages, selected_package_id, win_probability, outcome")
      .eq("organization_id", data.organization_id)
      .gte("created_at", data.period_start)
      .lte("created_at", data.period_end + "T23:59:59");
    if (error) throw error;

    let weighted = 0;
    let best = 0;
    let commit = 0;
    const breakdown: Array<{ id: string; title: string; status: string; value_eur: number; weight: number; weighted_eur: number }> = [];

    for (const q of quotes ?? []) {
      if (q.outcome === "lost") continue;
      const pkgs = (q.packages as unknown as PkgLike[]) ?? [];
      const selected = pkgs.find((p) => p.id === q.selected_package_id);
      const top = selected ?? pkgs.reduce<PkgLike | null>((a, b) => ((b.price_eur ?? 0) > (a?.price_eur ?? 0) ? b : a), null);
      const value = top?.price_eur ?? 0;
      if (!value) continue;
      const weight = q.win_probability != null ? Number(q.win_probability) / 100 : (STAGE_WEIGHT[q.status] ?? 0.2);
      const w = value * weight;
      weighted += w;
      best += value;
      if (weight >= 0.9 || q.outcome === "won") commit += value;
      breakdown.push({ id: q.id, title: q.title, status: q.status, value_eur: value, weight, weighted_eur: Math.round(w) });
    }

    const snapshot = {
      organization_id: data.organization_id,
      period_start: data.period_start,
      period_end: data.period_end,
      weighted_value_cents: Math.round(weighted * 100),
      best_case_cents: Math.round(best * 100),
      commit_cents: Math.round(commit * 100),
      breakdown: { items: breakdown } as never,
      created_by: context.userId,
    };
    const { data: row, error: insErr } = await context.supabase
      .from("forecast_snapshots")
      .insert(snapshot)
      .select()
      .single();
    if (insErr) throw insErr;
    return row;
  });

export const listForecastSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("forecast_snapshots")
      .select("*")
      .eq("organization_id", data.organization_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return rows ?? [];
  });

export const listOrgMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: members, error } = await context.supabase
      .from("organization_members")
      .select("user_id, role")
      .eq("organization_id", data.organization_id);
    if (error) throw error;
    const ids = (members ?? []).map((m) => m.user_id);
    if (ids.length === 0) return [];
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url")
      .in("id", ids);
    return (members ?? []).map((m) => ({
      ...m,
      profile: profiles?.find((p) => p.id === m.user_id) ?? null,
    }));
  });
