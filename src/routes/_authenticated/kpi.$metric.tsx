import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PERIODS,
  periodRange,
  isValidPeriod,
  type PeriodKey,
} from "@/lib/dashboard-period";

const METRIC_KEYS = [
  "mrr",
  "pipeline",
  "open",
  "overdue",
  "paid",
  "contracts",
  "leads",
  "winrate",
] as const;
type Metric = (typeof METRIC_KEYS)[number];

const META: Record<Metric, { title: string; definition: string }> = {
  mrr: {
    title: "Maandomzet (MRR)",
    definition:
      "Alle leads met stage 'klant' óf een target-startdatum ≤ vandaag. Verloren leads uitgesloten.",
  },
  pipeline: {
    title: "Pijplijn / maand",
    definition:
      "Leads die nog geen klant zijn en waarvan de startdatum in de toekomst ligt (of ontbreekt).",
  },
  open: {
    title: "Openstaande facturen",
    definition:
      "Facturen met status 'draft' of 'sent' waarvan de vervaldatum nog niet verstreken is.",
  },
  overdue: {
    title: "Achterstallige facturen",
    definition:
      "Facturen met status 'overdue' of vervaldatum vóór vandaag (behalve concepten).",
  },
  paid: {
    title: "Betaalde facturen",
    definition: "Facturen met status 'paid' waarvan betaaldatum binnen de periode valt.",
  },
  contracts: {
    title: "Actieve contracten",
    definition: "Contracten met status 'active'.",
  },
  leads: {
    title: "Nieuwe leads",
    definition: "Leads aangemaakt binnen de gekozen periode.",
  },
  winrate: {
    title: "Winrate",
    definition:
      "Leads met stage 'gewonnen'/'klant' vs 'verloren', gewijzigd binnen de periode.",
  },
};

