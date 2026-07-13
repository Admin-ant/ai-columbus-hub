import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Mail, Phone, StickyNote, History, Save, ExternalLink, ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/ai-columbus/projecten/$projectId")({
  head: () => ({ meta: [{ title: "Project detail" }] }),
  component: ProjectDetailPage,
});

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type DeliveryHistoryRow = Database["public"]["Tables"]["project_delivery_status_history"]["Row"];
type StatusHistoryRow = Database["public"]["Tables"]["project_status_history"]["Row"];
type ProjectStatus = Database["public"]["Enums"]["project_status"];
type DeliveryStatus = Database["public"]["Enums"]["project_delivery_status"];

const EUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

const STATUS_META: Record<ProjectStatus, { label: string; cls: string }> = {
  contact_gezocht:    { label: "Contact gezocht",    cls: "bg-blue-500 text-foreground" },
  afspraak_geboekt:   { label: "Afspraak geboekt",   cls: "bg-green-500 text-foreground" },
  offerte_verstuurd:  { label: "Offerte verstuurd",  cls: "bg-yellow-400 text-foreground" },
  contract_verstuurd: { label: "Contract verstuurd", cls: "bg-orange-500 text-foreground" },
  contract_getekend:  { label: "Contract getekend",  cls: "bg-emerald-700 text-foreground" },
  on_hold:            { label: "On hold",            cls: "bg-slate-400 text-foreground" },
};

const DELIVERY_META: Record<DeliveryStatus, { label: string; cls: string }> = {
  nieuw:          { label: "Nieuw",            cls: "bg-blue-500 text-foreground" },
  in_uitvoering:  { label: "In uitvoering",    cls: "bg-emerald-600 text-foreground" },
  wacht_op_klant: { label: "Wacht op klant",   cls: "bg-amber-500 text-foreground" },
  on_hold:        { label: "On hold",          cls: "bg-slate-400 text-foreground" },
  opgeleverd:     { label: "Opgeleverd",       cls: "bg-emerald-800 text-foreground" },
  geannuleerd:    { label: "Geannuleerd",      cls: "bg-red-500 text-foreground" },
};
const DELIVERY_KEYS = Object.keys(DELIVERY_META) as DeliveryStatus[];

type Related = {
  contract: { id: string; title: string | null; monthly_amount_cents: number; setup_fee_cents: number | null; status: string } | null;
  client: { id: string; name: string } | null;
  invoices: { id: string; invoice_number: string; total_cents: number; status: string }[];
};


