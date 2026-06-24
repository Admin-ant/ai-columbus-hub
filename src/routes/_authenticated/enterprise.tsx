import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Sparkles,
  TrendingUp,
  Palette,
  MessagesSquare,
  ClipboardList,
} from "lucide-react";

import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listCrmActivities,
  createCrmActivity,
  toggleCrmActivityDone,
  deleteCrmActivity,
  analyzeWinLoss,
  updateBranding,
  computeForecast,
  listForecastSnapshots,
} from "@/lib/enterprise.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/enterprise")({
  component: EnterprisePage,
});

type Activity = Awaited<ReturnType<typeof listCrmActivities>>[number];
type Snapshot = Awaited<ReturnType<typeof listForecastSnapshots>>[number];

function EnterprisePage() {
  const { currentOrganizationId, currentOrganization } = useWorkspace();

  if (!currentOrganizationId) {
    return <div className="p-6 text-sm text-muted-foreground">Selecteer eerst een organisatie.</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Enterprise</h1>
        <p className="text-muted-foreground">
          {currentOrganization?.name ?? ""} — CRM, team, win/loss & forecast
        </p>
      </div>

      <Tabs defaultValue="crm" className="w-full">
        <TabsList>
          <TabsTrigger value="crm"><ClipboardList className="size-4 mr-1" /> CRM</TabsTrigger>
          <TabsTrigger value="winloss"><Sparkles className="size-4 mr-1" /> Win/Loss</TabsTrigger>
          <TabsTrigger value="forecast"><TrendingUp className="size-4 mr-1" /> Forecast</TabsTrigger>
          <TabsTrigger value="brand"><Palette className="size-4 mr-1" /> White-label</TabsTrigger>
          <TabsTrigger value="comments"><MessagesSquare className="size-4 mr-1" /> Comments</TabsTrigger>
        </TabsList>

        <TabsContent value="crm"><CrmTab orgId={currentOrganizationId} /></TabsContent>
        <TabsContent value="winloss"><WinLossTab orgId={currentOrganizationId} /></TabsContent>
        <TabsContent value="forecast"><ForecastTab orgId={currentOrganizationId} /></TabsContent>
        <TabsContent value="brand"><BrandTab orgId={currentOrganizationId} /></TabsContent>
        <TabsContent value="comments">
          <Card><CardContent className="p-6 text-sm text-muted-foreground">
            Comments worden inline op een offerte getoond. Open een offerte in de Studio en gebruik de comments-tab.
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============ CRM ============ */

function CrmTab({ orgId }: { orgId: string }) {
  const list = useServerFn(listCrmActivities);
  const create = useServerFn(createCrmActivity);
  const toggle = useServerFn(toggleCrmActivityDone);
  const remove = useServerFn(deleteCrmActivity);

  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<"note" | "call" | "meeting" | "task" | "email">("task");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const rows = await list({ data: { organization_id: orgId } });
      setItems(rows);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orgId]);

  async function add() {
    if (!title.trim()) return toast.error("Titel verplicht");
    try {
      await create({
        data: {
          organization_id: orgId,
          kind, title, body: body || null,
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
        },
      });
      setTitle(""); setBody(""); setDueAt("");
      toast.success("Toegevoegd");
      await refresh();
    } catch (e) { toast.error(String(e)); }
  }

  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  return (
    <div className="grid md:grid-cols-3 gap-6 mt-4">
      <Card className="md:col-span-1">
        <CardHeader><CardTitle>Nieuwe activiteit</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="task">Taak</SelectItem>
                <SelectItem value="note">Notitie</SelectItem>
                <SelectItem value="call">Telefoon</SelectItem>
                <SelectItem value="meeting">Meeting</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Titel</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Omschrijving</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} /></div>
          <div><Label>Deadline</Label><Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></div>
          <Button onClick={add} className="w-full"><Plus className="size-4 mr-1" />Toevoegen</Button>
        </CardContent>
      </Card>

      <div className="md:col-span-2 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Openstaand ({open.length})</CardTitle>
            <CardDescription>Taken & follow-ups</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && <Loader2 className="size-4 animate-spin" />}
            {open.length === 0 && !loading && <p className="text-sm text-muted-foreground">Geen openstaande items.</p>}
            {open.map((a) => (
              <ActivityRow key={a.id} a={a}
                onToggle={async () => { await toggle({ data: { id: a.id, done: true } }); refresh(); }}
                onDelete={async () => { await remove({ data: { id: a.id } }); refresh(); }} />
            ))}
          </CardContent>
        </Card>

        {done.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Afgerond ({done.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {done.slice(0, 20).map((a) => (
                <ActivityRow key={a.id} a={a}
                  onToggle={async () => { await toggle({ data: { id: a.id, done: false } }); refresh(); }}
                  onDelete={async () => { await remove({ data: { id: a.id } }); refresh(); }} />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ActivityRow({ a, onToggle, onDelete }: { a: Activity; onToggle: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-md border">
      <button onClick={onToggle} className="mt-0.5">
        {a.done ? <CheckCircle2 className="size-5 text-green-500" /> : <Circle className="size-5 text-muted-foreground" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{a.kind}</Badge>
          <span className={`font-medium ${a.done ? "line-through text-muted-foreground" : ""}`}>{a.title}</span>
          {a.due_at && <span className="text-xs text-muted-foreground">· {new Date(a.due_at).toLocaleString("nl-NL")}</span>}
        </div>
        {a.body && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.body}</p>}
      </div>
      <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="size-4" /></Button>
    </div>
  );
}

/* ============ Win/Loss ============ */

type QuoteLite = { id: string; title: string; client_name: string | null; outcome: string | null; outcome_reason: string | null; ai_winloss: unknown };

function WinLossTab({ orgId }: { orgId: string }) {
  const analyze = useServerFn(analyzeWinLoss);
  const [quotes, setQuotes] = useState<QuoteLite[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    const { data, error } = await supabase
      .from("studio_quotes")
      .select("id, title, client_name, outcome, outcome_reason, ai_winloss")
      .eq("organization_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (error) return toast.error(error.message);
    setQuotes((data ?? []) as QuoteLite[]);
  }
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orgId]);

  async function mark(q: QuoteLite, outcome: "won" | "lost" | "no_decision") {
    const reason = window.prompt(`Reden voor "${outcome}"? (optioneel)`) ?? "";
    setBusy(q.id);
    try {
      await analyze({ data: { quote_id: q.id, outcome, reason } });
      toast.success("AI analyse klaar");
      await refresh();
    } catch (e) { toast.error(String(e)); }
    setBusy(null);
  }

  return (
    <div className="space-y-3 mt-4">
      {quotes.map((q) => {
        const a = (q.ai_winloss as { summary?: string; lessons?: string[]; next_actions?: string[] } | null) ?? null;
        return (
          <Card key={q.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{q.title}</div>
                  <div className="text-xs text-muted-foreground">{q.client_name ?? "—"}</div>
                </div>
                <div className="flex items-center gap-2">
                  {q.outcome && <Badge variant={q.outcome === "won" ? "default" : "secondary"}>{q.outcome}</Badge>}
                  <Button size="sm" variant="outline" disabled={busy === q.id} onClick={() => mark(q, "won")}>Won</Button>
                  <Button size="sm" variant="outline" disabled={busy === q.id} onClick={() => mark(q, "lost")}>Lost</Button>
                  {busy === q.id && <Loader2 className="size-4 animate-spin" />}
                </div>
              </div>
              {a && (
                <div className="text-sm bg-muted/40 rounded p-3 space-y-1">
                  {a.summary && <p>{a.summary}</p>}
                  {a.lessons && a.lessons.length > 0 && (
                    <div><div className="font-medium">Lessen</div><ul className="list-disc pl-5">{a.lessons.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
                  )}
                  {a.next_actions && a.next_actions.length > 0 && (
                    <div><div className="font-medium">Next</div><ul className="list-disc pl-5">{a.next_actions.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      {quotes.length === 0 && <p className="text-sm text-muted-foreground">Geen offertes gevonden.</p>}
    </div>
  );
}

/* ============ Forecast ============ */

function ForecastTab({ orgId }: { orgId: string }) {
  const compute = useServerFn(computeForecast);
  const list = useServerFn(listForecastSnapshots);
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [start, setStart] = useState(firstDay);
  const [end, setEnd] = useState(lastDay);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setSnapshots(await list({ data: { organization_id: orgId } }));
  }
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orgId]);

  async function run() {
    setBusy(true);
    try {
      await compute({ data: { organization_id: orgId, period_start: start, period_end: end } });
      toast.success("Forecast berekend");
      await refresh();
    } catch (e) { toast.error(String(e)); }
    setBusy(false);
  }

  const latest = snapshots[0];
  const breakdown = useMemo(() => {
    const items = (latest?.breakdown as { items?: Array<{ id: string; title: string; status: string; value_eur: number; weight: number; weighted_eur: number }> } | null)?.items ?? [];
    return items;
  }, [latest]);

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader><CardTitle>Pipeline forecast</CardTitle><CardDescription>Gewogen op basis van status en win-probability</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div><Label>Van</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label>Tot</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <Button onClick={run} disabled={busy}>{busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <TrendingUp className="size-4 mr-1" />}Bereken</Button>
        </CardContent>
      </Card>

      {latest && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Weighted" value={latest.weighted_value_cents} />
          <Stat label="Commit" value={latest.commit_cents} />
          <Stat label="Best case" value={latest.best_case_cents} />
        </div>
      )}

      {breakdown.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {breakdown.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-sm border-b py-1">
                  <span className="truncate flex-1">{b.title}</span>
                  <Badge variant="outline" className="mx-2">{b.status}</Badge>
                  <span className="w-16 text-right text-muted-foreground">{Math.round(b.weight * 100)}%</span>
                  <span className="w-28 text-right">€ {b.value_eur.toLocaleString("nl-NL")}</span>
                  <span className="w-28 text-right font-medium">€ {b.weighted_eur.toLocaleString("nl-NL")}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {snapshots.length > 1 && (
        <Card>
          <CardHeader><CardTitle>Historie</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {snapshots.map((s) => (
              <div key={s.id} className="flex justify-between border-b py-1">
                <span>{new Date(s.created_at).toLocaleString("nl-NL")} · {s.period_start} → {s.period_end}</span>
                <span>€ {(s.weighted_value_cents / 100).toLocaleString("nl-NL")}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">€ {(value / 100).toLocaleString("nl-NL")}</div>
    </CardContent></Card>
  );
}

/* ============ Branding ============ */

function BrandTab({ orgId }: { orgId: string }) {
  const update = useServerFn(updateBranding);
  const [primary, setPrimary] = useState("");
  const [accent, setAccent] = useState("");
  const [logo, setLogo] = useState("");
  const [font, setFont] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("organizations")
        .select("brand_primary_color, brand_accent_color, brand_logo_url, brand_font, brand_custom_domain")
        .eq("id", orgId).maybeSingle();
      if (data) {
        setPrimary(data.brand_primary_color ?? "");
        setAccent(data.brand_accent_color ?? "");
        setLogo(data.brand_logo_url ?? "");
        setFont(data.brand_font ?? "");
        setDomain(data.brand_custom_domain ?? "");
      }
    })();
  }, [orgId]);

  async function save() {
    setBusy(true);
    try {
      await update({
        data: {
          organization_id: orgId,
          brand_primary_color: primary || null,
          brand_accent_color: accent || null,
          brand_logo_url: logo || null,
          brand_font: font || null,
          brand_custom_domain: domain || null,
        },
      });
      toast.success("Opgeslagen");
    } catch (e) { toast.error(String(e)); }
    setBusy(false);
  }

  return (
    <div className="grid md:grid-cols-2 gap-6 mt-4">
      <Card>
        <CardHeader><CardTitle>Branding</CardTitle><CardDescription>Toegepast op publieke offertes</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Primary kleur</Label><Input type="color" value={primary || "#000000"} onChange={(e) => setPrimary(e.target.value)} /></div>
            <div><Label>Accent kleur</Label><Input type="color" value={accent || "#ff2bd6"} onChange={(e) => setAccent(e.target.value)} /></div>
          </div>
          <div><Label>Logo URL</Label><Input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://..." /></div>
          <div><Label>Font (Google Font naam)</Label><Input value={font} onChange={(e) => setFont(e.target.value)} placeholder="Inter" /></div>
          <div><Label>Custom domein</Label><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="offertes.jouwbedrijf.nl" /></div>
          <Button onClick={save} disabled={busy} className="w-full">{busy && <Loader2 className="size-4 mr-1 animate-spin" />}Opslaan</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-lg p-6 text-white" style={{ background: primary || "#0a0a0a", fontFamily: font || undefined }}>
            {logo && <img src={logo} alt="logo" className="h-10 mb-4" />}
            <h3 className="text-xl font-bold">Jouw merk</h3>
            <p className="opacity-80 text-sm">Zo zien klanten je publieke offertes.</p>
            <button className="mt-4 px-4 py-2 rounded font-medium text-black" style={{ background: accent || "#ff2bd6" }}>Accepteer offerte</button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
