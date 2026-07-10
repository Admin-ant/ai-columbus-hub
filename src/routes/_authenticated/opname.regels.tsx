import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  listCallRecorderRules, upsertCallRecorderRule, deleteCallRecorderRule,
} from "@/lib/call-recorder.functions";

export const Route = createFileRoute("/_authenticated/opname/regels")({
  head: () => ({ meta: [{ title: "Opname-regels" }] }),
  component: RegelsPage,
});

const STAGES = [
  { value: "nieuw", label: "Nieuw" },
  { value: "in_gesprek", label: "In gesprek" },
  { value: "voorstel", label: "Voorstel gedaan" },
  { value: "onderhandeling", label: "Onderhandeling" },
  { value: "gewonnen", label: "Gewonnen" },
  { value: "verloren", label: "Verloren" },
];

type Rule = {
  id: string;
  organization_id: string;
  name: string;
  keywords: string[];
  action_kind: "create_task" | "set_stage";
  task_title: string | null;
  task_body: string | null;
  task_due_days: number;
  target_stage: string | null;
  priority: number;
  enabled: boolean;
};

function emptyRule(orgId: string): Rule {
  return {
    id: "",
    organization_id: orgId,
    name: "",
    keywords: [],
    action_kind: "create_task",
    task_title: "",
    task_body: "",
    task_due_days: 3,
    target_stage: null,
    priority: 100,
    enabled: true,
  };
}

function RegelsPage() {
  const { currentOrganizationId } = useWorkspace();
  const list = useServerFn(listCallRecorderRules);
  const upsert = useServerFn(upsertCallRecorderRule);
  const del = useServerFn(deleteCallRecorderRule);

  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [keywordsRaw, setKeywordsRaw] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    if (!currentOrganizationId) return;
    setLoading(true);
    try {
      const r = await list({ data: { organization_id: currentOrganizationId } });
      setRules(r.rows as Rule[]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentOrganizationId]);

  function startNew() {
    if (!currentOrganizationId) return;
    const r = emptyRule(currentOrganizationId);
    setEditing(r);
    setKeywordsRaw("");
  }
  function startEdit(r: Rule) {
    setEditing({ ...r });
    setKeywordsRaw((r.keywords ?? []).join(", "));
  }

  async function save() {
    if (!editing || !currentOrganizationId) return;
    if (!editing.name.trim()) { toast.error("Naam is verplicht"); return; }
    const kws = keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean);
    if (kws.length === 0) { toast.error("Voeg minstens één trefwoord toe"); return; }
    if (editing.action_kind === "create_task" && !editing.task_title?.trim()) {
      toast.error("Taaktitel is verplicht"); return;
    }
    if (editing.action_kind === "set_stage" && !editing.target_stage) {
      toast.error("Kies een doelfase"); return;
    }
    setSaving(true);
    try {
      await upsert({
        data: {
          id: editing.id || null,
          organization_id: currentOrganizationId,
          name: editing.name.trim(),
          keywords: kws,
          action_kind: editing.action_kind,
          task_title: editing.task_title ?? null,
          task_body: editing.task_body ?? null,
          task_due_days: editing.task_due_days,
          target_stage: editing.target_stage ?? null,
          priority: editing.priority,
          enabled: editing.enabled,
        },
      });
      toast.success("Regel opgeslagen");
      setEditing(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Regel verwijderen?")) return;
    try {
      await del({ data: { id } });
      toast.success("Verwijderd");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24">
      <div>
        <Link to="/opname" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Terug naar recorder
        </Link>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Opname-regels</h1>
        <p className="text-sm text-muted-foreground">
          Bepaal welke zinsnedes in het gesprek automatisch een taak aanmaken of een lead-fase updaten.
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={startNew}><Plus className="mr-1 h-4 w-4" /> Nieuwe regel</Button>
      </div>

      {editing && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{editing.id ? "Regel bewerken" : "Nieuwe regel"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label>Naam</Label>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="bv. Offerte gevraagd" />
            </div>
            <div className="grid gap-2">
              <Label>Trefwoorden (komma-gescheiden)</Label>
              <Input value={keywordsRaw} onChange={(e) => setKeywordsRaw(e.target.value)} placeholder="offerte, prijsopgave, kosten" />
              <p className="text-xs text-muted-foreground">Regel wordt geactiveerd als één trefwoord in transcript of rapport voorkomt (case-insensitive).</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Actie</Label>
                <Select value={editing.action_kind} onValueChange={(v) => setEditing({ ...editing, action_kind: v as Rule["action_kind"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create_task">Taak aanmaken</SelectItem>
                    <SelectItem value="set_stage">Lead-fase updaten</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Prioriteit</Label>
                <Input type="number" value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) || 0 })} />
              </div>
            </div>

            {editing.action_kind === "create_task" && (
              <div className="grid gap-3 rounded-md border p-3">
                <div className="grid gap-2">
                  <Label>Taaktitel</Label>
                  <Input value={editing.task_title ?? ""} onChange={(e) => setEditing({ ...editing, task_title: e.target.value })} placeholder="bv. Offerte opstellen en versturen" />
                </div>
                <div className="grid gap-2">
                  <Label>Omschrijving</Label>
                  <Textarea value={editing.task_body ?? ""} onChange={(e) => setEditing({ ...editing, task_body: e.target.value })} rows={3} />
                </div>
                <div className="grid gap-2 sm:max-w-[200px]">
                  <Label>Deadline (dagen)</Label>
                  <Input type="number" value={editing.task_due_days} onChange={(e) => setEditing({ ...editing, task_due_days: Number(e.target.value) || 0 })} />
                </div>
              </div>
            )}

            {editing.action_kind === "set_stage" && (
              <div className="grid gap-2 rounded-md border p-3">
                <Label>Nieuwe lead-fase</Label>
                <Select value={editing.target_stage ?? ""} onValueChange={(v) => setEditing({ ...editing, target_stage: v })}>
                  <SelectTrigger><SelectValue placeholder="Kies fase" /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch checked={editing.enabled} onCheckedChange={(v) => setEditing({ ...editing, enabled: v })} />
              <Label>Actief</Label>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Annuleren</Button>
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                Opslaan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Alle regels</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Laden...</div>
          ) : rules.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nog geen regels. Voeg er één toe hierboven.</div>
          ) : (
            <ul className="divide-y">
              {rules.map((r) => (
                <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{r.name}</span>
                      {!r.enabled && <Badge variant="outline">uit</Badge>}
                      <Badge variant="secondary">
                        {r.action_kind === "create_task" ? `Taak: ${r.task_title ?? "—"}` : `Fase → ${r.target_stage}`}
                      </Badge>
                      <Badge variant="outline">prio {r.priority}</Badge>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      Trefwoorden: {(r.keywords ?? []).join(", ") || "—"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit(r)}>Bewerken</Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
