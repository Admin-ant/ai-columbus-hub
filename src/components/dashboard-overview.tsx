import { useEffect, useState } from "react";
import {
  TrendingUp,
  Hourglass,
  AlertCircle,
  AlertTriangle,
  Wallet,
  Users,
  FileSignature,
  Trophy,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

const EUR = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const EUR2 = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
});

type Kpis = {
  mrr: number;
  pipeline: number;
  openInvoices: number;
  openCount: number;
  overdue: number;
  overdueCount: number;
  paidThisMonth: number;
  activeClients: number;
  activeContracts: number;
  winRate: number;
  newLeads30d: number;
  stageCounts: Record<string, number>;
  monthly: { label: string; omzet: number }[];
};

const EMPTY: Kpis = {
  mrr: 0,
  pipeline: 0,
  openInvoices: 0,
  openCount: 0,
  overdue: 0,
  overdueCount: 0,
  paidThisMonth: 0,
  activeClients: 0,
  activeContracts: 0,
  winRate: 0,
  newLeads30d: 0,
  stageCounts: {},
  monthly: [],
};

const STAGE_LABEL: Record<string, string> = {
  nieuwe: "Nieuw",
  contact_opgenomen: "Contact",
  in_contact: "In contact",
  op_afspraak: "Afspraak",
  offerte_verzonden: "Offerte",
  in_afwachting: "Afwachting",
  even_on_hold: "On hold",
  gewonnen: "Gewonnen",
  klant: "Klant",
  verloren: "Verloren",
};

const STAGE_TONE: Record<string, string> = {
  nieuwe: "bg-slate-400",
  contact_opgenomen: "bg-blue-400",
  in_contact: "bg-blue-500",
  op_afspraak: "bg-indigo-500",
  offerte_verzonden: "bg-violet-500",
  in_afwachting: "bg-amber-500",
  even_on_hold: "bg-orange-500",
  gewonnen: "bg-emerald-500",
  klant: "bg-emerald-600",
  verloren: "bg-red-500",
};

