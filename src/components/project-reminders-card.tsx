import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, ChevronDown, Clock, Hourglass, Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/hooks/use-workspace";
import { useReminderSettings } from "@/hooks/use-reminder-settings";

type DeliveryStatus =
  | "nieuw"
  | "in_uitvoering"
  | "wacht_op_klant"
  | "on_hold"
  | "opgeleverd"
  | "geannuleerd";

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  nieuw: "Nieuw",
  in_uitvoering: "In uitvoering",
  wacht_op_klant: "Wacht op klant",
  on_hold: "On hold",
  opgeleverd: "Opgeleverd",
  geannuleerd: "Geannuleerd",
};

const STATUS_OPTIONS: DeliveryStatus[] = [
  "nieuw",
  "in_uitvoering",
  "wacht_op_klant",
  "on_hold",
  "opgeleverd",
  "geannuleerd",
];

type Row = {
  id: string;
  name: string;
  delivery_status: DeliveryStatus | null;
  target_month: string | null;
};

function daysUntil(dateStr: string) {
  const d = new Date(dateStr);
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function ProjectRemindersCard() {
  const { currentOrganizationId } = useWorkspace();
  const [{ windowDays, overdueDays }] = useReminderSettings();
  const [waiting, setWaiting] = useState<Row[]>([]);
  const [upcoming, setUpcoming] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);

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
          .not("delivery_status", "in", "(opgeleverd,geannuleerd,wacht_op_klant)")
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
  }, [currentOrganizationId, windowDays, reloadKey]);

  async function changeStatus(projectId: string, next: DeliveryStatus) {
    setPendingId(projectId);
    const { error } = await supabase
      .from("projects")
      .update({ delivery_status: next })
      .eq("id", projectId);
    setPendingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Status → ${STATUS_LABELS[next]}`);
    setReloadKey((k) => k + 1);
  }

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
            <Section
              icon={<Hourglass className="h-3.5 w-3.5" />}
              title={`Wacht op klant (${waiting.length})`}
            >
              {waiting.map((p) => (
                <ReminderRow
                  key={p.id}
                  project={p}
                  right={
                    p.target_month
                      ? new Date(p.target_month).toLocaleDateString("nl-NL", {
                          month: "short",
                          year: "numeric",
                        })
                      : "—"
                  }
                  pending={pendingId === p.id}
                  onStatus={(s) => changeStatus(p.id, s)}
                />
              ))}
            </Section>
          )}
          {upcoming.length > 0 && (
            <Section
              icon={<Clock className="h-3.5 w-3.5" />}
              title={`Deadline binnen ${windowDays} dagen (${upcoming.length})`}
            >
              {upcoming.map((p) => {
                const d = p.target_month ? daysUntil(p.target_month) : null;
                const overdue = d !== null && d < -overdueDays;
                const label =
                  d === null
                    ? "—"
                    : overdue
                      ? `${Math.abs(d)}d te laat`
                      : d === 0
                        ? "vandaag"
                        : `over ${d}d`;
                return (
                  <ReminderRow
                    key={p.id}
                    project={p}
                    right={label}
                    rightClass={overdue ? "font-semibold text-destructive" : "text-muted-foreground"}
                    pending={pendingId === p.id}
                    onStatus={(s) => changeStatus(p.id, s)}
                  />
                );
              })}
            </Section>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
        {icon} {title}
      </div>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

function ReminderRow({
  project,
  right,
  rightClass = "text-muted-foreground",
  pending,
  onStatus,
}: {
  project: Row;
  right: string;
  rightClass?: string;
  pending: boolean;
  onStatus: (s: DeliveryStatus) => void;
}) {
  return (
    <li className="flex items-center gap-1.5 rounded-md border bg-background pr-1 hover:bg-muted">
      <Link
        to="/ai-columbus/projecten/$projectId"
        params={{ projectId: project.id }}
        className="flex flex-1 items-center justify-between gap-2 px-3 py-2 text-sm"
      >
        <span className="truncate">{project.name}</span>
        <span className={`ml-2 shrink-0 text-xs ${rightClass}`}>{right}</span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            aria-label="Wijzig status"
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MoreHorizontal className="h-3.5 w-3.5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Wijzig status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {STATUS_OPTIONS.map((s) => (
            <DropdownMenuItem
              key={s}
              disabled={s === project.delivery_status}
              onClick={() => onStatus(s)}
            >
              {STATUS_LABELS[s]}
              {s === project.delivery_status ? " · huidig" : ""}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
