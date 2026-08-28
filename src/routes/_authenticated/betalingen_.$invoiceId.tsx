import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Receipt,
  Webhook,
  XCircle,
} from "lucide-react";

import { getInvoicePaymentDetail } from "@/lib/mollie-invoice.functions";
import { formatCents } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/betalingen_/$invoiceId")({
  head: () => ({
    meta: [
      { title: "Betalingsdetail — transactie en events" },
      {
        name: "description",
        content:
          "Bekijk per factuur de Mollie-transaction-id, de volledige statusgeschiedenis en alle bijbehorende webhook-events.",
      },
      { property: "og:title", content: "Betalingsdetail — transactie en events" },
      {
        property: "og:description",
        content: "Mollie-transaction-id, statusgeschiedenis en webhook-events per factuur.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BetalingDetailPage,
});

function ts(v: string) {
  return new Date(v).toLocaleString("nl-NL");
}

function BetalingDetailPage() {
  const { invoiceId } = Route.useParams();
  const fetchDetail = useServerFn(getInvoicePaymentDetail);
  const { data, isLoading, error } = useQuery({
    queryKey: ["mollie-payment-detail", invoiceId],
    queryFn: () => fetchDetail({ data: { invoice_id: invoiceId } }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : "Betaling niet gevonden."}
      </div>
    );
  }

  const inv = data.invoice;
  const currency = inv.currency ?? "EUR";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Receipt className="h-6 w-6 text-brand" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Betaling factuur {inv.invoice_number}
            </h1>
            <p className="text-sm text-muted-foreground">{inv.client_name ?? "Onbekende klant"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/betalingen">
              <ArrowLeft className="mr-2 h-4 w-4" /> Betalingen
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/invoices/$invoiceId" params={{ invoiceId: inv.id }}>
              <FileText className="mr-2 h-4 w-4" /> Factuur
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Bedrag</div>
          <div className="mt-1 text-xl font-semibold">
            {formatCents(inv.total_cents ?? 0, "nl", currency)}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Interne status</div>
          <div className="mt-1 text-xl font-semibold">{inv.status}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Betaald op</div>
          <div className="mt-1 text-sm font-medium">{inv.paid_at ? ts(inv.paid_at) : "—"}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Methode</div>
          <div className="mt-1 text-sm font-medium">{inv.preferred_payment_method ?? "—"}</div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="text-xs text-muted-foreground">Mollie transaction-id</div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <code className="rounded bg-muted px-2 py-1 text-sm">{inv.mollie_payment_id ?? "—"}</code>
          {inv.mollie_checkout_url ? (
            <a
              href={inv.mollie_checkout_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
            >
              Checkout openen <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Statusgeschiedenis</h2>
        <div className="rounded-xl border bg-card">
          {data.events.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nog geen betalingsgebeurtenissen.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Moment</TableHead>
                  <TableHead>Gebeurtenis</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Methode</TableHead>
                  <TableHead>Bedrag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{ts(e.created_at)}</TableCell>
                    <TableCell>{e.event_type}</TableCell>
                    <TableCell>{e.status ?? "—"}</TableCell>
                    <TableCell>{e.method ?? "—"}</TableCell>
                    <TableCell>
                      {e.amount_cents != null ? formatCents(e.amount_cents, "nl", currency) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Webhook className="h-4 w-4" /> Webhook-events
        </h2>
        <div className="rounded-xl border bg-card">
          {data.webhookEvents.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nog geen webhook-meldingen voor deze factuur.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Moment</TableHead>
                  <TableHead>Resultaat</TableHead>
                  <TableHead>Reden</TableHead>
                  <TableHead>Mollie-status</TableHead>
                  <TableHead>HTTP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.webhookEvents.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="whitespace-nowrap">{ts(w.created_at)}</TableCell>
                    <TableCell>
                      {w.outcome === "accepted" ? (
                        <Badge variant="outline" className="border-green-200 bg-green-100 text-green-800">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Ontvangen
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-red-200 bg-red-100 text-red-800">
                          <XCircle className="mr-1 h-3 w-3" /> Afgewezen
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{w.reason ?? "—"}</TableCell>
                    <TableCell>{w.payment_status ?? "—"}</TableCell>
                    <TableCell>{w.http_status ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
