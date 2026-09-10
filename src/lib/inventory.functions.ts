import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const movementSchema = z.object({
  product_id: z.string().uuid(),
  movement_type: z.enum(["in", "out", "correction"]),
  quantity: z.number().positive("Hoeveelheid moet positief zijn"),
  note: z.string().max(500).optional(),
});

async function requireOrgAccess(supabase: any, userId: string, organizationId: string) {
  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!membership) throw new Error("Geen toegang tot deze organisatie");
}

export const recordStockMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(movementSchema)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: product, error: prodErr } = await supabase
      .from("products")
      .select("id, organization_id")
      .eq("id", data.product_id)
      .single();
    if (prodErr || !product) throw new Error("Product niet gevonden");

    await requireOrgAccess(supabase, userId, product.organization_id);

    const { error } = await supabase.from("product_stock_movements").insert({
      organization_id: product.organization_id,
      product_id: data.product_id,
      movement_type: data.movement_type,
      quantity: data.quantity,
      reference_type: "manual",
      note: data.note?.trim() || null,
      created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listStockMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      organization_id: z.string().uuid(),
      product_id: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgAccess(supabase, userId, data.organization_id);

    let q = supabase
      .from("product_stock_movements")
      .select("*, products(name, sku)")
      .eq("organization_id", data.organization_id)
      .order("created_at", { ascending: false });
    if (data.product_id) q = q.eq("product_id", data.product_id);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getLowStockProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ organization_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgAccess(supabase, userId, data.organization_id);

    const { data: rows, error } = await supabase
      .from("products")
      .select("*")
      .eq("organization_id", data.organization_id)
      .eq("track_stock", true)
      .lte("stock_quantity", "low_stock_threshold");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