export function DashboardOverview({ organizationId }: { organizationId: string | null }) {
  const [k, setK] = useState<Kpis>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) {
      setK(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
      const since30 = new Date(now.getTime() - 30 * 864e5).toISOString();
      const since90 = new Date(now.getTime() - 90 * 864e5).toISOString();
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
        .toISOString()
        .slice(0, 10);

      const [
        leadsRes,
        invRes,
        paidRes,
        clientsRes,
        contractsRes,
        wonRes,
        lostRes,
        new30Res,
        stageRes,
      ] = await Promise.all([
        supabase
          .from("leads")
          .select("stage,potential_monthly_value,target_start_date")
          .eq("organization_id", organizationId)
          .gt("potential_monthly_value", 0),
        supabase
          .from("invoices")
          .select("status,total_cents,amount,due_date")
          .eq("organization_id", organizationId)
          .in("status", ["sent", "overdue", "draft"]),
        supabase
          .from("invoices")
          .select("total_cents,amount,paid_at,issue_date")
          .eq("organization_id", organizationId)
          .eq("status", "paid")
          .gte("paid_at", sixMonthsAgo),
        supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId),
        supabase
          .from("contracts")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("status", "active"),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .in("stage", ["gewonnen", "klant"])
          .gte("updated_at", since90),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("stage", "verloren")
          .gte("updated_at", since90),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .gte("created_at", since30),
        supabase
          .from("leads")
          .select("stage")
          .eq("organization_id", organizationId),
      ]);

      let mrr = 0;
      let pipeline = 0;
      (leadsRes.data ?? []).forEach((l: any) => {
        if (l.stage === "verloren") return;
        const v = Number(l.potential_monthly_value ?? 0);
        const startKey = l.target_start_date ? l.target_start_date.slice(0, 7) : null;
        const running = l.stage === "klant" || (startKey && startKey <= curKey);
        if (running) mrr += v;
        else pipeline += v;
      });

      let openInv = 0;
      let openCount = 0;
      let overdue = 0;
      let overdueCount = 0;
      (invRes.data ?? []).forEach((i: any) => {
        const cents =
          i.total_cents != null ? Number(i.total_cents) / 100 : Number(i.amount ?? 0);
        const isOverdue =
          i.status === "overdue" ||
          (i.due_date && i.due_date < today && i.status !== "draft");
        if (isOverdue) {
          overdue += cents;
          overdueCount += 1;
        } else {
          openInv += cents;
          openCount += 1;
        }
      });

      // Betaalde omzet deze maand
      let paidThisMonth = 0;
      // Bar chart: laatste 6 maanden
      const monthly: { label: string; omzet: number; key: string }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d
          .toLocaleDateString("nl-NL", { month: "short" })
          .replace(".", "");
        monthly.push({ label, key, omzet: 0 });
      }
      (paidRes.data ?? []).forEach((i: any) => {
        const cents =
          i.total_cents != null ? Number(i.total_cents) / 100 : Number(i.amount ?? 0);
        const when = (i.paid_at ?? i.issue_date ?? "").slice(0, 7);
        const bucket = monthly.find((m) => m.key === when);
        if (bucket) bucket.omzet += cents;
        if (when === curKey || (i.paid_at && i.paid_at >= monthStart)) {
          paidThisMonth += cents;
        }
      });

      const wonCount = wonRes.count ?? 0;
      const lostCount = lostRes.count ?? 0;
      const winRate =
        wonCount + lostCount > 0
          ? Math.round((wonCount / (wonCount + lostCount)) * 100)
          : 0;

      const stageCounts: Record<string, number> = {};
      (stageRes.data ?? []).forEach((r: any) => {
        const s = r.stage ?? "nieuwe";
        stageCounts[s] = (stageCounts[s] ?? 0) + 1;
      });

      setK({
        mrr,
        pipeline,
        openInvoices: openInv,
        openCount,
        overdue,
        overdueCount,
        paidThisMonth,
        activeClients: clientsRes.count ?? 0,
        activeContracts: contractsRes.count ?? 0,
        winRate,
        newLeads30d: new30Res.count ?? 0,
        stageCounts,
        monthly: monthly.map(({ label, omzet }) => ({ label, omzet })),
      });
      setLoading(false);
    })();
  }, [organizationId]);

  const totalStage = Object.values(k.stageCounts).reduce((a, b) => a + b, 0);
  const stageEntries = Object.entries(k.stageCounts)
    .filter(([s]) => s !== "verloren")
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      {/* Primaire KPI's */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Maandomzet (MRR)"
          value={EUR2.format(k.mrr)}
          icon={TrendingUp}
          tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          loading={loading}
        />
        <KpiCard
          label="Pijplijn / maand"
          value={EUR2.format(k.pipeline)}
          icon={Hourglass}
          tone="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          loading={loading}
        />
        <KpiCard
          label="Openstaand"
          value={EUR2.format(k.openInvoices)}
          sub={`${k.openCount} factu${k.openCount === 1 ? "ur" : "ren"}`}
          icon={AlertCircle}
          tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          loading={loading}
        />
        <KpiCard
          label="Achterstallig"
          value={EUR2.format(k.overdue)}
          sub={`${k.overdueCount} factu${k.overdueCount === 1 ? "ur" : "ren"}`}
          icon={AlertTriangle}
          tone="bg-red-500/10 text-red-600 dark:text-red-400"
          loading={loading}
        />
      </div>

      {/* Secundaire KPI's */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Betaald deze maand"
          value={EUR2.format(k.paidThisMonth)}
          icon={Wallet}
          tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          loading={loading}
        />
        <KpiCard
          label="Actieve contracten"
          value={String(k.activeContracts)}
          sub={`${k.activeClients} klanten`}
          icon={FileSignature}
          tone="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
          loading={loading}
        />
        <KpiCard
          label="Nieuwe leads (30d)"
          value={String(k.newLeads30d)}
          icon={Users}
          tone="bg-sky-500/10 text-sky-600 dark:text-sky-400"
          loading={loading}
        />
        <KpiCard
          label="Winrate (90d)"
          value={`${k.winRate}%`}
          icon={Trophy}
          tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          loading={loading}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Betaalde omzet</div>
              <div className="text-xs text-muted-foreground">Laatste 6 maanden</div>
            </div>
          </div>
          <div className="h-56">
            {loading ? (
              <div className="h-full w-full animate-pulse rounded-md bg-muted" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={k.monthly} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `€${Math.round(v / 1000)}k` : `€${v}`)}
                  />
                  <Tooltip
                    formatter={(v: number) => EUR.format(v)}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="omzet" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3">
            <div className="text-sm font-medium">Leads per fase</div>
            <div className="text-xs text-muted-foreground">
              {totalStage} lead{totalStage === 1 ? "" : "s"} totaal
            </div>
          </div>
          {loading ? (
            <div className="h-48 animate-pulse rounded-md bg-muted" />
          ) : stageEntries.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nog geen leads.
            </div>
          ) : (
            <div className="space-y-2">
              {stageEntries.map(([stage, count]) => {
                const max = Math.max(...stageEntries.map((e) => e[1]));
                const pct = max > 0 ? (count / max) * 100 : 0;
                return (
                  <div key={stage} className="text-xs">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {STAGE_LABEL[stage] ?? stage}
                      </span>
                      <span className="font-medium tabular-nums">{count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full ${STAGE_TONE[stage] ?? "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof TrendingUp;
  tone: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-md ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">
        {loading ? "…" : value}
      </div>
      {sub && !loading && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
