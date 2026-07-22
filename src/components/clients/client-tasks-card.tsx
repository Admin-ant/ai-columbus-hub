import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, ClipboardList, GripVertical } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type TaskStatus = "nieuw" | "opgepakt" | "wachten" | "afgehandeld";

type TaskRow = {
  id: string;
  title: string | null;
  body: string | null;
  due_at: string | null;
  task_status: TaskStatus;
  created_at: string;
};

const STATUSES: { value: TaskStatus; label: string; color: string }[] = [
  { value: "nieuw", label: "Nieuw", color: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  { value: "opgepakt", label: "Opgepakt", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { value: "wachten", label: "Nog te doen", color: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  { value: "afgehandeld", label: "Afgehandeld", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
];

export function ClientTasksCard({
  clientId,
  organizationId,
}: {
  clientId: string;
  organizationId: string;
}) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [status, setStatus] = useState<TaskStatus>("nieuw");
  const [saving, setSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("crm_activities")
      .select("id, title, body, due_at, task_status, created_at")
      .eq("client_id", clientId)
      .eq("kind", "task")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setTasks((data ?? []) as TaskRow[]);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const buckets = useMemo(() => {
    const map: Record<TaskStatus, TaskRow[]> = { nieuw: [], opgepakt: [], wachten: [], afgehandeld: [] };
    for (const t of tasks) map[t.task_status]?.push(t);
    return map;
  }, [tasks]);

  async function addTask() {
    if (!title.trim() && !body.trim()) { toast.error("Vul een titel of omschrijving in"); return; }
    setSaving(true);
    const { error } = await supabase.from("crm_activities").insert({
      organization_id: organizationId,
      client_id: clientId,
      kind: "task",
      title: title.trim() || null,
      body: body.trim() || null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      task_status: status,
      done: status === "afgehandeld",
      done_at: status === "afgehandeld" ? new Date().toISOString() : null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setTitle(""); setBody(""); setDueAt(""); setStatus("nieuw");
    toast.success("Taak toegevoegd");
    load();
  }

  async function updateStatus(id: string, next: TaskStatus) {
    const prev = tasks;
    setTasks((cur) => cur.map((t) => t.id === id ? { ...t, task_status: next } : t));
    const { error } = await supabase.from("crm_activities").update({
      task_status: next,
      done: next === "afgehandeld",
      done_at: next === "afgehandeld" ? new Date().toISOString() : null,
    }).eq("id", id);
    if (error) { setTasks(prev); toast.error(error.message); }
  }

  async function removeTask(id: string) {
    if (!confirm("Weet je zeker dat je deze taak wilt verwijderen?")) return;
    const prev = tasks;
    setTasks((cur) => cur.filter((t) => t.id !== id));
    const { error } = await supabase.from("crm_activities").delete().eq("id", id);
    if (error) { setTasks(prev); toast.error(error.message); }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4" /> Taken
          <Badge variant="secondary" className="ml-2">{tasks.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
            <Input placeholder="Nieuwe taak (bv. Bellen met contactpersoon)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={addTask} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-4 w-4" /> Toevoegen</>}
            </Button>
          </div>
          <Textarea rows={2} placeholder="Optionele toelichting…" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laden…</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {STATUSES.map((s) => (
              <div
                key={s.value}
                className="rounded-md border bg-card p-2 min-h-[120px]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (draggedId) { updateStatus(draggedId, s.value); setDraggedId(null); } }}
              >
                <div className="flex items-center justify-between px-1 py-1">
                  <Badge className={s.color} variant="secondary">{s.label}</Badge>
                  <span className="text-xs text-muted-foreground">{buckets[s.value].length}</span>
                </div>
                <div className="space-y-2 mt-2">
                  {buckets[s.value].length === 0 ? (
                    <p className="text-xs text-muted-foreground px-1">Sleep hier een taak heen.</p>
                  ) : buckets[s.value].map((t) => {
                    const due = t.due_at ? new Date(t.due_at) : null;
                    const overdue = due && s.value !== "afgehandeld" && due < new Date();
                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={() => setDraggedId(t.id)}
                        onDragEnd={() => setDraggedId(null)}
                        className="rounded-md border bg-background p-2 text-sm space-y-1 cursor-grab active:cursor-grabbing"
                      >
                        <div className="flex items-start gap-1">
                          <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            {t.title && <div className="font-medium truncate">{t.title}</div>}
                            {t.body && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{t.body}</div>}
                            {due && (
                              <div className={`text-xs mt-1 ${overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                                {due.toLocaleString("nl-NL")}
                              </div>
                            )}
                          </div>
                          <button onClick={() => removeTask(t.id)} className="text-muted-foreground hover:text-red-600" title="Verwijderen">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <Select value={t.task_status} onValueChange={(v) => updateStatus(t.id, v as TaskStatus)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