export const Route = createFileRoute("/_authenticated/kpi/$metric")({
  validateSearch: (search: Record<string, unknown>): { period: PeriodKey } => {
    const p = search.period;
    return { period: isValidPeriod(p) ? p : "30d" };
  },
  beforeLoad: ({ params }) => {
    if (!(METRIC_KEYS as readonly string[]).includes(params.metric)) {
      throw notFound();
    }
  },
  head: ({ params }) => {
    const m = params.metric as Metric;
    return { meta: [{ title: `${META[m]?.title ?? "KPI"} — Detail` }] };
  },
  component: KpiDetailPage,
  errorComponent: ({ error }) => (
    <div className="rounded-lg border border-destructive bg-destructive/5 p-6 text-sm">
      Er ging iets mis: {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="rounded-lg border p-6 text-sm text-muted-foreground">
      Onbekende KPI.
    </div>
  ),
});

const EUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

type Row = {
  id: string;
  title: string;
  subtitle?: string;
  amount?: string;
  date?: string;
  badge?: { label: string; tone?: string };
};

function KpiDetailPage() {
  const { metric } = Route.useParams();
  const { period } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { currentOrganizationId } = useWorkspace();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const m = metric as Metric;
  const range = useMemo(() => periodRange(period), [period]);
  const meta = META[m];

  useEffect(() => {
    if (!currentOrganizationId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const fromIso = range.from?.toISOString() ?? null;

      const list: Row[] = [];
      let sum = 0;
      let count = 0;

      if (m === "mrr" || m === "pipeline") {
        const { data } = await supabase
          .from("leads")
          .select("id,name,company,stage,potential_monthly_value,target_start_date")
          .eq("organization_id", currentOrganizationId)
          .gt("potential_monthly_value", 0);
        (data ?? []).forEach((l: any) => {
          if (l.stage === "verloren") return;
          const start = l.target_start_date as string | null;
          const startKey = start ? start.slice(0, 7) : null;
          const running = l.stage === "klant" || (startKey && startKey <= curKey);
          const match = m === "mrr" ? running : !running;
          if (!match) return;
          const v = Number(l.potential_monthly_value ?? 0);
          sum += v;
          count += 1;
          list.push({
            id: l.id,
            title: l.name ?? "—",
            subtitle: l.company ?? undefined,
            amount: EUR.format(v) + " /mnd",
            date: start ?? undefined,
            badge: { label: l.stage },
          });
        });
        setTotal(`${count} leads · ${EUR.format(sum)} /mnd`);
      } else if (m === "open" || m === "overdue") {
        const { data } = await supabase
          .from("invoices")
          .select("id,invoice_number,total_cents,amount,status,due_date,issue_date,client_id")
          .eq("organization_id", currentOrganizationId)
          .in("status", ["sent", "overdue", "draft"]);
        (data ?? []).forEach((i: any) => {
          const cents =
            i.total_cents != null ? Number(i.total_cents) / 100 : Number(i.amount ?? 0);
          const isOverdue =
            i.status === "overdue" ||
            (i.due_date && i.due_date < today && i.status !== "draft");
          const match = m === "overdue" ? isOverdue : !isOverdue;
          if (!match) return;
          sum += cents;
          count += 1;
          list.push({
            id: i.id,
            title: i.invoice_number ?? `Factuur ${i.id.slice(0, 8)}`,
            subtitle: i.due_date ? `Vervalt ${i.due_date}` : undefined,
            amount: EUR.format(cents),
            date: i.issue_date ?? undefined,
            badge: { label: i.status },
          });
        });
        setTotal(`${count} facturen · ${EUR.format(sum)}`);
      } else if (m === "paid") {
        const fromDate = range.from?.toISOString().slice(0, 10) ?? "1970-01-01";
        const { data } = await supabase
          .from("invoices")
          .select("id,invoice_number,total_cents,amount,paid_at,issue_date")
          .eq("organization_id", currentOrganizationId)
          .eq("status", "paid")
          .gte("paid_at", fromDate);
        (data ?? []).forEach((i: any) => {
          const cents =
            i.total_cents != null ? Number(i.total_cents) / 100 : Number(i.amount ?? 0);
          sum += cents;
          count += 1;
          list.push({
            id: i.id,
            title: i.invoice_number ?? `Factuur ${i.id.slice(0, 8)}`,
            subtitle: i.paid_at ? `Betaald ${i.paid_at.slice(0, 10)}` : undefined,
            amount: EUR.format(cents),
            date: i.paid_at ?? i.issue_date ?? undefined,
            badge: { label: "paid" },
          });
        });
        setTotal(`${count} facturen · ${EUR.format(sum)}`);
      } else if (m === "contracts") {
        const { data } = await supabase
          .from("contracts")
          .select("id,contract_number,status,start_date,end_date,monthly_amount_cents,client_id")
          .eq("organization_id", currentOrganizationId)
          .eq("status", "active");
        (data ?? []).forEach((c: any) => {
          const cents = Number(c.monthly_amount_cents ?? 0) / 100;
          sum += cents;
          count += 1;
          list.push({
            id: c.id,
            title: c.contract_number ?? `Contract ${c.id.slice(0, 8)}`,
            subtitle: c.start_date ? `Vanaf ${c.start_date}` : undefined,
            amount: cents ? `${EUR.format(cents)} /mnd` : undefined,
            date: c.start_date ?? undefined,
            badge: { label: c.status },
          });
        });
        setTotal(`${count} contracten · ${EUR.format(sum)} /mnd`);
      } else if (m === "leads") {
        let q = supabase
          .from("leads")
          .select("id,name,company,stage,created_at,potential_monthly_value")
          .eq("organization_id", currentOrganizationId);
        if (fromIso) q = q.gte("created_at", fromIso);
        const { data } = await q;
        (data ?? []).forEach((l: any) => {
          count += 1;
          const v = Number(l.potential_monthly_value ?? 0);
          if (v) sum += v;
          list.push({
            id: l.id,
            title: l.name ?? "—",
            subtitle: l.company ?? undefined,
            amount: v ? `${EUR.format(v)} /mnd` : undefined,
            date: l.created_at ?? undefined,
            badge: { label: l.stage },
          });
        });
        setTotal(`${count} nieuwe leads${sum ? ` · ${EUR.format(sum)} /mnd potentieel` : ""}`);
      } else if (m === "winrate") {
        let q = supabase
          .from("leads")
          .select("id,name,company,stage,updated_at,potential_monthly_value")
          .eq("organization_id", currentOrganizationId)
          .in("stage", ["gewonnen", "klant", "verloren"]);
        if (fromIso) q = q.gte("updated_at", fromIso);
        const { data } = await q;
        let won = 0;
        let lost = 0;
        (data ?? []).forEach((l: any) => {
          const isWon = l.stage === "gewonnen" || l.stage === "klant";
          if (isWon) won += 1;
          else lost += 1;
          count += 1;
          list.push({
            id: l.id,
            title: l.name ?? "—",
            subtitle: l.company ?? undefined,
            date: l.updated_at ?? undefined,
            badge: {
              label: l.stage,
              tone: isWon ? "bg-emerald-500/15 text-emerald-700" : "bg-red-500/15 text-red-700",
            },
          });
        });
        const rate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;
        setTotal(`${count} leads · winrate ${rate}% (${won} gewonnen · ${lost} verloren)`);
      }

      // Sort by date desc when present
      list.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
      setRows(list);
      setLoading(false);
    })();
  }, [currentOrganizationId, m, period, range]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/"
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Terug naar overzicht
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{meta.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{meta.definition}</p>
        </div>
        <Select
          value={period}
          onValueChange={(v) =>
            navigate({ search: { period: v as PeriodKey }, replace: true })
          }
        >
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

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-medium">
            {loading ? "Laden…" : total || "Geen resultaten"}
          </div>
          <div className="text-xs text-muted-foreground">Periode: {range.label}</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Data laden…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Geen onderliggende records voor deze periode.
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.title}</div>
                  {r.subtitle && (
                    <div className="truncate text-xs text-muted-foreground">{r.subtitle}</div>
                  )}
                </div>
                {r.badge && (
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-[10px] ${r.badge.tone ?? ""}`}
                  >
                    {r.badge.label}
                  </Badge>
                )}
                {r.amount && (
                  <div className="shrink-0 text-right font-semibold tabular-nums">{r.amount}</div>
                )}
                {r.date && (
                  <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                    {r.date.slice(0, 10)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
