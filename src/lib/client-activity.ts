import { supabase } from "@/integrations/supabase/client";

export type ActivityKind = "email" | "call" | "note" | "meeting" | "task";

/**
 * Fire-and-forget log of a CRM activity. Kept fully synchronous up to the
 * insert() call: any preceding async `select`/`getUser` awaits get aborted
 * when the browser follows a mailto:/tel: link on the same click, causing
 * the insert to never actually run. Callers pass `organizationId` so we
 * skip that lookup, and `created_by` is left to RLS (nullable column).
 */
export function logClientActivity(input: {
  clientId: string;
  organizationId: string;
  kind: ActivityKind;
  title: string;
  body?: string | null;
  contactId?: string | null;
}) {
  if (!input.organizationId) {
    console.warn("logClientActivity: missing organizationId");
    return;
  }
  const nowIso = new Date().toISOString();
  const promise = supabase
    .from("crm_activities")
    .insert({
      organization_id: input.organizationId,
      client_id: input.clientId,
      contact_id: input.contactId ?? null,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      done: true,
      done_at: nowIso,
    })
    .then(({ error }) => {
      if (error) console.warn("logClientActivity insert failed", error);
    });
  // Best-effort — do not block callers.
  void promise;
}
