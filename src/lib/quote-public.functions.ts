import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TokenSchema = z.object({ token: z.string().min(12).max(128) });

const AcceptSchema = z.object({
  token: z.string().min(12).max(128),
  name: z.string().trim().min(2).max(120),
  signature_svg: z.string().min(10).max(200_000),
  terms_accepted: z.literal(true),
});

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getPublicQuote = createServerFn({ method: "GET" })
  .inputValidator((d) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const sb = await loadAdmin();
    const { data: q, error } = await sb
      .from("quotes")
      .select(
        "id, title, content_json, total_amount, status, organization_id, client_id, accepted_at, accepted_by_name, signature_svg, created_at",
      )
      .eq("public_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!q) throw new Error("Offerte niet gevonden");

    const [{ data: org }, clientRes] = await Promise.all([
      sb.from("organizations").select("name, logo_url").eq("id", q.organization_id).maybeSingle(),
      q.client_id
        ? sb.from("clients").select("name").eq("id", q.client_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return {
      quote: q,
      organization: org,
      client_name: (clientRes?.data as { name?: string } | null)?.name ?? null,
    };
  });

export const acceptQuoteByToken = createServerFn({ method: "POST" })
  .inputValidator((d) => AcceptSchema.parse(d))
  .handler(async ({ data }) => {
    const sb = await loadAdmin();
    const { data: id, error } = await (sb.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: string | null; error: { message: string } | null }>)(
      "accept_quote_by_token",
      {
        _token: data.token,
        _name: data.name,
        _signature_svg: data.signature_svg,
        _terms: data.terms_accepted,
      },
    );
    if (error) throw new Error(error.message);
    return { ok: true, id };
  });
