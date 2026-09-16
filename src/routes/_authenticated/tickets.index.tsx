import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download, LayoutList, Columns3, Loader2, Plus, RefreshCw, Search, Settings2, Ticket as TicketIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  createTicket, listTicketAgents, listTicketClients, listTickets,
  TICKET_PRIORITIES, TICKET_STATUSES, type TicketPriority, type TicketStatus,
} from "@/lib/tickets.functions";

export const Route = createFileRoute("/_authenticated/tickets/")({
  head: () => ({
    meta: [
      { title: "Tickets — support en meldingen" },
      { name: "description", content: "Beheer klantmeldingen en interne tickets met prioriteit, status en eigenaar." },
      { property: "og:title", content: "Tickets — support en meldingen" },
      { property: "og:description", content: "Beheer klantmeldingen en interne tickets op één plek." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TicketsPage,
});

export const STATUS_LABEL: Record<TicketStatus, string> = {
  nieuw: "Nieuw",
  in_behandeling: "In behandeling",
  wachten_op_klant: "Wachten op klant",
  opgelost: "Opgelost",
  gesloten: "Gesloten",
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  laag: "Laag",
  normaal: "Normaal",
  hoog: "Hoog",
  urgent: "Urgent",
};

export function priorityVariant(p: string): "default" | "secondary" | "destructive" | "outline" {
  if (p === "urgent") return "destructive";
  if (p === "hoog") return "default";
  if (p === "laag") return "outline";
  return "secondary";
}

type Row = {
  id: string;
  ticket_number: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  source: string;
  category_id: string | null;
  client_id: string | null;
  assigned_to: string | null;
  requester_name: string | null;
  is_internal: boolean;
  last_message_at: string;
  created_at: string;
  client_name: string | null;
  assignee_name: string | null;
  category_name: string | null;
};

function fmt(d: string) {
  return new Date(d).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
}

function TicketsPage() {
  const { currentOrganizationId } = useWorkspace();
  const navigate = useNavigate();
  const list = useServerFn(listTickets);
  const agentsFn = useServerFn(listTicketAgents);
  const clientsFn = useServerFn(listTicketClients);
  const create = useServerFn(createTicket);

  const [rows, setRows] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string | null; email: string | null; phone: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "board">("list");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("open");
  const [priority, setPriority] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [assignee, setAssignee] = useState<string>("all");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    subject: "", body: "", priority: "normaal" as TicketPriority,
    category_id: "", client_id: "", assigned_to: "",
    requester_name: "", requester_email: "", requester_phone: "", is_internal: false,
  });

  const refresh = useCallback(async () => {
    if (!currentOrganizationId) return;
    setLoading(true);
    try {
      const statusFilter =
        status === "all" ? undefined
        : status === "open" ? (["nieuw", "in_behandeling", "wachten_op_klant"] as TicketStatus[])
        : ([status] as TicketStatus[]);
      const res = await list({
        data: {
          organization_id: currentOrganizationId,
          status: statusFilter,
          priority: priority === "all" ? undefined : ([priority] as TicketPriority[]),
          category_id: category === "all" ? null : category,
          assigned_to: assignee === "all" ? null : assignee,
          search: search.trim() || undefined,
          limit: 300,
        },
      });
      setRows(res.rows as Row[]);
      setCategories(res.categories as Array<{ id: string; name: string }>);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Laden mislukt");
    } finally {
      setLoading(false);
    }
  }, [currentOrganizationId, status, priority, category, assignee, search, list]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!currentOrganizationId) return;
    void (async () => {
      try {
        const [a, c] = await Promise.all([
          agentsFn({ data: { organization_id: currentOrganizationId } }),
          clientsFn({ data: { organization_id: currentOrganizationId } }),
        ]);
        setAgents(a as Array<{ id: string; name: string }>);
        setClients(c as never);
      } catch { /* stil */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganizationId]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      nieuw: rows.filter((r) => r.status === "nieuw").length,
      bezig: rows.filter((r) => r.status === "in_behandeling").length,
      wachten: rows.filter((r) => r.status === "wachten_op_klant").length,
      opgelost: rows.filter((r) => r.status === "opgelost" && r.last_message_at.slice(0, 10) === today).length,
    };
  }, [rows]);

  async function submit() {
    if (!currentOrganizationId) return;
    if (!form.subject.trim()) { toast.error("Onderwerp is verplicht"); return; }
    setSaving(true);
    try {
      const res = await create({
        data: {
          organization_id: currentOrganizationId,
          subject: form.subject.trim(),
          body: form.body,
          priority: form.priority,
          source: form.is_internal ? "intern" : "manual",
          category_id: form.category_id || null,
          client_id: form.client_id || null,
          assigned_to: form.assigned_to || null,
          requester_name: form.requester_name || null,
          requester_email: form.requester_email || null,
          requester_phone: form.requester_phone || null,
          is_internal: form.is_internal,
        },
      });
      toast.success(`Ticket ${res.ticket_number} aangemaakt`);
      setOpen(false);
      setForm({
        subject: "", body: "", priority: "normaal", category_id: "", client_id: "",
        assigned_to: "", requester_name: "", requester_email: "", requester_phone: "", is_internal: false,
      });
      void navigate({ to: "/tickets/$ticketId", params: { ticketId: res.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aanmaken mislukt");
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const head = ["Nummer", "Onderwerp", "Status", "Prioriteit", "Klant", "Eigenaar", "Categorie", "Laatste update"];
    const lines = rows.map((r) => [
      r.ticket_number, r.subject, STATUS_LABEL[r.status], PRIORITY_LABEL[r.priority],
      r.client_name ?? r.requester_name ?? "", r.assignee_name ?? "", r.category_name ?? "", fmt(r.last_message_at),
    ]);
    const csv = [head, ...lines]
      .map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
            <TicketIcon className="h-6 w-6" /> Tickets
          </h1>
          <p className="text-sm text-muted-foreground">
            Meldingen van klanten en collega&apos;s, met prioriteit, eigenaar en volledige geschiedenis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/tickets/instellingen"><Settings2 className="mr-1 h-4 w-4" /> Categorieën</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download className="mr-1 h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="mr-1 h-4 w-4" /> Vernieuwen
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> Nieuw ticket</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Nieuw", value: stats.nieuw },
          { label: "In behandeling", value: stats.bezig },
          { label: "Wachten op klant", value: stats.wachten },
          { label: "Vandaag opgelost", value: stats.opgelost },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-2xl font-semibold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Zoek op nummer, onderwerp of melder" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Alleen open</SelectItem>
                <SelectItem value="all">Alle statussen</SelectItem>
                {TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle prioriteiten</SelectItem>
                {TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle categorieën</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Iedereen</SelectItem>
                <SelectItem value="unassigned">Niet toegewezen</SelectItem>
                {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => setView(view === "list" ? "board" : "list")} title={view === "list" ? "Bordweergave" : "Lijstweergave"}>
              {view === "list" ? <Columns3 className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Laden...
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Geen tickets gevonden.</div>
          ) : view === "list" ? (
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link
                    to="/tickets/$ticketId"
                    params={{ ticketId: r.id }}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{r.ticket_number}</span>
                        <span className="truncate text-sm font-medium">{r.subject}</span>
                        {r.is_internal && <Badge variant="outline">intern</Badge>}
                        {r.category_name && <Badge variant="secondary">{r.category_name}</Badge>}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {r.client_name ?? r.requester_name ?? "Zonder klant"} · {r.assignee_name ?? "niet toegewezen"} · {fmt(r.last_message_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={priorityVariant(r.priority)}>{PRIORITY_LABEL[r.priority]}</Badge>
                      <Badge variant="outline">{STATUS_LABEL[r.status]}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
              {TICKET_STATUSES.map((s) => (
                <div key={s} className="rounded-md border bg-muted/30 p-2">
                  <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold">
                    <span>{STATUS_LABEL[s]}</span>
                    <span className="text-muted-foreground">{rows.filter((r) => r.status === s).length}</span>
                  </div>
                  <div className="space-y-2">
                    {rows.filter((r) => r.status === s).map((r) => (
                      <Link
                        key={r.id}
                        to="/tickets/$ticketId"
                        params={{ ticketId: r.id }}
                        className="block rounded-md border bg-background p-2 hover:border-primary"
                      >
                        <div className="font-mono text-[10px] text-muted-foreground">{r.ticket_number}</div>
                        <div className="line-clamp-2 text-sm font-medium">{r.subject}</div>
                        <div className="mt-1 flex items-center gap-1">
                          <Badge variant={priorityVariant(r.priority)} className="text-[10px]">{PRIORITY_LABEL[r.priority]}</Badge>
                          {r.assignee_name && <span className="truncate text-[10px] text-muted-foreground">{r.assignee_name}</span>}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Nieuw ticket</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Onderwerp</Label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Korte omschrijving van de melding" />
            </div>
            <div className="grid gap-2">
              <Label>Omschrijving</Label>
              <Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Prioriteit</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TicketPriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Categorie</Label>
                <Select value={form.category_id || "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Geen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Geen categorie</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Klant</Label>
                <Select
                  value={form.client_id || "none"}
                  onValueChange={(v) => {
                    if (v === "none") { setForm({ ...form, client_id: "" }); return; }
                    const c = clients.find((x) => x.id === v);
                    setForm({
                      ...form,
                      client_id: v,
                      requester_name: form.requester_name || (c?.name ?? ""),
                      requester_email: form.requester_email || (c?.email ?? ""),
                      requester_phone: form.requester_phone || (c?.phone ?? ""),
                    });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Geen" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="none">Geen klant (intern)</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name ?? "Naamloos"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Toewijzen aan</Label>
                <Select value={form.assigned_to || "none"} onValueChange={(v) => setForm({ ...form, assigned_to: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Niemand" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Niet toewijzen</SelectItem>
                    {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Naam melder</Label>
                <Input value={form.requester_name} onChange={(e) => setForm({ ...form, requester_name: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>E-mail melder</Label>
                <Input type="email" value={form.requester_email} onChange={(e) => setForm({ ...form, requester_email: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annuleren</Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Ticket aanmaken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
