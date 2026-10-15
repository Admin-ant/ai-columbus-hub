import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Lock, Unlock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/currency";

interface Period { id: string; year: number; quarter: number; closed_at: string; summary: Record<string, number> }
interface Sum { revenue: number; vatOut: number; costs: number; vatIn: number; invoices: number; expenses: number }

const quarterRange = (y: number, q: number) => {
  const from = `${y}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;
  const endMonth = q * 3;
  const last = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
  return { from, to: `${y}-${String(endMonth).padStart(2, "0")}-${last}` };
};

export function QuarterCloseTab({ orgId, userId }: { orgId: string; userId: string | null }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [periods, setPeriods] = useState<Period[]>([]);
  const [sums, setSums] = useState<Record<number, Sum>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const from = `${year}-01-01`, to = `${year}-12-31`;
    const [p, inv, exp] = await Promise.all([
      supabase.from("accounting_periods").select("*").eq("organization_id", orgId).eq("year", year),
      supabase.from("invoices").select("issue_date,subtotal_cents,vat_cents,status")
        .eq("organization_id", orgId).gte("issue_date", from).lte("issue_date", to),
      supabase.from("expenses").select("expense_date,amount_cents,vat_cents")
        .eq("organization_id", orgId).gte("expense_date", from).lte("expense_date", to),
    ]);
    const s: Record<number, Sum> = {};
    for (let q = 1; q <= 4; q++) s[q] = { revenue: 0, vatOut: 0, costs: 0, vatIn: 0, invoices: 0, expenses: 0 };
    const qOf = (d: string) => Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1;
    for (const i of inv.data ?? []) {
      if (i.status === "draft" || i.status === "cancelled") continue;
      const b = s[qOf(i.issue_date)];
      b.revenue += i.subtotal_cents ?? 0; b.vatOut += i.vat_cents ?? 0; b.invoices++;
    }
    for (const e of exp.data ?? []) {
      const b = s[qOf(e.expense_date)];
      b.costs += e.amount_cents ?? 0; b.vatIn += e.vat_cents ?? 0; b.expenses++;
    }
    setSums(s);
    setPeriods((p.data ?? []) as unknown as Period[]);
    setLoading(false);
  }, [orgId, year]);

  useEffect(() => { void load(); }, [load]);

  const closedMap = useMemo(() => new Map(periods.map((p) => [p.quarter, p])), [periods]);

  const close = async (q: number) => {
    if (!userId) return;
    const { from, to } = quarterRange(year, q);
    if (!confirm(`Q${q} ${year} afsluiten (${from} t/m ${to})? Daarna kun je facturen, uitgaven en boekingen in dit kwartaal niet meer wijzigen.`)) return;
    setBusy(q);
    const { error } = await supabase.from("accounting_periods").insert({
      organization_id: orgId, year, quarter: q, closed_by: userId, summary: sums[q] as never,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Q${q} ${year} is afgesloten`);
    void load();
  };

  const reopen = async (q: number) => {
    const p = closedMap.get(q);
    if (!p || !confirm(`Q${q} ${year} heropenen? Wijzigingen zijn dan weer mogelijk.`)) return;
    setBusy(q);
    const { error } = await supabase.from("accounting_periods").delete().eq("id", p.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Q${q} ${year} is heropend`);
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setYear(year - 1)}>‹</Button>
        <span className="min-w-16 text-center font-semibold">{year}</span>
        <Button variant="outline" size="sm" onClick={() => setYear(year + 1)}>›</Button>
        <p className="ml-2 text-sm text-muted-foreground">
          Sluit een kwartaal af als alles geboekt is. Daarna ligt alles in die periode vast.
        </p>
      </div>
      {loading ? (
        <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((q) => {
            const p = closedMap.get(q);
            const s = (p?.summary && Object.keys(p.summary).length ? p.summary : sums[q]) as Sum;
            const vatDue = s.vatOut - s.vatIn;
            return (
              <Card key={q}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">Q{q} {year}</CardTitle>
                  {p ? <Badge><Lock className="mr-1 h-3 w-3" />Afgesloten</Badge> : <Badge variant="outline">Open</Badge>}
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <Row label={`Omzet (${s.invoices} facturen)`} v={s.revenue} />
                  <Row label="BTW ontvangen" v={s.vatOut} />
                  <Row label={`Kosten (${s.expenses} uitgaven)`} v={s.costs} />
                  <Row label="BTW betaald" v={s.vatIn} />
                  <div className="border-t pt-1 font-semibold">
                    <Row label={vatDue >= 0 ? "BTW af te dragen" : "BTW terug te vragen"} v={Math.abs(vatDue)} />
                  </div>
                  {p && <p className="pt-1 text-xs text-muted-foreground">Afgesloten op {new Date(p.closed_at).toLocaleDateString("nl-NL")}</p>}
                  <div className="pt-2">
                    {p ? (
                      <Button size="sm" variant="outline" className="w-full" disabled={busy === q} onClick={() => reopen(q)}>
                        <Unlock className="mr-1 h-3.5 w-3.5" /> Heropenen
                      </Button>
                    ) : (
                      <Button size="sm" className="w-full" disabled={busy === q} onClick={() => close(q)}>
                        <Lock className="mr-1 h-3.5 w-3.5" /> Kwartaal afsluiten
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ label, v }: { label: string; v: number }) {
  return <div className="flex justify-between gap-2"><span className="text-muted-foreground">{label}</span><span>{formatCents(v)}</span></div>;
}
