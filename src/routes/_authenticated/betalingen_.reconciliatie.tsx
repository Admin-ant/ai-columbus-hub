import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Loader2, RefreshCw, Scale } from "lucide-react";

import { getMollieReconciliation } from "@/lib/mollie-invoice.functions";
import { formatCents } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/betalingen_/reconciliatie")({
  head: () => ({
    meta: [
      { title: "Reconciliatie — Mollie vs. facturen" },
      {
        name: "description",
        content:
          "Vergelijk live Mollie-betaalstatussen met je interne factuurstatussen en zie direct welke verschillen aandacht nodig hebben.",
      },
      { property: "og:title", content: "Reconciliatie — Mollie vs. facturen" },
      {
        property: "og:description",
        content:
          "Vergelijk live Mollie-betaalstatussen met je interne factuurstatussen en markeer verschillen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReconciliatiePage,
});

const ISSUE_LABELS: Record<string, string> = {
  paid_at_mollie_not_internal: "Betaald bij Mollie, niet intern",
  paid_internal_not_at_mollie: "Intern betaald, niet bij Mollie",
  amount_mismatch: "Bedrag wijkt af",
  cancelled_but_paid: "Geannuleerd maar wel betaald",
  fetch_error: "Kon status niet ophalen",
};

type Row = {
  invoice_id: string;
  invoice_number: string;
  client_name: string | null;
  total_cents: number | null;
  currency: string | null;
  internal_status: string;
  mollie_payment_id: string | null;
  mollie_status: string | null;
  mollie_amount_cents: number | null;
  fetch_error: string | null;
  issues: string[];
};

function ReconciliatiePage() {
  const run = useServerFn(getMollieReconciliation);
  const [onlyIssues, setOnlyIssues] = useState(true);

  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["mollie-reconciliation"],
    queryFn: () => run({ data: { limit: 100 } }),
  });

  const rows = useMemo(() => (data?.rows ?? []) as Row[], [data]);
  const visible = useMemo(
    () => (onlyIssues ? rows.filter((r) => r.issues.length > 0) : rows),
    [rows, onlyIssues],
  );

  function exportCsv() {
    const head = ["Factuur", "Klant", "Bedrag", "Interne status", "Mollie-status", "Mollie-ID", "Verschillen"];
    const lines = visible.map((r) =>
      [
        r.invoice_number,
        r.client_name ?? "",
        formatCents(r.total_cents ?? 0, "nl", r.currency ?? "EUR"),
        r.internal_status,
        r.mollie_status ?? r.fetch_error ?? "",
        r.mollie_payment_id ?? "",
        r.issues.map((i) => ISSUE_LABELS[i] ?? i).join(" | "),
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
    a.download = `reconciliatie-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Scale className="h-6 w-6 text-brand" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reconciliatie</h1>
            <p className="text-sm text-muted-foreground">
              Mollie-statussen naast je interne factuurstatussen — verschillen worden gemarkeerd.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/betalingen">
              <ArrowLeft className="mr-2 h-4 w-4" /> Betalingen
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={visible.length === 0}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button size="sm" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Opnieuw controleren
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Reconciliatie kon niet worden uitgevoerd."}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Gecontroleerde betalingen</div>
          <div className="mt-1 text-xl font-semibold">{rows.length}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Verschillen
          </div>
          <div className="mt-1 text-xl font-semibold">{data?.mismatches ?? 0}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Laatste controle
          </div>
          <div className="mt-1 text-sm font-medium">
            {data?.checked_at ? new Date(data.checked_at).toLocaleString("nl-NL") : "—"}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border bg-card p-4">
        <Switch id="only-issues" checked={onlyIssues} onCheckedChange={setOnlyIssues} />
        <Label htmlFor="only-issues">Alleen verschillen tonen</Label>
      </div>

      <div className="rounded-xl border bg-card">
        {isFetching && rows.length === 0 ? (
          <div className="flex items-center justify-center p-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Statussen ophalen bij Mollie…
          </div>
        ) : visible.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {onlyIssues ? "Geen verschillen gevonden — alles loopt gelijk." : "Geen betalingen gevonden."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Factuur</TableHead>
                <TableHead>Klant</TableHead>
                <TableHead>Bedrag</TableHead>
                <TableHead>Intern</TableHead>
                <TableHead>Mollie</TableHead>
                <TableHead>Verschil</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.invoice_id}>
                  <TableCell className="font-medium">
                    <Link
                      to="/betalingen/$invoiceId"
                      params={{ invoiceId: r.invoice_id }}
                      className="hover:underline"
                    >
                      {r.invoice_number}
                    </Link>
                  </TableCell>
                  <TableCell>{r.client_name ?? "—"}</TableCell>
                  <TableCell>
                    {formatCents(r.total_cents ?? 0, "nl", r.currency ?? "EUR")}
                    {r.mollie_amount_cents != null && r.mollie_amount_cents !== r.total_cents ? (
                      <span className="ml-2 text-xs text-red-600">
                        Mollie: {formatCents(r.mollie_amount_cents, "nl", r.currency ?? "EUR")}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{r.internal_status}</TableCell>
                  <TableCell>{r.mollie_status ?? r.fetch_error ?? "—"}</TableCell>
                  <TableCell>
                    {r.issues.length === 0 ? (
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                        Gelijk
                      </Badge>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.issues.map((i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="bg-amber-100 text-amber-900 border-amber-200"
                          >
                            {ISSUE_LABELS[i] ?? i}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
