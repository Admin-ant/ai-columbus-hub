import { supabase } from "@/integrations/supabase/client";

export type ActivityKind = "email" | "call" | "note" | "meeting" | "task";

export async function logClientActivity(input: {
  clientId: string;
  kind: ActivityKind;
  title: string;
  body?: string | null;
  contactId?: string | null;
}) {
  try {
    const { data: client } = await supabase
      .from("clients")
      .select("organization_id")
      .eq("id", input.clientId)
      .maybeSingle();
    if (!client?.organization_id) return;
    const { data: userRes } = await supabase.auth.getUser();
    await supabase.from("crm_activities").insert({
      organization_id: client.organization_id,
      client_id: input.clientId,
      contact_id: input.contactId ?? null,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      created_by: userRes.user?.id ?? null,
      done: true,
      done_at: new Date().toISOString(),
    });
  } catch (e) {
    // best-effort; don't break the UX
    console.warn("logClientActivity failed", e);
  }
}
