import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";

/**
 * Houdt het aantal ongelezen mededelingen bij en ververst mededelingen-queries
 * live via realtime, zonder dat de pagina herladen hoeft te worden.
 */
export function useAnnouncementRealtime(options?: { notify?: boolean }) {
  const notify = options?.notify ?? false;
  const { user } = useAuth();
  const { currentOrganizationId: orgId } = useWorkspace();
  const qc = useQueryClient();
  const [unread, setUnread] = useState(0);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!orgId || !userId) {
      setUnread(0);
      return;
    }

    let active = true;

    const refresh = async () => {
      const { data: rows, error } = await supabase
        .from("announcements")
        .select("id")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error || !active) return;

      const ids = (rows ?? []).map((r) => r.id as string);
      if (ids.length === 0) {
        setUnread(0);
        return;
      }

      const { data: reads } = await supabase
        .from("announcement_reads")
        .select("announcement_id, read_at")
        .eq("user_id", userId)
        .in("announcement_id", ids);
      if (!active) return;

      const readIds = new Set(
        (reads ?? [])
          .filter((r) => (r as { read_at: string | null }).read_at)
          .map((r) => r.announcement_id as string),
      );
      setUnread(ids.filter((id) => !readIds.has(id)).length);
    };

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["announcements", orgId] });
      qc.invalidateQueries({ queryKey: ["my-notifications", orgId, userId] });
      void refresh();
    };

    void refresh();

    const channel = supabase
      .channel(`announcements-live-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "announcements",
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          if (notify && payload.eventType === "INSERT") {
            const rec = payload.new as { title?: string; category?: string };
            toast.info("Nieuwe mededeling", { description: rec?.title ?? "" });
          }
          invalidate();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "announcement_reads",
          filter: `user_id=eq.${userId}`,
        },
        invalidate,
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [orgId, userId, qc, notify]);

  return unread;
}
