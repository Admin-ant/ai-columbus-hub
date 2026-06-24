import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Loader2, Phone, Mail, Users, ClipboardList, FileText, Trash2, CheckCircle2, Circle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  listCrmActivities,
  createCrmActivity,
  toggleCrmActivityDone,
  deleteCrmActivity,
} from "@/lib/enterprise.functions";

export const Route = createFileRoute("/_authenticated/crm/activities")({
  head: () => ({ meta: [{ title: "CRM Activiteiten" }] }),
  component: CrmActivitiesPage,
});

type Activity = {
  id: string;
  kind: "note" | "call" | "meeting" | "task" | "email";
  title: string | null;
  body: string | null;
  due_at: string | null;
  done: boolean;
  done_at: string | null;
  created_at: string;
  created_by: string | null;
  client_id: string | null;
  quote_id: string | null;
  target_id: string | null;
};

const KIND_META: Record<Activity["kind"], { label: string; icon: typeof Phone; color: string }> = {
  call: { label: "Gesprek", icon: Phone, color: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  email: { label: "E-mail", icon: Mail, color: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  meeting: { label: "Meeting", icon: Users, color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  task: { label: "Taak", icon: ClipboardList, color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  note: { label: "Notitie", icon: FileText, color: "bg-muted text-foreground" },
};

function CrmActivitiesPage() {
  const { currentOrganizationId } = useWorkspace();
  const listFn = useServerFn(listCrmActivities);
  const createFn = useServerFn(createCrmActivity);
  const toggleFn = useServerFn(toggleCrmActivityDone);
  const deleteFn = useServerFn(deleteCrmActivity);

  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterKind, setFilterKind] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "done">("open");
  const [view, setView] = useState<"kanban" | "list">("kanban");

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<{ kind: Activity["kind"]; title: string; body: string; due_at: string }>({
    kind: "task", title: "", body: "", due_at: "",
  });

  const load = async () => {
    if (!currentOrganizationId) return;
    setLoading(true);
    try {
      const rows = await listFn({ data: { organization_id: currentOrganizationId } });
      setItems(rows as Activity[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentOrganizationId]);

  const filtered = useMemo(() => items.filter((a) => {
    if (filterKind !== "all" && a.kind !== filterKind) return false;
    if (filterStatus === "open" && a.done) return false;
    if (filterStatus === "done" && !a.done) return false;
    return true;
  }), [items, filterKind, filterStatus]);

  const buckets = useMemo(() => {
    const overdue: Activity[] = [];
    const today: Activity[] = [];
    const upcoming: Activity[] = [];
    const noDate: Activity[] = [];
    const done: Activity[] = [];
    const now = new Date();
    const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
    for (const a of filtered) {
      if (a.done) { done.push(a); continue; }
      if (!a.due_at) { noDate.push(a); continue; }
      const d = new Date(a.due_at);
      if (d < now) overdue.push(a);
      else if (d <= endOfToday) today.push(a);
      else upcoming.push(a);
    }
    return { overdue, today, upcoming, noDate, done };
  }, [filtered]);

  const submit = async () => {
    if (!currentOrganizationId) return;
    if (!form.title.trim() && !form.body.trim()) {
      toast.error("Vul minstens een titel of beschrijving in");
      return;
    }
    setSubmitting(true);
    try {
      await createFn({
        data: {
          organization_id: currentOrganizationId,
          kind: form.kind,
          title: form.title.trim() || null,
          body: form.body.trim() || null,
          due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        },
      });
      toast.success("Activiteit toegevoegd");
      setForm({ kind: "task", title: "", body: "", due_at: "" });
      setOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (a: Activity) => {
    try {
      await toggleFn({ data: { id: a.id, done: !a.done } });
      setItems((prev) => prev.map((x) => x.id === a.id ? { ...x, done: !a.done, done_at: !a.done ? new Date().toISOString() : null } : x));
    } catch (e) { toast.error((e as Error).message); }
  };

  const remove = async (a: Activity) => {
    if (!confirm("Verwijder deze activiteit?")) return;
    try {
      await deleteFn({ data: { id: a.id } });
      setItems((prev) => prev.filter((x) => x.id !== a.id));
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">CRM Activiteiten</h1>
          <p className="text-sm text-muted-foreground">Plan en log gesprekken, taken, meetings en notities per organisatie.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nieuwe activiteit</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nieuwe activiteit</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Type</Label>
                <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as Activity["kind"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_META) as Activity["kind"][]).map((k) => (
                      <SelectItem key={k} value={k}>{KIND_META[k].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Titel</Label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="bv. Bellen met prospect" />
              </div>
              <div>
                <Label>Notitie / details</Label>
                <Textarea rows={3} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
              </div>
              <div>
                <Label>Deadline (optioneel)</Label>
                <Input type="datetime-local" value={form.due_at} onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Annuleer</Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Opslaan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterKind} onValueChange={setFilterKind}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle types</SelectItem>
            {(Object.keys(KIND_META) as Activity["kind"][]).map((k) => (
              <SelectItem key={k} value={k}>{KIND_META[k].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="done">Afgerond</SelectItem>
            <SelectItem value="all">Alles</SelectItem>
          </SelectContent>
        </Select>
        <Tabs value={view} onValueChange={(v) => setView(v as "kanban" | "list")} className="ml-auto">
          <TabsList>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="list">Lijst</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laden…</div>
      ) : view === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {(["overdue", "today", "upcoming", "noDate", "done"] as const).map((key) => {
            const label = { overdue: "Te laat", today: "Vandaag", upcoming: "Komend", noDate: "Geen datum", done: "Afgerond" }[key];
            const list = buckets[key];
            return (
              <Card key={key}>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>{label}</span>
                    <Badge variant="secondary">{list.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {list.length === 0 ? <p className="text-xs text-muted-foreground">Niets</p> : list.map((a) => <ActivityCard key={a.id} a={a} onToggle={toggle} onDelete={remove} />)}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Geen activiteiten.</p>
          ) : filtered.map((a) => <ActivityCard key={a.id} a={a} onToggle={toggle} onDelete={remove} />)}
        </div>
      )}
    </div>
  );
}

function ActivityCard({ a, onToggle, onDelete }: { a: Activity; onToggle: (a: Activity) => void; onDelete: (a: Activity) => void }) {
  const meta = KIND_META[a.kind];
  const Icon = meta.icon;
  const due = a.due_at ? new Date(a.due_at) : null;
  const overdue = due && !a.done && due < new Date();
  return (
    <div className={`rounded-md border bg-card p-3 text-sm space-y-1 ${a.done ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-2">
        <button onClick={() => onToggle(a)} className="mt-0.5 text-muted-foreground hover:text-foreground" title={a.done ? "Heropen" : "Markeer klaar"}>
          {a.done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={meta.color} variant="secondary"><Icon className="mr-1 h-3 w-3" />{meta.label}</Badge>
            {due && <span className={`text-xs ${overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>{due.toLocaleString("nl-NL")}</span>}
          </div>
          {a.title && <div className={`font-medium mt-1 ${a.done ? "line-through" : ""}`}>{a.title}</div>}
          {a.body && <div className="text-xs text-muted-foreground whitespace-pre-wrap mt-0.5">{a.body}</div>}
        </div>
        <button onClick={() => onDelete(a)} className="text-muted-foreground hover:text-red-600" title="Verwijderen">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
