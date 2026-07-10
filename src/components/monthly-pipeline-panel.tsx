import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { periodRange, type PeriodKey } from "@/lib/dashboard-period";

type Lead = Database["public"]["Tables"]["leads"]["Row"];

const EUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

function monthLabel(d: Date) {
  return d.toLocaleDateString("nl-NL", { month: "short", year: "2-digit" }).replace(".", "");
}
function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const STAGE_OPTIONS = [
  { value: "all", label: "Alle stadia" },
  { value: "nieuw", label: "Nieuw" },
  { value: "gekwalificeerd", label: "Gekwalificeerd" },
  { value: "voorstel", label: "Voorstel" },
  { value: "onderhandeling", label: "Onderhandeling" },
  { value: "klant", label: "Klant" },
];

const TIMING_OPTIONS = [
  { value: "all", label: "Alle periodes" },
  { value: "running", label: "Lopend" },
  { value: "upcoming", label: "Toekomstig" },
  { value: "this-quarter", label: "Komend kwartaal" },
  { value: "no-date", label: "Zonder datum" },
];

export function MonthlyPipelinePanel({
  organizationId,
  period = "all",
}: {
  organizationId: string | null;
  period?: PeriodKey;
}) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [timingFilter, setTimingFilter] = useState("all");

  const range = useMemo(() => periodRange(period), [period]);

  useEffect(() => {
    if (!organizationId) {
      setLeads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("leads")
      .select("*")
      .eq("organization_id", organizationId)
      .gt("potential_monthly_value", 0)
      .then(({ data }) => {
        setLeads((data ?? []) as Lead[]);
        setLoading(false);
      });
  }, [organizationId]);

  const filteredLeads = useMemo(() => {
    const now = new Date();
    const currentKey = monthKey(now);
    const quarterEnd = new Date(now.getFullYear(), now.getMonth() + 3, 0);
    // Forward-looking window matching the period: 30d → +1 month, quarter → +3, year → +12, all → geen limiet
    const upcomingEnd =
      period === "all"
        ? null
        : new Date(now.getFullYear(), now.getMonth() + range.months, now.getDate());
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (l.stage === "verloren") return false;
      if (stageFilter !== "all" && l.stage !== stageFilter) return false;
      if (q) {
        const hay = `${l.name ?? ""} ${l.company ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const start = l.target_start_date ? new Date(l.target_start_date) : null;
      const isRunning = l.stage === "klant" || (start && monthKey(start) <= currentKey);
      // Consistente periode-filter: toekomstige leads met start binnen periodevenster
      if (!isRunning && upcomingEnd && start && start > upcomingEnd) return false;
      if (timingFilter === "running" && !isRunning) return false;
      if (timingFilter === "upcoming" && (isRunning || !start)) return false;
      if (timingFilter === "no-date" && start) return false;
      if (timingFilter === "this-quarter") {
        if (!start || start > quarterEnd || start < now) return false;
      }
      return true;
    });
  }, [leads, search, stageFilter, timingFilter, period, range.months]);

  const { running, upcoming, totalRunning, totalUpcoming } = useMemo(() => {
    const now = new Date();
    const currentKey = monthKey(now);
    const running: Lead[] = [];
    const upcoming: Lead[] = [];
    let totalRunning = 0;
    let totalUpcoming = 0;
    for (const l of filteredLeads) {
      const val = Number(l.potential_monthly_value ?? 0);
      const start = l.target_start_date ? new Date(l.target_start_date) : null;
      const isRunning = l.stage === "klant" || (start && monthKey(start) <= currentKey);
      if (isRunning) {
        running.push(l);
        totalRunning += val;
      } else {
        upcoming.push(l);
        totalUpcoming += val;
      }
    }
    upcoming.sort((a, b) => {
      const ax = a.target_start_date ?? "9999";
      const bx = b.target_start_date ?? "9999";
      return ax.localeCompare(bx);
    });
    running.sort((a, b) => (a.target_start_date ?? "0").localeCompare(b.target_start_date ?? "0"));
    return { running, upcoming, totalRunning, totalUpcoming };
  }, [filteredLeads]);

  const filtersActive = search !== "" || stageFilter !== "all" || timingFilter !== "all";

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Pijplijn laden…
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        Selecteer een organisatie om de pijplijn te zien.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Maandelijkse omzetpijplijn</h2>
            <p className="text-xs text-muted-foreground">
              Klant · pot. waarde/maand · ingangsdatum
            </p>
          </div>
          {filtersActive && (
            <Badge variant="secondary" className="text-[10px]">
              {filteredLeads.length} van {leads.filter((l) => l.stage !== "verloren").length} getoond
            </Badge>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek klant of bedrijf…"
              className="h-8 pl-7 text-sm"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-8 w-[150px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={timingFilter} onValueChange={setTimingFilter}>
            <SelectTrigger className="h-8 w-[160px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMING_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => { setSearch(""); setStageFilter("all"); setTimingFilter("all"); }}
            >
              <X className="mr-1 h-3 w-3" /> Wis filters
            </Button>
          )}
        </div>
      </div>

      <Section
        title="Wat er nu loopt"
        accent="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        rows={running}
        total={totalRunning}
        emptyText="Geen lopende contracten met deze filters."
      />
      <Section
        title="Wat er aan komt"
        accent="bg-blue-500/10 text-blue-700 dark:text-blue-300"
        rows={upcoming}
        total={totalUpcoming}
        emptyText="Geen geplande pijplijn met deze filters."
      />

      <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3">
        <span className="text-sm font-semibold">Totaal gecombineerd / maand</span>
        <span className="text-lg font-bold tabular-nums">
          {EUR.format(totalRunning + totalUpcoming)}
        </span>
      </div>
    </div>
  );
}

function Section({
  title,
  accent,
  rows,
  total,
  emptyText,
}: {
  title: string;
  accent: string;
  rows: Lead[];
  total: number;
  emptyText: string;
}) {
  return (
    <div className="border-b last:border-b-0">
      <div className={`flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wide ${accent}`}>
        <span>{title}</span>
        <span className="tabular-nums">{EUR.format(total)}</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-4 text-xs text-muted-foreground">{emptyText}</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Klant</th>
              <th className="px-4 py-2 text-right font-medium">Pot. waarde / maand</th>
              <th className="px-4 py-2 text-right font-medium">Ingangsdatum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="px-4 py-2">
                  <div className="font-medium">{l.name}</div>
                  {l.company && <div className="text-xs text-muted-foreground">{l.company}</div>}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {EUR.format(Number(l.potential_monthly_value ?? 0))}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                  {l.target_start_date ? (
                    monthLabel(new Date(l.target_start_date))
                  ) : (
                    <Badge variant="outline" className="text-[10px]">geen datum</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
