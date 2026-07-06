import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, Check, Link2, ExternalLink, RefreshCw, ArrowRight, ShieldCheck, Upload, FileJson, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { importPortalPayload, importPortalBulk } from "@/lib/portal-import.functions";

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

      <ManualImportCard orgId={currentOrganizationId ?? null} onDone={loadEvents} />



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

type Kind = "invoice" | "quote" | "client" | "lead";

function ManualImportCard({ orgId, onDone }: { orgId: string | null; onDone: () => void }) {
  const runImport = useServerFn(importPortalPayload);
  const runBulk = useServerFn(importPortalBulk);

  const [kind, setKind] = useState<Kind>("invoice");
  const [source, setSource] = useState<"columbus_portaal" | "inzet_nl" | "handmatig">("handmatig");
  const [busy, setBusy] = useState(false);

  // Simple form (invoice/quote/client/lead)
  const [externalId, setExternalId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientKvk, setClientKvk] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [vat, setVat] = useState<string>("21");
  const [quantity, setQuantity] = useState<string>("1");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadRole, setLeadRole] = useState("");
  const [leadCompany, setLeadCompany] = useState("");

  // Bulk JSON
  const [jsonInput, setJsonInput] = useState("");

  function reset() {
    setExternalId(""); setClientName(""); setClientEmail(""); setClientKvk("");
    setDescription(""); setAmount(""); setQuantity("1"); setVat("21");
    setLeadPhone(""); setLeadRole(""); setLeadCompany("");
  }

  function buildPayload() {
    const ext = externalId.trim() || `MAN-${Date.now()}`;
    const base = {
      source,
      external_id: ext,
      client: clientName.trim()
        ? {
            name: clientName.trim(),
            email: clientEmail.trim() || undefined,
            kvk: clientKvk.trim() || undefined,
          }
        : undefined,
    };
    if (kind === "invoice" || kind === "quote") {
      const qty = Math.max(0.001, Number(quantity) || 1);
      const cents = Math.round(Number(amount || "0") * 100);
      if (cents <= 0) throw new Error("Bedrag > 0");
      if (!description.trim()) throw new Error("Omschrijving verplicht");
      const line = {
        description: description.trim(),
        quantity: qty,
        unit_price_cents: cents,
        vat_rate: Number(vat) || 21,
      };
      return kind === "invoice"
        ? { ...base, event: "invoice.ready" as const, invoice: { currency: "EUR", lines: [line] } }
        : { ...base, event: "quote.requested" as const, quote: { title: description.trim(), lines: [line] } };
    }
    if (kind === "client") {
      if (!clientName.trim()) throw new Error("Klantnaam verplicht");
      return { ...base, event: "client.updated" as const };
    }
    // lead
    if (!clientName.trim()) throw new Error("Naam kandidaat verplicht");
    return {
      ...base,
      event: "candidate.new" as const,
      lead: {
        name: clientName.trim(),
        email: clientEmail.trim() || undefined,
        phone: leadPhone.trim() || undefined,
        company: leadCompany.trim() || undefined,
        role: leadRole.trim() || undefined,
      },
    };
  }

  async function submit() {
    if (!orgId) return toast.error("Geen organisatie geselecteerd");
    setBusy(true);
    try {
      const payload = buildPayload();
      const r = await runImport({ data: { organization_id: orgId, payload } });
      toast.success(
        r.duplicate ? "Bestond al — bijgewerkt" :
        r.invoice_number ? `Factuur ${r.invoice_number} aangemaakt` :
        r.quote_id ? "Offerte aangemaakt" :
        r.lead_id ? "Lead aangemaakt" :
        "Klant opgeslagen",
      );
      reset();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fout bij importeren");
    } finally {
      setBusy(false);
    }
  }

  async function submitBulk() {
    if (!orgId) return toast.error("Geen organisatie geselecteerd");
    setBusy(true);
    try {
      const parsed = JSON.parse(jsonInput);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const r = await runBulk({ data: { organization_id: orgId, items } });
      toast.success(`${r.succeeded}/${r.total} geïmporteerd${r.failed ? ` — ${r.failed} fouten` : ""}`);
      if (r.failed) console.warn("Bulk import fouten:", r.results.filter((x) => !x.ok));
      if (r.succeeded > 0) setJsonInput("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ongeldige JSON");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(f: File) {
    const text = await f.text();
    setJsonInput(text);
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" /> Handmatig importeren
        </CardTitle>
        <CardDescription>
          Zolang de portaal-koppelingen nog niet live zijn, kun je facturen, offertes, klanten en
          leads direct hier invoeren. Alles komt in dezelfde flow terecht als straks de portalen.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="form">
          <TabsList>
            <TabsTrigger value="form"><Upload className="mr-2 h-3.5 w-3.5" />Formulier</TabsTrigger>
            <TabsTrigger value="json"><FileJson className="mr-2 h-3.5 w-3.5" />JSON / bulk</TabsTrigger>
          </TabsList>

          <TabsContent value="form" className="space-y-4 pt-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoice">Factuur</SelectItem>
                    <SelectItem value="quote">Offerte</SelectItem>
                    <SelectItem value="client">Klant</SelectItem>
                    <SelectItem value="lead">Lead / kandidaat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Bron</Label>
                <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="handmatig">Handmatig</SelectItem>
                    <SelectItem value="columbus_portaal">Columbus Portaal</SelectItem>
                    <SelectItem value="inzet_nl">inzet.nl</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Extern ID (optioneel)</Label>
                <Input value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="bv. COL-2026-00123" />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5 md:col-span-1">
                <Label>{kind === "lead" ? "Naam kandidaat" : "Klantnaam"} *</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
              </div>
              {kind !== "lead" ? (
                <div className="space-y-1.5">
                  <Label>KvK</Label>
                  <Input value={clientKvk} onChange={(e) => setClientKvk(e.target.value)} />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Telefoon</Label>
                  <Input value={leadPhone} onChange={(e) => setLeadPhone(e.target.value)} />
                </div>
              )}
            </div>

            {(kind === "invoice" || kind === "quote") && (
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Omschrijving *</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="bv. Maandelijkse dienstverlening" />
                </div>
                <div className="space-y-1.5">
                  <Label>Aantal</Label>
                  <Input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Prijs per stuk (€) *</Label>
                  <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>BTW %</Label>
                  <Select value={vat} onValueChange={setVat}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="9">9%</SelectItem>
                      <SelectItem value="21">21%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {kind === "lead" && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Bedrijf</Label>
                  <Input value={leadCompany} onChange={(e) => setLeadCompany(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Rol / functie</Label>
                  <Input value={leadRole} onChange={(e) => setLeadRole(e.target.value)} />
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={submit} disabled={busy || !orgId}>
                {busy ? "Bezig…" : kind === "invoice" ? "Factuur aanmaken" : kind === "quote" ? "Offerte aanmaken" : kind === "client" ? "Klant opslaan" : "Lead aanmaken"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="json" className="space-y-3 pt-3">
            <p className="text-xs text-muted-foreground">
              Plak één payload-object of een array van payloads. Zelfde formaat als de webhook (zie voorbeelden hierboven).
              Ook een <code className="rounded bg-muted px-1">.json</code>-bestand uploaden kan.
            </p>
            <Input type="file" accept="application/json,.json" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
            <Textarea rows={10} value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} className="font-mono text-xs" placeholder='[{"source":"handmatig","event":"invoice.ready", ...}]' />
            <div className="flex justify-end">
              <Button onClick={submitBulk} disabled={busy || !orgId || !jsonInput.trim()}>
                {busy ? "Bezig…" : "Bulk importeren"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

