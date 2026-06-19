import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";

type Lead = Database["public"]["Tables"]["leads"]["Row"];

const EUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

function monthLabel(d: Date) {
  return d.toLocaleDateString("nl-NL", { month: "short", year: "2-digit" }).replace(".", "");
}
function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthlyPipelinePanel({ organizationId }: { organizationId: string | null }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

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

  const { running, upcoming, totalRunning, totalUpcoming } = useMemo(() => {
    const now = new Date();
    const currentKey = monthKey(now);
    const running: Lead[] = [];
    const upcoming: Lead[] = [];
    let totalRunning = 0;
    let totalUpcoming = 0;
    for (const l of leads) {
      if (l.stage === "verloren") continue;
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
  }, [leads]);

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
        <h2 className="text-base font-semibold">Maandelijkse omzetpijplijn</h2>
        <p className="text-xs text-muted-foreground">
          Klant · pot. waarde/maand · ingangsdatum
        </p>
      </div>

      <Section
        title="Wat er nu loopt"
        accent="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        rows={running}
        total={totalRunning}
        emptyText="Nog geen lopende contracten met maandwaarde."
      />
      <Section
        title="Wat er aan komt"
        accent="bg-blue-500/10 text-blue-700 dark:text-blue-300"
        rows={upcoming}
        total={totalUpcoming}
        emptyText="Geen geplande pijplijn."
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
