import { useEffect, useState } from "react";
import { TrendingUp, Hourglass, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const EUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

export function FinancialKpiCards({ organizationId }: { organizationId: string | null }) {
  const [mrr, setMrr] = useState(0);
  const [pipeline, setPipeline] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) {
      setMrr(0); setPipeline(0); setOutstanding(0); setLoading(false);
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
          .select("status,total_cents,amount")
          .eq("organization_id", organizationId)
          .in("status", ["sent", "overdue", "draft"]),
      ]);
      const now = new Date();
      const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      let m = 0, p = 0;
      (leadsRes.data ?? []).forEach((l: any) => {
        if (l.stage === "verloren") return;
        const v = Number(l.potential_monthly_value ?? 0);
        const startKey = l.target_start_date
          ? `${l.target_start_date.slice(0, 7)}`
          : null;
        const running = l.stage === "klant" || (startKey && startKey <= curKey);
        if (running) m += v;
        else p += v;
      });
      let o = 0;
      (invRes.data ?? []).forEach((i: any) => {
        const cents = i.total_cents != null ? Number(i.total_cents) / 100 : Number(i.amount ?? 0);
        o += cents;
      });
      setMrr(m); setPipeline(p); setOutstanding(o); setLoading(false);
    })();
  }, [organizationId]);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <KpiCard
        label="Actuele Maandomzet (MRR)"
        value={EUR.format(mrr)}
        icon={TrendingUp}
        tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        loading={loading}
      />
      <KpiCard
        label="Geprojecteerde Pijplijn"
        value={EUR.format(pipeline)}
        icon={Hourglass}
        tone="bg-blue-500/10 text-blue-600 dark:text-blue-400"
        loading={loading}
      />
      <KpiCard
        label="Openstaand Factuursaldo"
        value={EUR.format(outstanding)}
        icon={AlertCircle}
        tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        loading={loading}
      />
    </div>
  );
}

function KpiCard({
  label, value, icon: Icon, tone, loading,
}: {
  label: string; value: string; icon: typeof TrendingUp; tone: string; loading: boolean;
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
    </div>
  );
}
