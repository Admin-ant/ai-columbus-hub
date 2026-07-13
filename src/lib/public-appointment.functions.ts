import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TokenSchema = z.object({ token: z.string().min(20).max(100) });

type PublicAppt = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  attendee_name: string | null;
  attendee_email: string | null;
  status: string;
  confirmed_at: string | null;
  reschedule_requested_at: string | null;
  reschedule_note: string | null;
  organization_name: string | null;
  locale: string;
};

export const getAppointmentByToken = createServerFn({ method: "GET" })
  .inputValidator((d) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("appointments")
      .select(
        "id,title,description,location,starts_at,ends_at,attendee_name,attendee_email,status,confirmed_at,reschedule_requested_at,reschedule_note,organization_id,locale",
      )
      .eq("confirm_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Afspraak niet gevonden of link is ongeldig");
    const r = row as Record<string, unknown> & { organization_id: string };
    let organization_name: string | null = null;
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name")
      .eq("id", r.organization_id)
      .maybeSingle();
    if (org) organization_name = (org as { name: string }).name;
    const out: PublicAppt = {
      id: r.id as string,
      title: r.title as string,
      description: (r.description as string | null) ?? null,
      location: (r.location as string | null) ?? null,
      starts_at: r.starts_at as string,
      ends_at: r.ends_at as string,
      attendee_name: (r.attendee_name as string | null) ?? null,
      attendee_email: (r.attendee_email as string | null) ?? null,
      status: r.status as string,
      confirmed_at: (r.confirmed_at as string | null) ?? null,
      reschedule_requested_at: (r.reschedule_requested_at as string | null) ?? null,
      reschedule_note: (r.reschedule_note as string | null) ?? null,
      organization_name,
      locale: (r.locale as string | null) ?? "nl",
    };
    return out;
  });

export const confirmAppointmentByToken = createServerFn({ method: "POST" })
  .inputValidator((d) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("appointments")
      .select("id,status")
      .eq("confirm_token", data.token)
      .maybeSingle();
    if (error || !row) throw new Error("Ongeldige link");
    const r = row as { id: string; status: string };
    if (r.status === "cancelled") throw new Error("Deze afspraak is geannuleerd");
    const { error: upErr } = await supabaseAdmin
      .from("appointments")
      .update({
        confirmed_at: new Date().toISOString(),
        status: "confirmed",
        reschedule_requested_at: null,
        reschedule_note: null,
      } as never)
      .eq("id", r.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

const RescheduleSchema = TokenSchema.extend({
  note: z.string().max(1000).optional().default(""),
});

export const requestRescheduleByToken = createServerFn({ method: "POST" })
  .inputValidator((d) => RescheduleSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("appointments")
      .select("id,status")
      .eq("confirm_token", data.token)
      .maybeSingle();
    if (error || !row) throw new Error("Ongeldige link");
    const r = row as { id: string; status: string };
    if (r.status === "cancelled") throw new Error("Deze afspraak is geannuleerd");
    const { error: upErr } = await supabaseAdmin
      .from("appointments")
      .update({
        reschedule_requested_at: new Date().toISOString(),
        reschedule_note: data.note?.trim() || null,
        confirmed_at: null,
      } as never)
      .eq("id", r.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });
