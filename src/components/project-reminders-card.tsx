import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, ChevronDown, Clock, Hourglass, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/use-workspace";
import { useReminderSettings } from "@/hooks/use-reminder-settings";

type Row = {
  id: string;
  name: string;
  delivery_status: string | null;
  target_month: string | null;
};

function daysUntil(dateStr: string) {
  const d = new Date(dateStr);
  const diff = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}

export function ProjectRemindersCard() {
  const { currentOrganizationId } = useWorkspace();
  const [{ windowDays, overdueDays }] = useReminderSettings();
  const [waiting, setWaiting] = useState<Row[]>([]);
  const [upcoming, setUpcoming] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!currentOrganizationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const inWindow = new Date();
      inWindow.setDate(inWindow.getDate() + windowDays);

      const [{ data: w }, { data: u }] = await Promise.all([
        supabase
          .from("projects")
          .select("id,name,delivery_status,target_month")
          .eq("organization_id", currentOrganizationId)
          .eq("delivery_status", "wacht_op_klant")
          .order("target_month", { ascending: true, nullsFirst: false })
          .limit(20),
        supabase
          .from("projects")
          .select("id,name,delivery_status,target_month")
          .eq("organization_id", currentOrganizationId)
          .not("target_month", "is", null)
          .not("delivery_status", "in", "(opgeleverd,geannuleerd)")
          .lte("target_month", inWindow.toISOString().slice(0, 10))
          .order("target_month", { ascending: true })
          .limit(20),
      ]);
      if (cancelled) return;
      setWaiting((w ?? []) as Row[]);
      setUpcoming((u ?? []) as Row[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentOrganizationId, windowDays]);

  const total = waiting.length + upcoming.length;

  return (
    <Card className="border-brand/60 bg-brand/5 transition-all hover:border-brand hover:shadow-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-6 text-left"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Bell className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold leading-none tracking-tight">
              Herinneringen — projecten
            </h3>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : total > 0 ? (
              <Badge variant="secondary">{total}</Badge>
            ) : null}
          </div>
          <p className="mt-1.5 truncate text-sm text-muted-foreground">
            {loading
              ? "Projecten worden geladen…"
              : total === 0
                ? "Geen openstaande herinneringen. 🎉"
                : `${waiting.length} wachten op klant · ${upcoming.length} deadline binnen ${windowDays} dagen`}
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && total > 0 && (
        <CardContent className="space-y-4 pt-0">
          {waiting.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                <Hourglass className="h-3.5 w-3.5" /> Wacht op klant ({waiting.length})
              </div>
              <ul className="space-y-1.5">
                {waiting.map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/ai-columbus/projecten/$projectId"
                      params={{ projectId: p.id }}
                      className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted"
                    >
                      <span className="truncate">{p.name}</span>
                      {p.target_month && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {new Date(p.target_month).toLocaleDateString("nl-NL", {
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {upcoming.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Deadline binnen {windowDays} dagen ({upcoming.length})
              </div>
              <ul className="space-y-1.5">
                {upcoming.map((p) => {
                  const d = p.target_month ? daysUntil(p.target_month) : null;
                  const overdue = d !== null && d < -overdueDays;
                  return (
                    <li key={p.id}>
                      <Link
                        to="/ai-columbus/projecten/$projectId"
                        params={{ projectId: p.id }}
                        className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted"
                      >
                        <span className="truncate">{p.name}</span>
                        <span
                          className={`ml-2 text-xs ${overdue ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                        >
                          {d === null
                            ? "—"
                            : overdue
                              ? `${Math.abs(d)}d te laat`
                              : d === 0
                                ? "vandaag"
                                : `over ${d}d`}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

