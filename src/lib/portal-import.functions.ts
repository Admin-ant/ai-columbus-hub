import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PortalPayloadSchema } from "./portal-processor.server";

async function assertOrgAccess(userId: string, organizationId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Geen toegang tot organisatie");
}

/**
 * Handmatige import van een portaal-payload (zelfde shape als de webhook).
 * Zo kan de gebruiker nu al facturen/offertes/klanten/leads invoeren
 * voordat de portalen live gekoppeld zijn.
 */
export const importPortalPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organization_id: z.string().uuid(),
        payload: PortalPayloadSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAccess(context.userId, data.organization_id);
    const { processPortalPayload } = await import("./portal-processor.server");
    return await processPortalPayload(data.organization_id, data.payload);
  });

/**
 * Bulk-import: array van payloads. Retourneert per item resultaat/fout.
 */
export const importPortalBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organization_id: z.string().uuid(),
        items: z.array(PortalPayloadSchema).min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAccess(context.userId, data.organization_id);
    const { processPortalPayload } = await import("./portal-processor.server");
    const results: Array<{
      index: number;
      ok: boolean;
      message?: string;
      invoice_number?: string;
      duplicate?: boolean;
    }> = [];
    for (let i = 0; i < data.items.length; i++) {
      try {
        const r = await processPortalPayload(data.organization_id, data.items[i]);
        results.push({ index: i, ok: true, invoice_number: r.invoice_number, duplicate: r.duplicate });
      } catch (e) {
        results.push({ index: i, ok: false, message: e instanceof Error ? e.message : String(e) });
      }
    }
    return {
      total: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  });
