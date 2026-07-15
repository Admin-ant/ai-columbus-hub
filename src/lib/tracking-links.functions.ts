import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function randomToken(len = 10): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

export type TrackingLink = {
  id: string;
  token: string;
  lead_ref: string | null;
  lead_name: string | null;
  company: string | null;
  destination_url: string;
  click_count: number;
  first_visited_at: string | null;
  last_visited_at: string | null;
  created_at: string;
};

export const createTrackingLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      leadRef?: string;
      leadName?: string;
      company?: string;
      destinationUrl: string;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<TrackingLink> => {
    const { supabase, userId } = context;
    let token = "";
    let inserted: TrackingLink | null = null;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      token = randomToken(10);
      const { data: row, error } = await supabase
        .from("campaign_tracking_links")
        .insert({
          user_id: userId,
          token,
          lead_ref: data.leadRef ?? null,
          lead_name: data.leadName ?? null,
          company: data.company ?? null,
          destination_url: data.destinationUrl,
        })
        .select(
          "id, token, lead_ref, lead_name, company, destination_url, click_count, first_visited_at, last_visited_at, created_at",
        )
        .single();
      if (!error && row) {
        inserted = row as TrackingLink;
        break;
      }
      if (error && !error.message.toLowerCase().includes("duplicate")) {
        throw new Error(error.message);
      }
    }
    if (!inserted) throw new Error("Kon geen unieke token genereren");
    return inserted;
  });

export const listTrackingLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { leadRefs?: string[] }) => input)
  .handler(async ({ data, context }): Promise<TrackingLink[]> => {
    const { supabase } = context;
    let q = supabase
      .from("campaign_tracking_links")
      .select(
        "id, token, lead_ref, lead_name, company, destination_url, click_count, first_visited_at, last_visited_at, created_at",
      )
      .order("created_at", { ascending: false });
    if (data.leadRefs && data.leadRefs.length > 0) {
      q = q.in("lead_ref", data.leadRefs);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as TrackingLink[];
  });
