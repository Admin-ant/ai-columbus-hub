import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CreditCard,
  Loader2,
  RefreshCw,
  Download,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  Scale,
  Webhook,
} from "lucide-react";

import { listMolliePayments, refreshMollieInvoiceStatus } from "@/lib/mollie-invoice.functions";
import { formatCents } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PERIODS, periodRange, isValidPeriod, type PeriodKey } from "@/lib/dashboard-period";

export const Route = createFileRoute("/_authenticated/betalingen")({
  head: () => ({
    meta: [
      { title: "Betalingen — Mollie-overzicht" },
      {
        name: "description",
        content:
          "Overzicht van alle Mollie-betaallinks en hun status: open, in behandeling, betaald of verlopen.",
      },
      { property: "og:title", content: "Betalingen — Mollie-overzicht" },
      {
        property: "og:description",
        content:
          "Overzicht van alle Mollie-betaallinks en hun status: open, in behandeling, betaald of verlopen.",
      },
    ],
  }),
  component: BetalingenPage,
});

type Payment = {
  id: string;
  invoice_number: string;
  client_name: string | null;
  total_cents: number | null;
  currency: string | null;
  status: string;
  paid_at: string | null;
  mollie_payment_id: string | null;
  mollie_checkout_url: string | null;
  preferred_payment_method: string | null;
  created_at: string;
  last_status: string | null;
  last_method: string | null;
  last_event_at: string | null;
};

function effectiveStatus(p: Payment): string {
  if (p.status === "paid" || p.last_status === "paid") return "paid";
  return p.last_status ?? "open";
}

function statusMeta(status: string) {
  switch (status) {
    case "paid":
      return { label: "Betaald", className: "bg-green-100 text-green-800 border-green-200" };
    case "open":
    case "pending":
      return { label: status === "open" ? "Open" : "In behandeling", className: "bg-amber-100 text-amber-800 border-amber-200" };
    case "expired":
      return { label: "Verlopen", className: "bg-red-100 text-red-800 border-red-200" };
    case "failed":
    case "canceled":
      return { label: status === "failed" ? "Mislukt" : "Geannuleerd", className: "bg-red-100 text-red-800 border-red-200" };
    default:
      return { label: status, className: "bg-muted text-muted-foreground" };
  }
}

