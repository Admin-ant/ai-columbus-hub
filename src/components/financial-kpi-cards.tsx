import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { TrendingUp, Hourglass, AlertCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const EUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

export function FinancialKpiCards({ organizationId }: { organizationId: string | null }) {
  const [mrr, setMrr] = useState(0);
  const [pipeline, setPipeline] = useState(0);
  const [overdue, setOverdue] = useState(0);
  const [unpaid, setUnpaid] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) {
      setMrr(0); setPipeline(0); setOverdue(0); setUnpaid(0);
      setOverdueCount(0); setUnpaidCount(0); setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const [leadsRes, invRes] = await Promise.all([
        supabase.from("leads")
          .select("stage,potential_monthly_value,target_start_date")
          .eq("organization_id", organizationId)
          .gt("potential_monthly_value", 0),
        supabase.from("invoices")
          .select("status,total_cents,amount,due_date")
          .eq("organization_id", organizationId)
          .in("status", ["sent", "overdue", "draft"]),
      ]);
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      let m = 0, p = 0;
      (leadsRes.data ?? []).forEach((l: any) => {
        if (l.stage === "verloren") return;
        const v = Number(l.potential_monthly_value ?? 0);
        const startKey = l.target_start_date ? `${l.target_start_date.slice(0, 7)}` : null;
        const running = l.stage === "klant" || (startKey && startKey <= curKey);
        if (running) m += v;
        else p += v;
      });
      let od = 0, un = 0, odc = 0, unc = 0;
      (invRes.data ?? []).forEach((i: any) => {
        const cents = i.total_cents != null ? Number(i.total_cents) / 100 : Number(i.amount ?? 0);
        const isOverdue = i.status === "overdue" || (i.due_date && i.due_date < today && i.status !== "draft");
        if (isOverdue) { od += cents; odc += 1; }
        else { un += cents; unc += 1; }
      });
      setMrr(m); setPipeline(p);
      setOverdue(od); setUnpaid(un);
      setOverdueCount(odc); setUnpaidCount(unc);
      setLoading(false);
    })();
  }, [organizationId]);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="Actuele Maandomzet (MRR)"
        value={EUR.format(mrr)}
        icon={TrendingUp}
        tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        loading={loading}
        to="/leads"
      />
      <KpiCard
        label="Geprojecteerde Pijplijn"
        value={EUR.format(pipeline)}
        icon={Hourglass}
        tone="bg-blue-500/10 text-blue-600 dark:text-blue-400"
        loading={loading}
        to="/leads"
      />
      <KpiCard
        label="Openstaand (nog binnen termijn)"
        value={EUR.format(unpaid)}
        sub={`${unpaidCount} factu${unpaidCount === 1 ? "ur" : "ren"}`}
        icon={AlertCircle}
        tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        loading={loading}
        to="/invoices"
        search={{ filter: "open" as const }}
      />
      <KpiCard
        label="Achterstallig (vervallen)"
        value={EUR.format(overdue)}
        sub={`${overdueCount} factu${overdueCount === 1 ? "ur" : "ren"}`}
        icon={AlertTriangle}
        tone="bg-red-500/10 text-red-600 dark:text-red-400"
        loading={loading}
        to="/invoices"
        search={{ filter: "reminder" as const }}
      />
    </div>
  );
}

function KpiCard({
  label, value, sub, icon: Icon, tone, loading, to, search,
}: {
  label: string; value: string; sub?: string; icon: typeof TrendingUp; tone: string; loading: boolean;
  to?: string; search?: Record<string, string>;
}) {
  const inner = (
    <div className="rounded-lg border bg-card p-4 h-full transition-colors hover:border-brand hover:bg-accent/40 cursor-pointer">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-md ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">
        {loading ? "…" : value}
      </div>
      {sub && !loading && (
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      )}
    </div>
  );
  if (!to) return inner;
  return (
    <Link to={to} search={search as never} className="block">
      {inner}
    </Link>
  );
}

function KpiCard({
  label, value, sub, icon: Icon, tone, loading,
}: {
  label: string; value: string; sub?: string; icon: typeof TrendingUp; tone: string; loading: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-md ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">
        {loading ? "…" : value}
      </div>
      {sub && !loading && (
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}
