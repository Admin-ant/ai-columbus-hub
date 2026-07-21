import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  TrendingUp,
  Hourglass,
  AlertCircle,
  AlertTriangle,
  Wallet,
  Users,
  FileSignature,
  Trophy,
  Info,
  Inbox,
  ArrowRight,
  CalendarDays,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PERIODS,
  periodRange,
  type PeriodKey,
} from "@/lib/dashboard-period";

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
  paidInPeriod: number;
  activeClients: number;
  activeContracts: number;
  winRate: number;
  wonCount: number;
  lostCount: number;
  newLeads: number;
  upcomingAppointments: number;
  todayAppointments: number;
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
  paidInPeriod: 0,
  activeClients: 0,
  activeContracts: 0,
  winRate: 0,
  wonCount: 0,
  lostCount: 0,
  newLeads: 0,
  upcomingAppointments: 0,
  todayAppointments: 0,
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

export function DashboardOverview({
  organizationId,
  period,
  onPeriodChange,
}: {
  organizationId: string | null;
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
}) {
  const [k, setK] = useState<Kpis>(EMPTY);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => periodRange(period), [period]);


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
      const fromIso = range.from ? range.from.toISOString() : "1970-01-01T00:00:00Z";
      const fromDate = range.from ? range.from.toISOString().slice(0, 10) : "1970-01-01";
      const monthsBack = Math.max(range.months, 6) - 1;
      const chartStart = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1)
        .toISOString()
        .slice(0, 10);

      const nowIso = now.toISOString();
      const endOfTodayIso = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
      ).toISOString();

      const [
        leadsRes,
        invRes,
        paidRes,
        clientsRes,
        contractsRes,
        wonRes,
        lostRes,
        newLeadsRes,
        stageRes,
        upcomingApptRes,
        todayApptRes,
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
          .gte("paid_at", chartStart),
        supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId),
        supabase
          .from("contracts")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("status", "active"),
        range.from
          ? supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", organizationId)
              .in("stage", ["gewonnen", "klant"])
              .gte("updated_at", fromIso)
          : supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", organizationId)
              .in("stage", ["gewonnen", "klant"]),
        range.from
          ? supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", organizationId)
              .eq("stage", "verloren")
              .gte("updated_at", fromIso)
          : supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", organizationId)
              .eq("stage", "verloren"),
        range.from
          ? supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", organizationId)
              .gte("created_at", fromIso)
          : supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", organizationId),
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

      let paidInPeriod = 0;
      const chartMonths = Math.max(range.months, 6);
      const monthly: { label: string; omzet: number; key: string }[] = [];
      for (let i = chartMonths - 1; i >= 0; i--) {
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
        const paidAt = (i.paid_at ?? i.issue_date ?? "").slice(0, 10);
        const bucketKey = paidAt.slice(0, 7);
        const bucket = monthly.find((m) => m.key === bucketKey);
        if (bucket) bucket.omzet += cents;
        if (!range.from || paidAt >= fromDate) {
          paidInPeriod += cents;
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
        paidInPeriod,
        activeClients: clientsRes.count ?? 0,
        activeContracts: contractsRes.count ?? 0,
        winRate,
        wonCount,
        lostCount,
        newLeads: newLeadsRes.count ?? 0,
        stageCounts,
        monthly: monthly.map(({ label, omzet }) => ({ label, omzet })),
      });
      setLoading(false);
    })();
  }, [organizationId, period, range]);

  const totalStage = Object.values(k.stageCounts).reduce((a, b) => a + b, 0);
  const stageEntries = Object.entries(k.stageCounts)
    .filter(([s]) => s !== "verloren")
    .sort((a, b) => b[1] - a[1]);

  const hasAnyData =
    k.mrr > 0 ||
    k.pipeline > 0 ||
    k.openInvoices > 0 ||
    k.overdue > 0 ||
    k.paidInPeriod > 0 ||
    k.activeContracts > 0 ||
    k.newLeads > 0 ||
    totalStage > 0;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        {/* Header + period filter */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Overzicht</h2>
            <p className="text-xs text-muted-foreground">
              Periode: {range.label}
            </p>
          </div>
          <Select value={period} onValueChange={(v) => onPeriodChange(v as PeriodKey)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Empty state */}
        {!loading && !hasAnyData ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card p-12 text-center">
            <Inbox className="mb-3 h-10 w-10 text-muted-foreground" />
            <div className="text-sm font-medium">Nog geen data om te tonen</div>
            <div className="mt-1 max-w-sm text-xs text-muted-foreground">
              Voeg leads, klanten, contracten of facturen toe. De KPI's verschijnen zodra er activiteit is.
            </div>
          </div>
        ) : (
          <>
            {/* Primaire KPI's */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                metric="mrr"
                period={period}
                label="Maandomzet (MRR)"
                value={EUR2.format(k.mrr)}
                icon={TrendingUp}
                tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                loading={loading}
                info="Som van 'potential_monthly_value' van alle leads met stage 'klant' óf met een target-startdatum die vandaag of eerder ligt. Verloren leads tellen niet mee. Momentopname — periodefilter beïnvloedt dit niet."
              />
              <KpiCard
                metric="pipeline"
                period={period}
                label="Pijplijn / maand"
                value={EUR2.format(k.pipeline)}
                icon={Hourglass}
                tone="bg-blue-500/10 text-blue-600 dark:text-blue-400"
                loading={loading}
                info="Som van maandwaarde van leads die nog niet 'klant' zijn en waarvan de startdatum in de toekomst ligt (of ontbreekt). Momentopname."
              />
              <KpiCard
                metric="open"
                period={period}
                label="Openstaand"
                value={EUR2.format(k.openInvoices)}
                sub={`${k.openCount} factu${k.openCount === 1 ? "ur" : "ren"}`}
                icon={AlertCircle}
                tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                loading={loading}
                info="Totaal van facturen met status 'draft' of 'sent' waarvan de vervaldatum nog niet is verstreken. Momentopname."
              />
              <KpiCard
                metric="overdue"
                period={period}
                label="Achterstallig"
                value={EUR2.format(k.overdue)}
                sub={`${k.overdueCount} factu${k.overdueCount === 1 ? "ur" : "ren"}`}
                icon={AlertTriangle}
                tone="bg-red-500/10 text-red-600 dark:text-red-400"
                loading={loading}
                info="Facturen met status 'overdue' of met een vervaldatum vóór vandaag (behalve concepten). Momentopname."
              />
            </div>

            {/* Secundaire KPI's — periode-afhankelijk */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                metric="paid"
                period={period}
                label={`Betaald (${range.label})`}
                value={EUR2.format(k.paidInPeriod)}
                icon={Wallet}
                tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                loading={loading}
                info={`Som van facturen met status 'paid' waarvan de betaaldatum binnen '${range.label}' valt.`}
              />
              <KpiCard
                metric="contracts"
                period={period}
                label="Actieve contracten"
                value={String(k.activeContracts)}
                sub={`${k.activeClients} klanten`}
                icon={FileSignature}
                tone="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                loading={loading}
                info="Aantal contracten met status 'active'. Momentopname — periodefilter beïnvloedt dit niet."
              />
              <KpiCard
                metric="leads"
                period={period}
                label={`Nieuwe leads (${range.label})`}
                value={String(k.newLeads)}
                icon={Users}
                tone="bg-sky-500/10 text-sky-600 dark:text-sky-400"
                loading={loading}
                info={`Aantal leads aangemaakt binnen '${range.label}'.`}
              />
              <KpiCard
                metric="winrate"
                period={period}
                label={`Winrate (${range.label})`}
                value={`${k.winRate}%`}
                sub={`${k.wonCount} gewonnen · ${k.lostCount} verloren`}
                icon={Trophy}
                tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                loading={loading}
                info={`gewonnen / (gewonnen + verloren) × 100%. Gebaseerd op leads met stage 'gewonnen'/'klant' vs 'verloren', gewijzigd binnen '${range.label}'.`}
              />
            </div>

            {/* Charts */}
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-lg border bg-card p-4 lg:col-span-2">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Betaalde omzet</div>
                    <div className="text-xs text-muted-foreground">
                      Laatste {Math.max(range.months, 6)} maanden
                    </div>
                  </div>
                </div>
                <div className="h-56">
                  {loading ? (
                    <Skeleton className="h-full w-full" />
                  ) : k.monthly.every((m) => m.omzet === 0) ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Nog geen betaalde facturen in deze periode.
                    </div>
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
                        <RTooltip
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
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-4 w-full" />
                    ))}
                  </div>
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
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

export type KpiMetric =
  | "mrr"
  | "pipeline"
  | "open"
  | "overdue"
  | "paid"
  | "contracts"
  | "leads"
  | "winrate";

function KpiCard({
  metric,
  period,
  label,
  value,
  sub,
  icon: Icon,
  tone,
  loading,
  info,
}: {
  metric: KpiMetric;
  period: PeriodKey;
  label: string;
  value: string;
  sub?: string;
  icon: typeof TrendingUp;
  tone: string;
  loading: boolean;
  info?: string;
}) {
  return (
    <Link
      to="/kpi/$metric"
      params={{ metric }}
      search={{ period }}
      className="group block rounded-lg border bg-card p-4 text-left transition hover:border-primary/50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          {info && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Uitleg ${label}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="text-muted-foreground/60 transition hover:text-foreground"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                {info}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-md ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-2 h-7 w-24" />
          {sub !== undefined && <Skeleton className="mt-2 h-3 w-16" />}
        </>
      ) : (
        <>
          <div className="mt-2 flex items-center justify-between">
            <div className="text-2xl font-bold tabular-nums">{value}</div>
            <ArrowRight className="h-4 w-4 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-60" />
          </div>
          {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        </>
      )}
    </Link>
  );
}