function BetalingenPage() {
  const queryClient = useQueryClient();
  const fetchPayments = useServerFn(listMolliePayments);
  const refreshOne = useServerFn(refreshMollieInvoiceStatus);

  const [period, setPeriod] = useState<PeriodKey>("all" as PeriodKey);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["mollie-payments"],
    queryFn: () => fetchPayments(),
  });
  const payments = useMemo(() => (data?.payments ?? []) as Payment[], [data]);

  const filtered = useMemo(() => {
    const { from } = periodRange(period);
    const term = search.trim().toLowerCase();
    return payments.filter((p) => {
      const eff = effectiveStatus(p);
      if (statusFilter !== "all" && eff !== statusFilter) return false;
      if (from && new Date(p.created_at) < from) return false;
      if (term) {
        const hay = `${p.invoice_number} ${p.client_name ?? ""} ${p.mollie_payment_id ?? ""}`;
        if (!hay.toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [payments, period, statusFilter, search]);

  const kpis = useMemo(() => {
    const inPeriod = filtered;
    const paidCents = inPeriod
      .filter((p) => effectiveStatus(p) === "paid")
      .reduce((s, p) => s + (p.total_cents ?? 0), 0);
    const open = inPeriod.filter((p) => ["open", "pending"].includes(effectiveStatus(p)));
    const openCents = open.reduce((s, p) => s + (p.total_cents ?? 0), 0);
    const expired = inPeriod.filter((p) =>
      ["expired", "failed", "canceled"].includes(effectiveStatus(p)),
    ).length;
    return { paidCents, openCents, openCount: open.length, expired };
  }, [filtered]);

  async function refreshAll() {
    const targets = payments.filter((p) =>
      ["open", "pending"].includes(effectiveStatus(p)),
    );
    if (targets.length === 0) {
      toast.info("Geen openstaande betalingen om te verversen.");
      return;
    }
    setRefreshing(true);
    let changed = 0;
    let failed = 0;
    await Promise.all(
      targets.map(async (p) => {
        try {
          const r = (await refreshOne({ data: { invoice_id: p.id } })) as {
            status: string | null;
          };
          if (r.status && r.status !== effectiveStatus(p)) changed += 1;
        } catch {
          failed += 1;
        }
      }),
    );
    setRefreshing(false);
    await queryClient.invalidateQueries({ queryKey: ["mollie-payments"] });
    if (failed > 0) toast.error(`${failed} betaling(en) konden niet ververst worden.`);
    else if (changed > 0) toast.success(`${changed} betaling(en) hebben een nieuwe status.`);
    else toast.success("Alle statussen zijn actueel.");
  }

  function exportCsv() {
    const head = ["Factuur", "Klant", "Bedrag", "Status", "Methode", "Aangemaakt", "Betaald op", "Mollie-ID"];
    const lines = filtered.map((p) =>
      [
        p.invoice_number,
        p.client_name ?? "",
        formatCents(p.total_cents ?? 0, "nl", p.currency ?? "EUR"),
        statusMeta(effectiveStatus(p)).label,
        p.last_method ?? p.preferred_payment_method ?? "",
        new Date(p.created_at).toLocaleString("nl-NL"),
        p.paid_at ? new Date(p.paid_at).toLocaleString("nl-NL") : "",
        p.mollie_payment_id ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const blob = new Blob([[head.join(";"), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `betalingen-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-brand" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Betalingen</h1>
            <p className="text-sm text-muted-foreground">
              Alle Mollie-betaallinks en hun actuele status op één plek.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/betalingen/reconciliatie">
              <Scale className="mr-2 h-4 w-4" /> Reconciliatie
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/betalingen/webhooks">
              <Webhook className="mr-2 h-4 w-4" /> Webhook-events
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button size="sm" onClick={refreshAll} disabled={refreshing || isLoading}>
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Statussen verversen
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Betaald
          </div>
          <div className="mt-1 text-xl font-semibold">{formatCents(kpis.paidCents)}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-amber-600" /> Openstaand bedrag
          </div>
          <div className="mt-1 text-xl font-semibold">{formatCents(kpis.openCents)}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-amber-600" /> Openstaande links
          </div>
          <div className="mt-1 text-xl font-semibold">{kpis.openCount}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <XCircle className="h-3.5 w-3.5 text-red-600" /> Verlopen / mislukt
          </div>
          <div className="mt-1 text-xl font-semibold">{kpis.expired}</div>
        </div>
      </div>

      <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Periode</Label>
          <Select value={period} onValueChange={(v) => isValidPeriod(v) && setPeriod(v)}>
            <SelectTrigger>
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
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle statussen</SelectItem>
              <SelectItem value="paid">Betaald</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="pending">In behandeling</SelectItem>
              <SelectItem value="expired">Verlopen</SelectItem>
              <SelectItem value="failed">Mislukt</SelectItem>
              <SelectItem value="canceled">Geannuleerd</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-search">Zoeken</Label>
          <Input
            id="pay-search"
            value={search}
            placeholder="Factuur, klant of Mollie-ID…"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Betalingen laden…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Geen betalingen gevonden voor deze filters.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Factuur</TableHead>
                <TableHead>Klant</TableHead>
                <TableHead className="text-right">Bedrag</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Methode</TableHead>
                <TableHead>Aangemaakt</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const eff = effectiveStatus(p);
                const meta = statusMeta(eff);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        to="/betalingen/$invoiceId"
                        params={{ invoiceId: p.id }}
                        className="font-medium hover:underline"
                      >
                        {p.invoice_number}
                      </Link>
                    </TableCell>
                    <TableCell>{p.client_name ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {formatCents(p.total_cents ?? 0, "nl", p.currency ?? "EUR")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={meta.className}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.last_method ?? p.preferred_payment_method ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString("nl-NL")}
                    </TableCell>
                    <TableCell>
                      {p.mollie_checkout_url && eff !== "paid" && (
                        <a
                          href={p.mollie_checkout_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          title="Betaallink openen"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
