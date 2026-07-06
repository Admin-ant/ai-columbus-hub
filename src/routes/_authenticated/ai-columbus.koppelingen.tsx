import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, Check, Link2, ExternalLink, RefreshCw, ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/ai-columbus/koppelingen")({
  head: () => ({ meta: [{ title: "Koppelingen — AI van Columbus" }] }),
  component: KoppelingenPage,
});

type EventRow = Database["public"]["Tables"]["integration_events"]["Row"];

const SOURCES = [
  {
    id: "columbus_portaal",
    label: "Columbus Portaal",
    site: "https://www.columbusportaal.cloud/",
    accent: "from-orange-500/20 to-orange-500/5 border-orange-500/40",
    dot: "bg-orange-500",
  },
  {
    id: "inzet_nl",
    label: "inzet.nl (Stingry)",
    site: "https://stingry-air-ecruitment-app-t4yox.ondigitalocean.app/",
    accent: "from-amber-500/20 to-amber-500/5 border-amber-500/40",
    dot: "bg-amber-500",
  },
] as const;

function KoppelingenPage() {
  const { currentOrganizationId } = useWorkspace();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = currentOrganizationId
    ? `${baseUrl}/api/public/hooks/portaal-billable?org=${currentOrganizationId}`
    : "";

  async function loadEvents() {
    if (!currentOrganizationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("integration_events")
      .select("*")
      .eq("organization_id", currentOrganizationId)
      .order("received_at", { ascending: false })
      .limit(50);
    if (error) toast.error(error.message);
    setEvents((data ?? []) as EventRow[]);
    setLoading(false);
  }

  useEffect(() => { loadEvents(); /* eslint-disable-next-line */ }, [currentOrganizationId]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Koppelingen</h1>
        <p className="text-sm text-muted-foreground">
          Verbind externe portalen (Columbus Portaal, inzet.nl) zodat facturen, offertes en klanten
          automatisch hier binnenkomen.
        </p>
      </div>

      <Card className="border-primary/40 bg-gradient-to-br from-primary/10 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Webhook-eindpunt
          </CardTitle>
          <CardDescription>
            Stuur factureerbare events vanuit je portaal naar dit endpoint. Elk portaal krijgt zijn eigen{" "}
            <code className="rounded bg-muted px-1">source</code>-waarde in de payload.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <CopyBtn value={webhookUrl} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Header</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value="x-webhook-secret: <PORTAL_WEBHOOK_SECRET>"
                className="font-mono text-xs"
              />
              <CopyBtn value="x-webhook-secret" />
            </div>
            <p className="text-xs text-muted-foreground">
              Secret staat veilig opgeslagen in Lovable Cloud (PORTAL_WEBHOOK_SECRET). Deel dit met
              de beheerder van het portaal.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {SOURCES.map((s) => {
          const srcEvents = events.filter((e) => e.source === s.id).slice(0, 5);
          const lastOk = srcEvents.find((e) => e.status === "ok");
          return (
            <Card key={s.id} className={`bg-gradient-to-br ${s.accent}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className={`h-2 w-2 rounded-full ${srcEvents.length ? s.dot : "bg-muted-foreground/40"}`} />
                    {s.label}
                  </CardTitle>
                  <a href={s.site} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline flex items-center gap-1">
                    portaal <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <CardDescription>
                  {lastOk
                    ? `Laatste sync: ${new Date(lastOk.received_at).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })}`
                    : "Nog geen events ontvangen"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Automatisch aanmaken:</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px]">Facturen</Badge>
                    <Badge variant="outline" className="text-[10px]">Offertes</Badge>
                    <Badge variant="outline" className="text-[10px]">Klanten</Badge>
                    {s.id === "inzet_nl" && <Badge variant="outline" className="text-[10px]">Kandidaten → Leads</Badge>}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium">Laatste events</p>
                  {srcEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nog geen events.</p>
                  ) : (
                    <ul className="space-y-1">
                      {srcEvents.map((e) => (
                        <li key={e.id} className="flex items-center gap-2 text-xs">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              e.status === "ok" ? "bg-emerald-500" : e.status === "error" ? "bg-red-500" : "bg-amber-500"
                            }`}
                          />
                          <span className="font-mono">{e.event}</span>
                          <span className="text-muted-foreground truncate flex-1">{e.external_id}</span>
                          <span className="text-muted-foreground">
                            {new Date(e.received_at).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" /> Handmatig testen
          </CardTitle>
          <CardDescription>
            Stuur een test-event vanuit een terminal. Vervang <code>ORG</code> door je organisatie-id
            en <code>SECRET</code> door het opgeslagen webhook-secret.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="invoice">
            <TabsList>
              <TabsTrigger value="invoice">Factuur</TabsTrigger>
              <TabsTrigger value="quote">Offerte</TabsTrigger>
              <TabsTrigger value="client">Klant</TabsTrigger>
            </TabsList>
            <TabsContent value="invoice">
              <CurlSnippet body={sampleInvoice(baseUrl, currentOrganizationId)} />
            </TabsContent>
            <TabsContent value="quote">
              <CurlSnippet body={sampleQuote(baseUrl, currentOrganizationId)} />
            </TabsContent>
            <TabsContent value="client">
              <CurlSnippet body={sampleClient(baseUrl, currentOrganizationId)} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Event-log</CardTitle>
            <CardDescription>Alle inkomende webhook-events van beide portalen</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={loadEvents} disabled={loading}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Vernieuwen
          </Button>
        </CardHeader>
        <CardContent>
          {events.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">
              Nog geen events. Stuur er een via het portaal of via het cURL-voorbeeld hierboven.
            </p>
          )}
          <div className="space-y-1.5">
            {events.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    e.status === "ok" ? "bg-emerald-500" : e.status === "error" ? "bg-red-500" : "bg-amber-500"
                  }`}
                />
                <Badge variant="outline" className="font-mono text-[10px]">{e.source}</Badge>
                <span className="font-mono text-xs">{e.event}</span>
                <span className="truncate text-xs text-muted-foreground flex-1">{e.external_id}</span>
                {e.created_invoice_id && (
                  <Link to="/invoices" className="text-xs text-primary hover:underline flex items-center gap-1">
                    factuur <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
                {e.created_quote_id && (
                  <Link to="/quotes" className="text-xs text-primary hover:underline flex items-center gap-1">
                    offerte <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
                {e.error_message && (
                  <span className="truncate text-xs text-red-600" title={e.error_message}>
                    {e.error_message}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {new Date(e.received_at).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CopyBtn({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setOk(true);
        toast.success("Gekopieerd");
        setTimeout(() => setOk(false), 1500);
      }}
    >
      {ok ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function CurlSnippet({ body }: { body: string }) {
  return (
    <div className="mt-3 space-y-2">
      <Textarea readOnly value={body} rows={12} className="font-mono text-xs" />
      <CopyBtn value={body} />
    </div>
  );
}

function sampleInvoice(base: string, org: string | null | undefined) {
  return `curl -X POST "${base}/api/public/hooks/portaal-billable?org=${org ?? "ORG_ID"}" \\
  -H "Content-Type: application/json" \\
  -H "x-webhook-secret: SECRET" \\
  -d '${JSON.stringify(
    {
      source: "columbus_portaal",
      event: "invoice.ready",
      external_id: "COL-2026-00123",
      external_url: "https://portaal.example/invoices/123",
      client: { name: "Acme B.V.", kvk: "12345678", email: "info@acme.nl" },
      invoice: {
        currency: "EUR",
        lines: [
          { description: "Maandelijkse dienstverlening", quantity: 1, unit_price_cents: 12500, vat_rate: 21 },
        ],
      },
    },
    null,
    2,
  )}'`;
}
function sampleQuote(base: string, org: string | null | undefined) {
  return `curl -X POST "${base}/api/public/hooks/portaal-billable?org=${org ?? "ORG_ID"}" \\
  -H "Content-Type: application/json" \\
  -H "x-webhook-secret: SECRET" \\
  -d '${JSON.stringify(
    {
      source: "inzet_nl",
      event: "quote.requested",
      external_id: "INZ-Q-9001",
      client: { name: "Bouwbedrijf X", email: "info@bouwx.nl" },
      quote: {
        title: "Recruitment-abonnement 2026",
        lines: [{ description: "Kwartaalfee", quantity: 4, unit_price_cents: 95000, vat_rate: 21 }],
      },
    },
    null,
    2,
  )}'`;
}
function sampleClient(base: string, org: string | null | undefined) {
  return `curl -X POST "${base}/api/public/hooks/portaal-billable?org=${org ?? "ORG_ID"}" \\
  -H "Content-Type: application/json" \\
  -H "x-webhook-secret: SECRET" \\
  -d '${JSON.stringify(
    {
      source: "columbus_portaal",
      event: "client.updated",
      external_id: "COL-CUST-42",
      client: {
        name: "Acme B.V.",
        kvk: "12345678",
        vat: "NL001234567B01",
        email: "info@acme.nl",
        phone: "020-1234567",
        address_line1: "Hoofdstraat 1",
        postal_code: "1000 AA",
        city: "Amsterdam",
        contact_person: "Jan Jansen",
        external_id: "COL-CUST-42",
      },
    },
    null,
    2,
  )}'`;
}
