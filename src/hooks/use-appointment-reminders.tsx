import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";

type ReminderRow = {
  id: string;
  title: string;
  starts_at: string;
  reminder_minutes: number | null;
  status: string;
  location: string | null;
};

const FIRED_KEY = "appt_reminders_fired_v1";

function loadFired(): Record<string, number> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    // prune entries older than 24h
    const cutoff = Date.now() - 24 * 3600_000;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) if (v > cutoff) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

function saveFired(map: Record<string, number>) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function useAppointmentReminders() {
  const { currentOrganizationId } = useWorkspace();
  const orgId = currentOrganizationId;
  const rowsRef = useRef<ReminderRow[]>([]);
  const permissionAsked = useRef(false);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    async function fetchUpcoming() {
      const nowIso = new Date().toISOString();
      const untilIso = new Date(Date.now() + 25 * 3600_000).toISOString();
      const { data } = await supabase
        .from("appointments")
        .select("id,title,starts_at,reminder_minutes,status,location")
        .eq("organization_id", orgId!)
        .neq("status", "cancelled")
        .not("reminder_minutes", "is", null)
        .gte("starts_at", nowIso)
        .lte("starts_at", untilIso)
        .order("starts_at", { ascending: true });
      if (!cancelled) rowsRef.current = (data as ReminderRow[] | null) ?? [];
    }

    void fetchUpcoming();
    const refresh = setInterval(fetchUpcoming, 60_000);

    const channel = supabase
      .channel(`appt-reminders-${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `organization_id=eq.${orgId}` },
        () => {
          void fetchUpcoming();
        },
      )
      .subscribe();

    const tick = setInterval(() => {
      const fired = loadFired();
      const now = Date.now();
      let changed = false;
      for (const r of rowsRef.current) {
        if (r.reminder_minutes == null) continue;
        const startMs = new Date(r.starts_at).getTime();
        const dueMs = startMs - r.reminder_minutes * 60_000;
        if (now >= dueMs && now < startMs + 60_000 && !fired[r.id]) {
          fired[r.id] = now;
          changed = true;
          const desc = `Start: ${formatWhen(r.starts_at)}${r.location ? ` — ${r.location}` : ""}`;
          toast.info(`Herinnering: ${r.title}`, { description: desc, duration: 15_000 });
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try {
              new Notification(`Herinnering: ${r.title}`, { body: desc, tag: `appt-${r.id}` });
            } catch {
              /* ignore */
            }
          }
        }
      }
      if (changed) saveFired(fired);
    }, 20_000);

    if (
      !permissionAsked.current &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      permissionAsked.current = true;
      try {
        void Notification.requestPermission();
      } catch {
        /* ignore */
      }
    }

    return () => {
      cancelled = true;
      clearInterval(tick);
      clearInterval(refresh);
      void supabase.removeChannel(channel);
    };
  }, [orgId]);
}
