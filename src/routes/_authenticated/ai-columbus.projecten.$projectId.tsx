import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Mail, Phone, StickyNote, History, Save } from "lucide-react";
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
type HistoryRow = Database["public"]["Tables"]["project_status_history"]["Row"];
type ProjectStatus = Database["public"]["Enums"]["project_status"];

const EUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

const STATUS_META: Record<ProjectStatus, { label: string; cls: string }> = {
  contact_gezocht:    { label: "Contact gezocht",    cls: "bg-blue-500 text-white" },
  afspraak_geboekt:   { label: "Afspraak geboekt",   cls: "bg-green-500 text-white" },
  offerte_verstuurd:  { label: "Offerte verstuurd",  cls: "bg-yellow-400 text-black" },
  contract_verstuurd: { label: "Contract verstuurd", cls: "bg-orange-500 text-white" },
  contract_getekend:  { label: "Contract getekend",  cls: "bg-emerald-700 text-white" },
  on_hold:            { label: "On hold",            cls: "bg-slate-400 text-white" },
};
const STATUS_KEYS = Object.keys(STATUS_META) as ProjectStatus[];

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { user } = useAuth();
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { display_name: string | null; email: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<ProjectRow>>({});

  async function load() {
    setLoading(true);
    const [{ data: p, error: pe }, { data: h }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
      supabase.from("project_status_history").select("*").eq("project_id", projectId).order("changed_at", { ascending: false }),
    ]);
    if (pe) toast.error(pe.message);
    setProject(p as ProjectRow | null);
    setForm(p ?? {});
    const hist = (h ?? []) as HistoryRow[];
    setHistory(hist);
    const ids = Array.from(new Set(hist.map(r => r.changed_by).filter(Boolean))) as string[];
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
    const patch = {
      name: form.name?.trim() || project.name,
      value_cents: form.value_cents ?? project.value_cents,
      target_month: form.target_month ?? null,
      status: (form.status ?? project.status) as ProjectStatus,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild><Link to="/ai-columbus/projecten"><ArrowLeft className="mr-2 h-4 w-4" /> Projecten</Link></Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            <p className="text-sm text-muted-foreground">{EUR.format(Number(project.value_cents) / 100)} · <Badge className={STATUS_META[project.status].cls}>{STATUS_META[project.status].label}</Badge></p>
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Projectgegevens</CardTitle>
            <CardDescription>Alle velden van dit project</CardDescription>
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
              <Label>Doelmaand</Label>
              <Input type="month" value={form.target_month ? String(form.target_month).slice(0,7) : ""}
                onChange={e => setForm({ ...form, target_month: e.target.value ? `${e.target.value}-01` : null })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Status</Label>
              <Select value={(form.status ?? project.status) as ProjectStatus}
                onValueChange={v => setForm({ ...form, status: v as ProjectStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_KEYS.map(s => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
                </SelectContent>
              </Select>
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
              <CardTitle className="text-sm">Snellinks</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <a href="#notities" className="rounded-md border px-3 py-2 hover:bg-muted">📝 Notities</a>
              <a href="#contact" className="rounded-md border px-3 py-2 hover:bg-muted">👤 Contactgegevens</a>
              <a href="#history" className="rounded-md border px-3 py-2 hover:bg-muted">🕓 Statusgeschiedenis</a>
            </CardContent>
          </Card>

          <Card id="history">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm"><History className="h-4 w-4" /> Statusgeschiedenis</CardTitle>
              <CardDescription>{history.length} wijziging{history.length === 1 ? "" : "en"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {history.length === 0 && <p className="text-sm text-muted-foreground">Nog geen wijzigingen.</p>}
              {history.map(h => {
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
        </div>
      </div>
    </div>
  );
}
