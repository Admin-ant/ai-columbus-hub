import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const STATUS_LABELS: Record<string, string> = {
  nieuw: "Nieuw",
  opgepakt: "Opgepakt",
  wachten: "Wachten",
  afgehandeld: "Afgehandeld",
};

export function useTaskNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const orgIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      orgIdRef.current = (data as any)?.organization_id ?? null;
    })();

    const channel = supabase
      .channel("crm_activities_task_status")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "crm_activities" },
        (payload) => {
          const newRow: any = payload.new;
          const oldRow: any = payload.old;
          if (!newRow?.task_status || newRow.task_status === oldRow?.task_status) return;
          if (orgIdRef.current && newRow.organization_id && newRow.organization_id !== orgIdRef.current) return;

          const label = STATUS_LABELS[newRow.task_status] ?? newRow.task_status;
          const title = newRow.title || newRow.description || "Taak";
          toast(`Taak: ${title}`, {
            description: `Status gewijzigd naar ${label}`,
            action: newRow.client_id
              ? {
                  label: "Bekijk",
                  onClick: () =>
                    navigate({
                      to: "/ai-columbus/klanten/$clientId",
                      params: { clientId: newRow.client_id },
                      search: { tab: "taken" } as any,
                    }),
                }
              : undefined,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "crm_activities" },
        (payload) => {
          const row: any = payload.new;
          if (!row?.task_status) return;
          if (orgIdRef.current && row.organization_id && row.organization_id !== orgIdRef.current) return;
          const title = row.title || row.description || "Taak";
          toast(`Nieuwe taak: ${title}`, {
            description: `Status: ${STATUS_LABELS[row.task_status] ?? row.task_status}`,
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, navigate]);
}
