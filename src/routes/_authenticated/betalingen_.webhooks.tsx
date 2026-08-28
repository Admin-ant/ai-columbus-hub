import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Webhook,
  XCircle,
} from "lucide-react";

import { listMollieWebhookEvents } from "@/lib/mollie-invoice.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_authenticated/betalingen_/webhooks")({
  head: () => ({
    meta: [
      { title: "Webhook-monitoring — Mollie-events" },
      {
        name: "description",
        content:
          "Monitor alle binnenkomende Mollie-webhook-meldingen: ontvangen of afgewezen, met reden, status en gekoppelde factuur.",
      },
      { property: "og:title", content: "Webhook-monitoring — Mollie-events" },
      {
        property: "og:description",
        content: "Zie welke Mollie-betaalmeldingen echt binnenkomen en welke worden afgewezen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WebhookMonitorPage,
});

type Event = {
  id: string;
  invoice_id: string | null;
  invoice_number: string | null;
  mollie_payment_id: string | null;
  outcome: string;
  reason: string | null;
  http_status: number | null;
  payment_status: string | null;
  method: string | null;
  created_at: string;
};

function WebhookMonitorPage() {
  const fetchEvents = useServerFn(listMollieWebhookEvents);
  const [outcome, setOutcome] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["mollie-webhook-events"],
    queryFn: () => fetchEvents(),
  });

  const events = useMemo(() => (data?.events ?? []) as Event[], [data]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((e) => {
      if (outcome !== "all" && e.outcome !== outcome) return false;
      if (term) {
        const hay = `${e.invoice_number ?? ""} ${e.mollie_payment_id ?? ""} ${e.reason ?? ""}`;
        if (!hay.toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [events, outcome, search]);

  const accepted = events.filter((e) => e.outcome === "accepted").length;
  const rejected = events.length - accepted;

  function exportCsv() {
    const head = ["Moment", "Resultaat", "Reden", "Factuur", "Mollie-ID", "Mollie-status", "HTTP"];
    const lines = filtered.map((e) =>
      [
        new Date(e.created_at).toLocaleString("nl-NL"),
        e.outcome === "accepted" ? "Ontvangen" : "Afgewezen",
        e.reason ?? "",
        e.invoice_number ?? "",
        e.mollie_payment_id ?? "",
        e.payment_status ?? "",
        e.http_status ?? "",
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
    a.download = `webhook-events-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Webhook className="h-6 w-6 text-brand" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Webhook-monitoring</h1>
            <p className="text-sm text-muted-foreground">
              Alle binnenkomende betaalmeldingen — ontvangen of afgewezen, met reden.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/betalingen">
              <ArrowLeft className="mr-2 h-4 w-4" /> Betalingen
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button size="sm" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Vernieuwen
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Totaal meldingen</div>
          <div className="mt-1 text-xl font-semibold">{events.length}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Ontvangen
          </div>
          <div className="mt-1 text-xl font-semibold">{accepted}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <XCircle className="h-3.5 w-3.5 text-red-600" /> Afgewezen
          </div>
          <div className="mt-1 text-xl font-semibold">{rejected}</div>
        </div>
      </div>

      <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Resultaat</Label>
          <Select value={outcome} onValueChange={setOutcome}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alles</SelectItem>
              <SelectItem value="accepted">Ontvangen</SelectItem>
              <SelectItem value="rejected">Afgewezen</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Zoeken</Label>
          <Input
            placeholder="Factuurnummer, transaction-id of reden"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Geen webhook-meldingen gevonden.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Moment</TableHead>
                <TableHead>Resultaat</TableHead>
                <TableHead>Reden</TableHead>
                <TableHead>Factuur</TableHead>
                <TableHead>Transaction-id</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>HTTP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString("nl-NL")}
                  </TableCell>
                  <TableCell>
                    {e.outcome === "accepted" ? (
                      <Badge variant="outline" className="border-green-200 bg-green-100 text-green-800">
                        Ontvangen
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-red-200 bg-red-100 text-red-800">
                        Afgewezen
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{e.reason ?? "—"}</TableCell>
                  <TableCell>
                    {e.invoice_id ? (
                      <Link
                        to="/betalingen/$invoiceId"
                        params={{ invoiceId: e.invoice_id }}
                        className="hover:underline"
                      >
                        {e.invoice_number ?? "Factuur"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.mollie_payment_id ?? "—"}</TableCell>
                  <TableCell>{e.payment_status ?? "—"}</TableCell>
                  <TableCell>{e.http_status ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
