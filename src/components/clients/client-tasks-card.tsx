import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, ClipboardList, GripVertical, MessageSquare, Send, Users, X, Check, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type TaskStatus = "nieuw" | "opgepakt" | "wachten" | "afgehandeld";

type TaskComment = {
  id: string;
  author_id: string | null;
  author_email: string | null;
  body: string;
  created_at: string;
};

type TaskRow = {
  id: string;
  title: string | null;
  body: string | null;
  due_at: string | null;
  task_status: TaskStatus;
  created_at: string;
  comments: TaskComment[] | null;
  assignee_ids: string[] | null;
};

type Member = {
  user_id: string;
  display_name: string | null;
  email: string | null;
};

const STATUSES: { value: TaskStatus; label: string; color: string }[] = [
  { value: "nieuw", label: "Nieuw", color: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  { value: "opgepakt", label: "Opgepakt", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { value: "wachten", label: "Nog te doen", color: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  { value: "afgehandeld", label: "Afgehandeld", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
];

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initialsOf(m: Member | undefined): string {
  if (!m) return "?";
  const src = (m.display_name || m.email || "?").trim();
  const parts = src.split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase() || src[0]?.toUpperCase() || "?";
}

function AssigneePicker({
  members,
  selected,
  onChange,
  placeholder = "Toewijzen…",
}: {
  members: Member[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((m) =>
      (m.display_name || "").toLowerCase().includes(needle) ||
      (m.email || "").toLowerCase().includes(needle)
    );
  }, [members, q]);

  function toggle(id: string) {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="justify-start gap-1 font-normal">
          <Users className="h-3.5 w-3.5" />
          {selected.length === 0 ? <span className="text-muted-foreground">{placeholder}</span> : <span>{selected.length} toegewezen</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input placeholder="Zoek medewerker…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2 h-8" />
        <div className="max-h-56 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">Geen medewerkers gevonden.</p>
          ) : filtered.map((m) => {
            const active = selected.includes(m.user_id);
            return (
              <button
                key={m.user_id}
                onClick={() => toggle(m.user_id)}
                className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${active ? "bg-accent/60" : ""}`}
              >
                <Avatar className="h-6 w-6"><AvatarFallback className="text-[10px]">{initialsOf(m)}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{m.display_name || m.email || "Onbekend"}</div>
                  {m.email && m.display_name && <div className="text-[10px] text-muted-foreground truncate">{m.email}</div>}
                </div>
                {active && <Check className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AssigneeChips({ ids, members, max = 3 }: { ids: string[]; members: Map<string, Member>; max?: number }) {
  if (!ids || ids.length === 0) return null;
  const visible = ids.slice(0, max);
  const rest = ids.length - visible.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((id) => {
        const m = members.get(id);
        return (
          <Avatar key={id} className="h-5 w-5 border-2 border-background" title={m?.display_name || m?.email || "Onbekend"}>
            <AvatarFallback className="text-[9px]">{initialsOf(m)}</AvatarFallback>
          </Avatar>
        );
      })}
      {rest > 0 && (
        <div className="h-5 min-w-5 rounded-full border-2 border-background bg-muted px-1 text-[9px] leading-[calc(1.25rem-4px)] text-center text-muted-foreground">
          +{rest}
        </div>
      )}
    </div>
  );
}

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
  const [newAssignees, setNewAssignees] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const [members, setMembers] = useState<Member[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);

  const membersMap = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("crm_activities")
      .select("id, title, body, due_at, task_status, created_at, comments, assignee_ids")
      .eq("client_id", clientId)
      .eq("kind", "task")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setTasks((data ?? []) as TaskRow[]);
  }, [clientId]);

  const loadMembers = useCallback(async () => {
    const { data: mem, error } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", organizationId);
    if (error) { console.warn(error); return; }
    const ids = Array.from(new Set((mem ?? []).map((r: any) => r.user_id)));
    if (ids.length === 0) { setMembers([]); return; }
    const { data: profs, error: perr } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", ids);
    if (perr) { console.warn(perr); return; }
    const rows: Member[] = (profs ?? []).map((p: any) => ({ user_id: p.id, display_name: p.display_name, email: p.email }));
    rows.sort((a, b) => (a.display_name || a.email || "").localeCompare(b.display_name || b.email || ""));
    setMembers(rows);
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMembers(); }, [loadMembers]);

  const filteredTasks = useMemo(() => {
    if (assigneeFilter.length === 0) return tasks;
    return tasks.filter((t) => {
      const ids = t.assignee_ids ?? [];
      return assigneeFilter.some((f) => ids.includes(f));
    });
  }, [tasks, assigneeFilter]);

  const buckets = useMemo(() => {
    const map: Record<TaskStatus, TaskRow[]> = { nieuw: [], opgepakt: [], wachten: [], afgehandeld: [] };
    for (const t of filteredTasks) map[t.task_status]?.push(t);
    return map;
  }, [filteredTasks]);

  const detailTask = useMemo(() => tasks.find((t) => t.id === detailId) ?? null, [tasks, detailId]);

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
      assignee_ids: newAssignees,
      done: status === "afgehandeld",
      done_at: status === "afgehandeld" ? new Date().toISOString() : null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setTitle(""); setBody(""); setDueAt(""); setStatus("nieuw"); setNewAssignees([]);
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
          <div className="ml-auto flex items-center gap-2">
            <AssigneePicker
              members={members}
              selected={assigneeFilter}
              onChange={setAssigneeFilter}
              placeholder="Filter op toegewezen"
            />
            {assigneeFilter.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setAssigneeFilter([])} className="h-8 px-2 text-xs">
                <X className="h-3 w-3 mr-1" />Wis
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto_auto]">
            <Input placeholder="Nieuwe taak (bv. Bellen met contactpersoon)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <AssigneePicker members={members} selected={newAssignees} onChange={setNewAssignees} />
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
                    <p className="text-xs text-muted-foreground px-1">
                      {assigneeFilter.length > 0 ? "Geen taken voor filter." : "Sleep hier een taak heen."}
                    </p>
                  ) : buckets[s.value].map((t) => {
                    const due = t.due_at ? new Date(t.due_at) : null;
                    const overdue = due && s.value !== "afgehandeld" && due < new Date();
                    const commentCount = Array.isArray(t.comments) ? t.comments.length : 0;
                    const assignees = t.assignee_ids ?? [];
                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={() => setDraggedId(t.id)}
                        onDragEnd={() => setDraggedId(null)}
                        onClick={() => setDetailId(t.id)}
                        className="rounded-md border bg-background p-2 text-sm space-y-1 cursor-pointer hover:border-primary/50 transition-colors"
                      >
                        <div className="flex items-start gap-1">
                          <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0 cursor-grab active:cursor-grabbing" onClick={(e) => e.stopPropagation()} />
                          <div className="flex-1 min-w-0">
                            {t.title && <div className="font-medium truncate">{t.title}</div>}
                            {t.body && <div className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{t.body}</div>}
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {due && (
                                <span className={`text-xs ${overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                                  {due.toLocaleString("nl-NL")}
                                </span>
                              )}
                              {commentCount > 0 && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <MessageSquare className="h-3 w-3" />{commentCount}
                                </span>
                              )}
                              {assignees.length > 0 && <AssigneeChips ids={assignees} members={membersMap} />}
                            </div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); removeTask(t.id); }} className="text-muted-foreground hover:text-red-600" title="Verwijderen">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <TaskDetailDialog
        task={detailTask}
        members={members}
        membersMap={membersMap}
        onClose={() => setDetailId(null)}
        onChanged={(updated) => setTasks((cur) => cur.map((t) => t.id === updated.id ? { ...t, ...updated } : t))}
      />
    </Card>
  );
}

function TaskDetailDialog({
  task,
  members,
  membersMap,
  onClose,
  onChanged,
}: {
  task: TaskRow | null;
  members: Member[];
  membersMap: Map<string, Member>;
  onClose: () => void;
  onChanged: (t: TaskRow) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [status, setStatus] = useState<TaskStatus>("nieuw");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [savingMeta, setSavingMeta] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title ?? "");
    setBody(task.body ?? "");
    setDueAt(toDatetimeLocal(task.due_at));
    setStatus(task.task_status);
    setAssignees(task.assignee_ids ?? []);
    setNewComment("");
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!task) return null;

  const comments = Array.isArray(task.comments) ? task.comments : [];

  const selectCols = "id, title, body, due_at, task_status, created_at, comments, assignee_ids";

  async function saveMeta() {
    if (!task) return;
    setSavingMeta(true);
    const patch = {
      title: title.trim() || null,
      body: body.trim() || null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      task_status: status,
      assignee_ids: assignees,
      done: status === "afgehandeld",
      done_at: status === "afgehandeld" ? new Date().toISOString() : null,
    };
    const { data, error } = await supabase
      .from("crm_activities")
      .update(patch)
      .eq("id", task.id)
      .select(selectCols)
      .single();
    setSavingMeta(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Taak bijgewerkt");
    onChanged(data as TaskRow);
  }

  async function addComment() {
    if (!task) return;
    const text = newComment.trim();
    if (!text) return;
    setPostingComment(true);
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    const entry: TaskComment = {
      id: (crypto.randomUUID?.() ?? String(Date.now())),
      author_id: user?.id ?? null,
      author_email: user?.email ?? null,
      body: text,
      created_at: new Date().toISOString(),
    };
    const next = [...comments, entry];
    const { data, error } = await supabase
      .from("crm_activities")
      .update({ comments: next })
      .eq("id", task.id)
      .select(selectCols)
      .single();
    setPostingComment(false);
    if (error) { toast.error(error.message); return; }
    setNewComment("");
    onChanged(data as TaskRow);
  }

  async function deleteComment(id: string) {
    if (!task) return;
    const next = comments.filter((c) => c.id !== id);
    const { data, error } = await supabase
      .from("crm_activities")
      .update({ comments: next })
      .eq("id", task.id)
      .select(selectCols)
      .single();
    if (error) { toast.error(error.message); return; }
    onChanged(data as TaskRow);
  }

  return (
    <Dialog open={!!task} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> Taakdetails
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Titel</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label>Beschrijving</Label>
              <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <div>
              <Label>Deadline</Label>
              <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Toegewezen aan</Label>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <AssigneePicker members={members} selected={assignees} onChange={setAssignees} />
                {assignees.map((id) => {
                  const m = membersMap.get(id);
                  return (
                    <Badge key={id} variant="secondary" className="gap-1 pr-1">
                      <Avatar className="h-4 w-4"><AvatarFallback className="text-[9px]">{initialsOf(m)}</AvatarFallback></Avatar>
                      <span>{m?.display_name || m?.email || "Onbekend"}</span>
                      <button onClick={() => setAssignees(assignees.filter((x) => x !== id))} className="hover:text-red-600 ml-1">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
                {assignees.length === 0 && <span className="text-xs text-muted-foreground">Niemand toegewezen.</span>}
              </div>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <h3 className="text-sm font-medium">Opmerkingen</h3>
              <Badge variant="secondary">{comments.length}</Badge>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen opmerkingen.</p>
              ) : comments.slice().reverse().map((c) => (
                <div key={c.id} className="rounded-md border bg-muted/30 p-2 text-sm">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {c.author_email ?? "Onbekend"} · {new Date(c.created_at).toLocaleString("nl-NL")}
                    </span>
                    <button onClick={() => deleteComment(c.id)} className="text-muted-foreground hover:text-red-600" title="Verwijderen">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Textarea
                rows={2}
                placeholder="Schrijf een opmerking…"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addComment(); }
                }}
              />
              <Button onClick={addComment} disabled={postingComment || !newComment.trim()}>
                {postingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Tip: Cmd/Ctrl + Enter om te plaatsen.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Sluiten</Button>
          <Button onClick={saveMeta} disabled={savingMeta}>
            {savingMeta && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