function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [deliveryHistory, setDeliveryHistory] = useState<DeliveryHistoryRow[]>([]);
  const [salesHistory, setSalesHistory] = useState<StatusHistoryRow[]>([]);
  const [related, setRelated] = useState<Related>({ contract: null, client: null, invoices: [] });
  const [profiles, setProfiles] = useState<Record<string, { display_name: string | null; email: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<ProjectRow>>({});
  const [showDetails, setShowDetails] = useState(true);
  const [siblings, setSiblings] = useState<{ id: string; name: string }[]>([]);

  async function load() {
    setLoading(true);
    setProject(null);
    setRelated({ contract: null, client: null, invoices: [] });
    setDeliveryHistory([]);
    setSalesHistory([]);
    setProfiles({});
    setForm({});
    const [{ data: p, error: pe }, { data: dh }, { data: sh }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
      supabase.from("project_delivery_status_history").select("*").eq("project_id", projectId).order("changed_at", { ascending: false }),
      supabase.from("project_status_history").select("*").eq("project_id", projectId).order("changed_at", { ascending: false }),
    ]);
    if (pe) toast.error(pe.message);
    const row = p as ProjectRow | null;
    setProject(row);
    setForm(row ?? {});
    const dHist = (dh ?? []) as DeliveryHistoryRow[];
    const sHist = (sh ?? []) as StatusHistoryRow[];
    setDeliveryHistory(dHist);
    setSalesHistory(sHist);

    // Gerelateerd
    if (row) {
      const [{ data: contract }, { data: client }, { data: invoices }] = await Promise.all([
        supabase.from("contracts").select("id,title,monthly_amount_cents,setup_fee_cents,status").eq("project_id", row.id).maybeSingle(),
        row.client_id ? supabase.from("clients").select("id,name").eq("id", row.client_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("invoices").select("id,invoice_number,total_cents,status").eq("project_id", row.id).order("issue_date", { ascending: false }),
      ]);
      setRelated({
        contract: contract as any,
        client: client as any,
        invoices: (invoices ?? []) as any,
      });
    }

    const ids = Array.from(new Set([
      ...dHist.map(r => r.changed_by),
      ...sHist.map(r => r.changed_by),
    ].filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,display_name,email").in("id", ids);
      const map: Record<string, { display_name: string | null; email: string | null }> = {};
      (profs ?? []).forEach(pr => { map[pr.id] = { display_name: pr.display_name, email: pr.email }; });
      setProfiles(map);
    }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  async function save() {
    if (!project) return;
    setSaving(true);
    const patch: any = {
      name: form.name?.trim() || project.name,
      value_cents: form.value_cents ?? project.value_cents,
      target_month: form.target_month ?? null,
      delivery_status: ((form as any).delivery_status ?? (project as any).delivery_status) as DeliveryStatus,
      contact_name: form.contact_name ?? null,
      contact_email: form.contact_email ?? null,
      contact_phone: form.contact_phone ?? null,
      notes: form.notes ?? null,
      last_modified_by: user?.id ?? null,
      last_modified_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("projects").update(patch).eq("id", project.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Opgeslagen");
    load();
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…</div>;
  }
  if (!project) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild><Link to="/ai-columbus/projecten"><ArrowLeft className="mr-2 h-4 w-4" /> Terug</Link></Button>
        <p className="text-muted-foreground">Project niet gevonden.</p>
      </div>
    );
  }

  const valueEuros = Number(form.value_cents ?? 0) / 100;
  const currentDelivery = (((form as any).delivery_status ?? (project as any).delivery_status) as DeliveryStatus) ?? "nieuw";
  const salesStatus = project.status;

  // Project-specifieke KPI's (mirror van de projectenlijst, gescoped op dit project)
  const contractActive = related.contract && related.contract.status === "active";
  const monthlyCents = contractActive ? Number(related.contract!.monthly_amount_cents ?? 0) : 0;
  const setupCents = contractActive ? Number(related.contract!.setup_fee_cents ?? 0) : 0;
  const totalDealCents = Number(project.value_cents ?? 0);
  const isInProgress = currentDelivery === "in_uitvoering" ? 1 : 0;
  const isWaiting = currentDelivery === "on_hold" || currentDelivery === "wacht_op_klant" ? 1 : 0;
  const now = new Date();
  const deliveredThisMonth =
    currentDelivery === "opgeleverd" &&
    deliveryHistory.some((h) => {
      if (h.new_status !== "opgeleverd") return false;
      const d = new Date(h.changed_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
      ? 1
      : 0;
  const activeMrr = contractActive ? monthlyCents : 0;



  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild><Link to="/ai-columbus/projecten"><ArrowLeft className="mr-2 h-4 w-4" /> Projecten</Link></Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            <p className="text-sm text-muted-foreground">
              {EUR.format(Number(project.value_cents) / 100)} · <Badge className={DELIVERY_META[currentDelivery].cls}>{DELIVERY_META[currentDelivery].label}</Badge>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {form.contact_email && (
            <Button variant="outline" size="sm" asChild><a href={`mailto:${form.contact_email}`}><Mail className="mr-2 h-4 w-4" /> Mail</a></Button>
          )}
          {form.contact_phone && (
            <Button variant="outline" size="sm" asChild><a href={`tel:${form.contact_phone}`}><Phone className="mr-2 h-4 w-4" /> Bel</a></Button>
          )}
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Opslaan
          </Button>
        </div>
      </div>

      {/* Delivery KPI's — gescoped op dit project */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">In uitvoering</div>
          <div className="mt-2 text-2xl font-bold tabular-nums">{isInProgress}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">On hold / wacht op klant</div>
          <div className="mt-2 text-2xl font-bold tabular-nums">{isWaiting}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Opgeleverd deze maand</div>
          <div className="mt-2 text-2xl font-bold tabular-nums">{deliveredThisMonth}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Actieve MRR</div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{EUR.format(activeMrr / 100)}</div>
        </div>
      </div>

      {/* Financiële samenvatting — dit project */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Maandelijkse opbrengst (dit project)</div>
          <div className="mt-2 text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{EUR.format(monthlyCents / 100)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Eenmalige kosten (dit project)</div>
          <div className="mt-2 text-xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">{EUR.format(setupCents / 100)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Totale deal-waarde (dit project)</div>
          <div className="mt-2 text-xl font-bold tabular-nums">{EUR.format(totalDealCents / 100)}</div>
        </div>
      </div>

      {/* Delivery-status kaarten — markeer huidige status */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {DELIVERY_KEYS.map((s) => {
          const active = currentDelivery === s;
          const count = active ? 1 : 0;
          const amount = active ? totalDealCents : 0;
          return (
            <div
              key={s}
              className={`rounded-lg border bg-card p-3 text-left transition-shadow ${active ? "ring-2 ring-primary" : "opacity-70"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${DELIVERY_META[s].cls.split(" ")[0]}`} />
                <span className="text-xs font-medium text-muted-foreground">{count}</span>
              </div>
              <div className="mt-2 text-xs font-medium leading-tight">{DELIVERY_META[s].label}</div>
              <div className="mt-1 text-base font-semibold tabular-nums">{EUR.format(amount / 100)}</div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Projectgegevens</CardTitle>
            <CardDescription>Uitvoering en delivery van dit project</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Naam</Label>
              <Input value={form.name ?? ""} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Waarde (€)</Label>
              <Input type="number" step="0.01" value={valueEuros}
                onChange={e => setForm({ ...form, value_cents: Math.round((Number(e.target.value) || 0) * 100) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Doelmaand / opleverdatum</Label>
              <Input type="month" value={form.target_month ? String(form.target_month).slice(0,7) : ""}
                onChange={e => setForm({ ...form, target_month: e.target.value ? `${e.target.value}-01` : null })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Delivery-status</Label>
              <Select value={currentDelivery}
                onValueChange={v => setForm({ ...form, delivery_status: v as DeliveryStatus } as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DELIVERY_KEYS.map(s => <SelectItem key={s} value={s}>{DELIVERY_META[s].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2 rounded-md border bg-muted/30 p-3">
              <div className="text-xs font-medium text-muted-foreground uppercase">Herkomst (sales-fase, alleen-lezen)</div>
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className={STATUS_META[salesStatus].cls}>{STATUS_META[salesStatus].label}</Badge>
                <span className="text-muted-foreground">wordt automatisch bijgehouden door de sales-workflow</span>
              </div>
            </div>
            <div className="space-y-1.5" id="contact">
              <Label>Contactpersoon</Label>
              <Input value={form.contact_name ?? ""} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={form.contact_email ?? ""} onChange={e => setForm({ ...form, contact_email: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Telefoon</Label>
              <Input value={form.contact_phone ?? ""} onChange={e => setForm({ ...form, contact_phone: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2" id="notities">
              <Label className="flex items-center gap-1"><StickyNote className="h-3.5 w-3.5" /> Notities</Label>
              <Textarea rows={5} value={form.notes ?? ""} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Gerelateerd</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {related.client ? (
                <Link to="/ai-columbus/klanten/$clientId" params={{ clientId: related.client.id }}
                  className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted">
                  <span>👤 Klant: {related.client.name}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              ) : (
                <div className="rounded-md border px-3 py-2 text-muted-foreground">Geen klant gekoppeld</div>
              )}
              {related.contract ? (
                <Link to="/contracten/$contractId" params={{ contractId: related.contract.id }}
                  className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted">
                  <span>📄 Contract · {EUR.format(related.contract.monthly_amount_cents / 100)}/mnd</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              ) : (
                <div className="rounded-md border px-3 py-2 text-muted-foreground">Geen contract gekoppeld</div>
              )}
              {related.invoices.length > 0 ? (
                <Link to="/invoices"
                  className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted">
                  <span>🧾 {related.invoices.length} factu{related.invoices.length === 1 ? "ur" : "ren"}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              ) : (
                <div className="rounded-md border px-3 py-2 text-muted-foreground">Nog geen facturen</div>
              )}
              <div className="pt-2 text-xs font-medium uppercase text-muted-foreground">Snellinks</div>
              <a href="#notities" className="rounded-md border px-3 py-2 hover:bg-muted">📝 Notities</a>
              <a href="#contact" className="rounded-md border px-3 py-2 hover:bg-muted">👤 Contactgegevens</a>
              <a href="#history" className="rounded-md border px-3 py-2 hover:bg-muted">🕓 Statusgeschiedenis</a>
            </CardContent>
          </Card>

          <Card id="history">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm"><History className="h-4 w-4" /> Delivery-historie</CardTitle>
              <CardDescription>{deliveryHistory.length} wijziging{deliveryHistory.length === 1 ? "" : "en"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {deliveryHistory.length === 0 && <p className="text-sm text-muted-foreground">Nog geen wijzigingen.</p>}
              {deliveryHistory.map(h => {
                const who = h.changed_by ? (profiles[h.changed_by]?.display_name || profiles[h.changed_by]?.email || "—") : "Systeem";
                return (
                  <div key={h.id} className="border-l-2 border-muted pl-3 text-xs">
                    <div className="flex flex-wrap items-center gap-1">
                      {h.old_status ? (
                        <>
                          <Badge variant="outline" className="text-[10px]">{DELIVERY_META[h.old_status].label}</Badge>
                          <span className="text-muted-foreground">→</span>
                        </>
                      ) : <span className="text-muted-foreground">Aangemaakt:</span>}
                      <Badge className={`${DELIVERY_META[h.new_status].cls} text-[10px]`}>{DELIVERY_META[h.new_status].label}</Badge>
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      {who} · {new Date(h.changed_at).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {salesHistory.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm"><History className="h-4 w-4" /> Sales-historie</CardTitle>
                <CardDescription>Herkomst van dit project (alleen-lezen)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {salesHistory.map(h => {
                  const who = h.changed_by ? (profiles[h.changed_by]?.display_name || profiles[h.changed_by]?.email || "—") : "Systeem";
                  return (
                    <div key={h.id} className="border-l-2 border-muted pl-3 text-xs">
                      <div className="flex flex-wrap items-center gap-1">
                        {h.old_status ? (
                          <>
                            <Badge variant="outline" className="text-[10px]">{STATUS_META[h.old_status].label}</Badge>
                            <span className="text-muted-foreground">→</span>
                          </>
                        ) : <span className="text-muted-foreground">Aangemaakt:</span>}
                        <Badge className={`${STATUS_META[h.new_status].cls} text-[10px]`}>{STATUS_META[h.new_status].label}</Badge>
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {who} · {new Date(h.changed_at).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
