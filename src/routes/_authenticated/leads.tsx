import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Inbox,
  RefreshCw,
  Loader2,
  Search,
  Download,
  ExternalLink,
  Mail,
  Phone,
  Filter,
  Trophy,
  XCircle,
  Plus,
  Pencil,
  LayoutGrid,
  Table as TableIcon,
  Sparkles,
} from "lucide-react";
import { extractLeadFromText } from "@/lib/leads-ai.functions";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { z } from "zod";
import { winLead, loseLead } from "@/lib/pipeline.functions";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Lead = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  stage: string;
  notes: string | null;
  rep: string | null;
  value: number | null;
  position: number;
  created_at: string;
  updated_at: string;
};

const STAGES = [
  "nieuwe",
  "contact_opgenomen",
  "in_contact",
  "op_afspraak",
  "offerte_verzonden",
  "in_afwachting",
  "even_on_hold",
  "klant",
  "gewonnen",
  "verloren",
  "ai_columbus",
] as const;

const STAGE_COLORS: Record<string, string> = {
  nieuwe: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  contact_opgenomen: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  in_contact: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  op_afspraak: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
  offerte_verzonden: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
  in_afwachting: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  even_on_hold: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  klant: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  gewonnen: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  verloren: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  ai_columbus: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300",
};

const KANBAN_COLUMNS = [
  {
    key: "nieuwe",
    label: "Nieuw",
    stages: ["nieuwe"],
    primaryStage: "nieuwe",
    color: "bg-blue-500",
    dot: "bg-blue-500",
  },
  {
    key: "kwalificatie",
    label: "Kwalificatie",
    stages: ["contact_opgenomen", "in_contact"],
    primaryStage: "in_contact",
    color: "bg-amber-500",
    dot: "bg-amber-500",
  },
  {
    key: "afspraak",
    label: "Afspraak",
    stages: ["op_afspraak"],
    primaryStage: "op_afspraak",
    color: "bg-purple-500",
    dot: "bg-purple-500",
  },
  {
    key: "offerte",
    label: "Offerte",
    stages: ["offerte_verzonden", "in_afwachting", "even_on_hold"],
    primaryStage: "offerte_verzonden",
    color: "bg-indigo-500",
    dot: "bg-indigo-500",
  },
  {
    key: "gewonnen",
    label: "Gewonnen",
    stages: ["klant", "gewonnen", "ai_columbus"],
    primaryStage: "gewonnen",
    color: "bg-emerald-500",
    dot: "bg-emerald-500",
  },
  {
    key: "verloren",
    label: "Verloren",
    stages: ["verloren"],
    primaryStage: "verloren",
    color: "bg-rose-500",
    dot: "bg-rose-500",
  },
] as const;

type KanbanColumn = (typeof KANBAN_COLUMNS)[number];

function columnForStage(stage: string): KanbanColumn | undefined {
  return KANBAN_COLUMNS.find((c) => (c.stages as readonly string[]).includes(stage));
}

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads" }] }),
  component: LeadsPage,
});

function LeadsPage() {
  const { currentOrganizationId, currentOrganization } = useWorkspace();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<"7" | "30" | "90" | "all">("all");
  const [sortBy, setSortBy] = useState<
    | "created_desc"
    | "created_asc"
    | "name_asc"
    | "name_desc"
    | "company_asc"
    | "stage_asc"
    | "value_desc"
    | "value_asc"
  >("created_desc");
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [winLeadRow, setWinLeadRow] = useState<Lead | null>(null);
  const [loseLeadRow, setLoseLeadRow] = useState<Lead | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const fnWin = useServerFn(winLead);
  const fnLose = useServerFn(loseLead);

  const load = useCallback(async () => {
    if (!currentOrganizationId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select(
        "id,name,company,email,phone,source,stage,notes,rep,value,position,created_at,updated_at",
      )
      .eq("organization_id", currentOrganizationId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setRows((data ?? []) as Lead[]);
    setLoading(false);
  }, [currentOrganizationId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime sync met Inbox / Cold Outreach
  useEffect(() => {
    if (!currentOrganizationId) return;
    const channel = supabase
      .channel(`leads-overview-${currentOrganizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leads",
          filter: `organization_id=eq.${currentOrganizationId}`,
        },
        (payload) => {
          const newRow = payload.new as Lead | null;
          const oldRow = payload.old as Lead | null;
          if (payload.eventType === "INSERT" && newRow) {
            setRows((cur) => (cur.some((r) => r.id === newRow.id) ? cur : [newRow, ...cur]));
          } else if (payload.eventType === "UPDATE" && newRow) {
            setRows((cur) => cur.map((r) => (r.id === newRow.id ? { ...r, ...newRow } : r)));
          } else if (payload.eventType === "DELETE" && oldRow) {
            setRows((cur) => cur.filter((r) => r.id !== oldRow.id));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentOrganizationId]);

  const sources = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.source && s.add(r.source));
    return Array.from(s).sort();
  }, [rows]);

  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const cutoff = periodFilter === "all" ? 0 : now - Number(periodFilter) * 24 * 60 * 60 * 1000;
    return rows.filter((r) => {
      if (sourceFilter !== "all" && (r.source ?? "") !== sourceFilter) return false;
      if (cutoff && new Date(r.created_at).getTime() < cutoff) return false;
      if (q) {
        const hay = [r.name, r.company, r.stage, r.email, r.phone, r.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, sourceFilter, periodFilter]);

  const filtered = useMemo(() => {
    const list = baseFiltered.filter((r) => {
      if (stageFilter !== "all" && r.stage !== stageFilter) return false;
      return true;
    });
    const collator = new Intl.Collator("nl-NL", { numeric: true, sensitivity: "base" });
    list.sort((a, b) => {
      switch (sortBy) {
        case "created_desc":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "created_asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name_asc":
          return collator.compare(a.name, b.name);
        case "name_desc":
          return collator.compare(b.name, a.name);
        case "company_asc":
          return collator.compare(a.company ?? "", b.company ?? "");
        case "stage_asc":
          return collator.compare(a.stage, b.stage);
        case "value_desc":
          return (b.value ?? 0) - (a.value ?? 0);
        case "value_asc":
          return (a.value ?? 0) - (b.value ?? 0);
        default:
          return 0;
      }
    });
    return list;
  }, [baseFiltered, stageFilter, sortBy]);

  const stats = useMemo(() => {
    const total = rows.length;
    const nieuw = rows.filter((r) => r.stage === "nieuwe").length;
    const klant = rows.filter((r) => r.stage === "klant" || r.stage === "gewonnen").length;
    const last7 = rows.filter(
      (r) => Date.now() - new Date(r.created_at).getTime() < 7 * 86400_000,
    ).length;
    return { total, nieuw, klant, last7 };
  }, [rows]);

  async function changeStage(lead: Lead, stage: string) {
    setRows((cur) => cur.map((r) => (r.id === lead.id ? { ...r, stage } : r)));
    const { error } = await supabase
      .from("leads")
      .update({ stage: stage as never })
      .eq("id", lead.id);
    if (error) {
      toast.error(error.message);
      load();
    } else toast.success("Status bijgewerkt");
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function persistReordered(columnKey: string, orderedIds: string[]) {
    const column = KANBAN_COLUMNS.find((c) => c.key === columnKey);
    if (!column) return;
    const updates = orderedIds.map((id, idx) => ({
      id,
      position: (idx + 1) * 1000,
    }));
    setRows((cur) =>
      cur.map((r) => {
        const u = updates.find((u) => u.id === r.id);
        return u ? { ...r, position: u.position } : r;
      }),
    );
    for (const u of updates) {
      const { error } = await supabase
        .from("leads")
        .update({ position: u.position } as never)
        .eq("id", u.id);
      if (error) {
        toast.error(error.message);
        load();
        return;
      }
    }
  }

  async function moveLeadToColumn(lead: Lead, column: KanbanColumn, targetIndex?: number) {
    const currentColumn = columnForStage(lead.stage);
    const columnLeads = baseFiltered
      .filter((r) => (column.stages as readonly string[]).includes(r.stage))
      .sort((a, b) => a.position - b.position);

    let newPosition: number;
    if (targetIndex == null || targetIndex >= columnLeads.length) {
      newPosition =
        columnLeads.length > 0 ? columnLeads[columnLeads.length - 1].position + 1000 : 1000;
    } else if (targetIndex === 0) {
      newPosition = columnLeads.length > 0 ? columnLeads[0].position - 1000 : 1000;
    } else {
      newPosition = (columnLeads[targetIndex - 1].position + columnLeads[targetIndex].position) / 2;
    }

    const newStage = column.primaryStage;
    setRows((cur) =>
      cur.map((r) => (r.id === lead.id ? { ...r, stage: newStage, position: newPosition } : r)),
    );

    const { error } = await supabase
      .from("leads")
      .update({ stage: newStage as never, position: newPosition } as never)
      .eq("id", lead.id);
    if (error) {
      toast.error(error.message);
      load();
      return;
    }
    toast.success(`Lead verplaatst naar ${column.label}`);

    // If dropped in same column, normalize positions to keep them clean
    if (currentColumn?.key === column.key) {
      const reorderedIds = columnLeads.map((r) => r.id);
      const activeIdx = reorderedIds.indexOf(lead.id);
      const insertIdx = targetIndex ?? reorderedIds.length;
      if (activeIdx !== -1) reorderedIds.splice(activeIdx, 1);
      reorderedIds.splice(Math.min(insertIdx, reorderedIds.length), 0, lead.id);
      await persistReordered(column.key, reorderedIds);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const activeLead = rows.find((r) => r.id === activeId);
    if (!activeLead) return;

    let targetColumn = KANBAN_COLUMNS.find((c) => c.key === overId);
    let overLead: Lead | undefined;
    if (!targetColumn) {
      overLead = rows.find((r) => r.id === overId);
      if (overLead) targetColumn = columnForStage(overLead.stage);
    }
    if (!targetColumn) return;

    const sourceColumn = columnForStage(activeLead.stage);
    if (!sourceColumn) return;

    const columnLeads = baseFiltered
      .filter((r) => (targetColumn.stages as readonly string[]).includes(r.stage))
      .sort((a, b) => a.position - b.position);
    let targetIndex = overLead ? columnLeads.findIndex((r) => r.id === overLead!.id) : undefined;
    if (targetIndex !== undefined && targetIndex === -1) targetIndex = undefined;

    if (targetColumn.key === sourceColumn.key && activeId !== overId && overLead) {
      const activeIdx = columnLeads.findIndex((r) => r.id === activeId);
      if (activeIdx === -1) return;
      const newIndex = targetIndex ?? columnLeads.length - 1;
      const reordered = arrayMove(columnLeads, activeIdx, newIndex);
      persistReordered(
        targetColumn.key,
        reordered.map((r) => r.id),
      );
    } else if (targetColumn.key !== sourceColumn.key) {
      moveLeadToColumn(activeLead, targetColumn, targetIndex);
    }
  }

  function exportCsv() {
    const header = [
      "created_at",
      "name",
      "company",
      "email",
      "phone",
      "source",
      "stage",
      "rep",
      "value",
      "notes",
    ];
    const lines = [header.join(",")].concat(
      filtered.map((r) =>
        header
          .map((h) => {
            const v = (r as unknown as Record<string, unknown>)[h];
            const s = v == null ? "" : String(v).replace(/"/g, '""').replace(/\n/g, " ");
            return /[",;\n]/.test(s) ? `"${s}"` : s;
          })
          .join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-7xl space-y-6 p-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Inbox className="h-6 w-6 text-brand" />
              Leads
            </h1>
            <p className="text-sm text-muted-foreground">
              {currentOrganization?.name ?? ""} — alle inkomende en bestaande leads
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Nieuwe lead
            </Button>
            <div className="flex items-center rounded-md border border-border p-0.5">
              <Button
                size="sm"
                variant={view === "kanban" ? "secondary" : "ghost"}
                onClick={() => setView("kanban")}
                className="h-7 px-2"
              >
                <LayoutGrid className="mr-1 h-4 w-4" /> Kanban
              </Button>
              <Button
                size="sm"
                variant={view === "table" ? "secondary" : "ghost"}
                onClick={() => setView("table")}
                className="h-7 px-2"
              >
                <TableIcon className="mr-1 h-4 w-4" /> Tabel
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={filtered.length === 0}
            >
              <Download className="mr-1 h-4 w-4" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-4 w-4" />
              )}
              Vernieuwen
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Totaal" value={stats.total} />
          <StatCard label="Nieuw" value={stats.nieuw} accent />
          <StatCard label="Laatste 7 dagen" value={stats.last7} />
          <StatCard label="Klant / gewonnen" value={stats.klant} />
        </div>

        {view === "table" && (
          <div className="flex flex-wrap gap-2">
            {[
              { key: "all", label: "Alle" },
              { key: "nieuwe", label: "Nieuw" },
              { key: "in_contact", label: "Kwalificatie" },
              { key: "offerte_verzonden", label: "Offerte" },
              { key: "gewonnen", label: "Gewonnen" },
              { key: "verloren", label: "Verloren" },
            ].map((p) => {
              const count =
                p.key === "all" ? rows.length : rows.filter((r) => r.stage === p.key).length;
              const active = stageFilter === p.key;
              return (
                <Button
                  key={p.key}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() => setStageFilter(p.key)}
                  className="h-8"
                >
                  {p.label}
                  <span
                    className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${active ? "bg-primary-foreground/20" : "bg-muted"}`}
                  >
                    {count}
                  </span>
                </Button>
              );
            })}
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-3 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek op naam, bedrijf of status…"
              className="pl-8"
            />
          </div>
          {view === "table" && (
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-3.5 w-3.5 mr-1" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statussen</SelectItem>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Bron" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle bronnen</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={periodFilter}
            onValueChange={(v) => setPeriodFilter(v as typeof periodFilter)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Hele periode</SelectItem>
              <SelectItem value="7">Laatste 7 dagen</SelectItem>
              <SelectItem value="30">Laatste 30 dagen</SelectItem>
              <SelectItem value="90">Laatste 90 dagen</SelectItem>
            </SelectContent>
          </Select>
          {view === "table" && (
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="Sorteren" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_desc">Nieuwste eerst</SelectItem>
                <SelectItem value="created_asc">Oudste eerst</SelectItem>
                <SelectItem value="name_asc">Naam A-Z</SelectItem>
                <SelectItem value="name_desc">Naam Z-A</SelectItem>
                <SelectItem value="company_asc">Bedrijf A-Z</SelectItem>
                <SelectItem value="stage_asc">Status A-Z</SelectItem>
                <SelectItem value="value_desc">Waarde hoog-laag</SelectItem>
                <SelectItem value="value_asc">Waarde laag-hoog</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="text-xs text-muted-foreground ml-auto">
            {view === "kanban"
              ? `${baseFiltered.length} van ${rows.length}`
              : `${filtered.length} van ${rows.length}`}
          </div>
        </div>

        {view === "table" ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Datum</th>
                  <th className="px-3 py-2 text-left">Naam</th>
                  <th className="px-3 py-2 text-left">Bedrijf</th>
                  <th className="px-3 py-2 text-left">Contact</th>
                  <th className="px-3 py-2 text-left">Bron</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Acties</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Laden…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Geen leads gevonden.
                    </td>
                  </tr>
                ) : (
                  filtered.map((l) => (
                    <tr key={l.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(l.created_at).toLocaleString("nl-NL", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-3 py-2 font-medium">{l.name}</td>
                      <td className="px-3 py-2">{l.company ?? "—"}</td>
                      <td className="px-3 py-2 text-xs space-y-0.5">
                        {l.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {l.email}
                          </div>
                        )}
                        {l.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {l.phone}
                          </div>
                        )}
                        {!l.email && !l.phone && <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-xs">
                          {l.source ?? "—"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Select value={l.stage} onValueChange={(v) => changeStage(l, v)}>
                          <SelectTrigger
                            className={`h-8 w-[170px] text-xs ${STAGE_COLORS[l.stage] ?? ""}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STAGES.map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Zet op gewonnen"
                            onClick={() => setWinLeadRow(l)}
                            disabled={l.stage === "gewonnen"}
                          >
                            <Trophy className="h-3.5 w-3.5 text-emerald-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Zet op verloren"
                            onClick={() => setLoseLeadRow(l)}
                            disabled={l.stage === "verloren"}
                          >
                            <XCircle className="h-3.5 w-3.5 text-rose-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Bewerken"
                            onClick={() => setEditLead(l)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Details"
                            onClick={() => setOpenLead(l)}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <KanbanBoard
            leads={baseFiltered}
            loading={loading}
            onWin={setWinLeadRow}
            onLose={setLoseLeadRow}
            onEdit={setEditLead}
            onDetail={setOpenLead}
            onDragEnd={handleDragEnd}
          />
        )}

        <CreateLeadDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          organizationId={currentOrganizationId}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />

        <EditLeadDialog
          lead={editLead}
          onClose={() => setEditLead(null)}
          onSaved={() => {
            setEditLead(null);
            load();
          }}
        />

        <WinLeadDialog
          lead={winLeadRow}
          onClose={() => setWinLeadRow(null)}
          onDone={() => {
            setWinLeadRow(null);
            load();
          }}
          fnWin={fnWin}
        />

        <LoseLeadDialog
          lead={loseLeadRow}
          onClose={() => setLoseLeadRow(null)}
          onDone={() => {
            setLoseLeadRow(null);
            load();
          }}
          fnLose={fnLose}
        />

        <Dialog open={!!openLead} onOpenChange={(o) => !o && setOpenLead(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{openLead?.name}</DialogTitle>
              <DialogDescription>{openLead?.company ?? ""}</DialogDescription>
            </DialogHeader>
            {openLead && (
              <div className="space-y-2 text-sm">
                <Row k="Email" v={openLead.email} />
                <Row k="Telefoon" v={openLead.phone} />
                <Row k="Bron" v={openLead.source} />
                <Row k="Status" v={openLead.stage} />
                <Row k="Rep" v={openLead.rep} />
                <Row
                  k="Waarde"
                  v={
                    openLead.value != null
                      ? `€ ${Number(openLead.value).toLocaleString("nl-NL")}`
                      : null
                  }
                />
                <Row k="Binnengekomen" v={new Date(openLead.created_at).toLocaleString("nl-NL")} />
                {openLead.notes && (
                  <div>
                    <div className="text-muted-foreground mb-1">Notities / bericht:</div>
                    <pre className="whitespace-pre-wrap rounded bg-muted/50 p-3 text-xs">
                      {openLead.notes}
                    </pre>
                  </div>
                )}
                <div className="pt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate({ to: "/ai-columbus/leads" })}
                  >
                    Naar leads funnel
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate({ to: "/outreach" })}>
                    Naar Cold Outreach
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-32 shrink-0">{k}:</span>
      <span>{v ?? "—"}</span>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl border bg-card p-4 ${accent ? "border-brand/40" : "border-border"}`}
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${accent ? "text-brand" : ""}`}>{value}</div>
    </div>
  );
}

function WinLeadDialog({
  lead,
  onClose,
  onDone,
  fnWin,
}: {
  lead: Lead | null;
  onClose: () => void;
  onDone: () => void;
  fnWin: ReturnType<typeof useServerFn<typeof winLead>>;
}) {
  const [title, setTitle] = useState("");
  const [monthly, setMonthly] = useState("0");
  const [setup, setSetup] = useState("0");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (lead) {
      setTitle(lead.company ? `${lead.company} — AI-abonnement` : `${lead.name} — AI-abonnement`);
      setMonthly(lead.value != null ? String(lead.value) : "0");
      setSetup("0");
      setStartDate(new Date().toISOString().slice(0, 10));
    }
  }, [lead]);

  const save = async () => {
    if (!lead) return;
    setSaving(true);
    try {
      const r = await fnWin({
        data: {
          leadId: lead.id,
          monthlyCents: Math.round(parseFloat(monthly || "0") * 100),
          setupCents: Math.round(parseFloat(setup || "0") * 100),
          startDate,
          title,
        },
      });
      toast.success("Klant, project en contract aangemaakt", {
        description: "Open het contract om de eerste factuur te genereren.",
        action: {
          label: "Open contract",
          onClick: () => {
            window.location.href = `/contracten/${r.contractId}`;
          },
        },
      });
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Zet lead op gewonnen</DialogTitle>
          <DialogDescription>Maakt automatisch klant, project en contract aan.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Titel van het contract</label>
            <input
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Maandbedrag (€)</label>
              <input
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="number"
                step="0.01"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Setup (€)</label>
              <input
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="number"
                step="0.01"
                value={setup}
                onChange={(e) => setSetup(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium">Startdatum</label>
              <input
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            Annuleer
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Bevestig gewonnen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LoseLeadDialog({
  lead,
  onClose,
  onDone,
  fnLose,
}: {
  lead: Lead | null;
  onClose: () => void;
  onDone: () => void;
  fnLose: ReturnType<typeof useServerFn<typeof loseLead>>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (lead) setReason("");
  }, [lead]);
  const save = async () => {
    if (!lead) return;
    setSaving(true);
    try {
      await fnLose({ data: { leadId: lead.id, reason: reason || undefined } });
      toast.success("Lead op verloren gezet");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Zet lead op verloren</DialogTitle>
          <DialogDescription>Optioneel: geef aan waarom.</DialogDescription>
        </DialogHeader>
        <textarea
          className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px]"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reden (optioneel)"
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            Annuleer
          </Button>
          <Button variant="destructive" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Bevestig verloren
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Small no-op to preserve trailing closing brace

const leadFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Naam moet minimaal 2 tekens zijn")
    .max(200, "Naam mag max 200 tekens zijn"),
  company: z
    .string()
    .trim()
    .max(200, "Bedrijf mag max 200 tekens zijn")
    .optional()
    .or(z.literal("")),
  contactPerson: z
    .string()
    .trim()
    .max(200, "Contactpersoon mag max 200 tekens zijn")
    .optional()
    .or(z.literal("")),
  email: z
    .string()
    .trim()
    .max(255, "Email mag max 255 tekens zijn")
    .email("Ongeldig e-mailadres")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .trim()
    .max(40, "Telefoon mag max 40 tekens zijn")
    .regex(/^[+0-9()\-\s]*$/, "Alleen cijfers, spaties, +, -, ( en ) toegestaan")
    .optional()
    .or(z.literal("")),
  source: z.string().trim().min(1, "Kies een bron"),
  stage: z.string().trim().min(1, "Kies een status"),
  value: z.coerce
    .number({ invalid_type_error: "Waarde moet een getal zijn" })
    .min(0, "Waarde mag niet negatief zijn")
    .max(10_000_000, "Waarde te hoog"),
  notes: z
    .string()
    .trim()
    .max(2000, "Notities mogen max 2000 tekens zijn")
    .optional()
    .or(z.literal("")),
});

type LeadFormErrors = Partial<Record<keyof z.infer<typeof leadFormSchema>, string>>;

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive">{msg}</p>;
}

function CreateLeadDialog({
  open,
  onClose,
  organizationId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string | null;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("handmatig");
  const [stage, setStage] = useState<string>("nieuwe");
  const [value, setValue] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<LeadFormErrors>({});
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const extractLeadFn = useServerFn(extractLeadFromText);

  useEffect(() => {
    if (open) {
      setName("");
      setCompany("");
      setContactPerson("");
      setEmail("");
      setPhone("");
      setSource("handmatig");
      setStage("nieuwe");
      setValue("0");
      setNotes("");
      setErrors({});
      setAiText("");
      setAiLoading(false);
    }
  }, [open]);

  async function runAiExtract() {
    const text = aiText.trim();
    if (!text) {
      toast.error("Plak eerst wat tekst.");
      return;
    }
    setAiLoading(true);
    try {
      const r = await extractLeadFn({ data: { text } });
      let filled = 0;
      if (r.name) { setName(r.name); filled++; }
      if (r.company) { setCompany(r.company); filled++; }
      if (r.contact_person) { setContactPerson(r.contact_person); filled++; }
      if (r.email) { setEmail(r.email); filled++; }
      if (r.phone) { setPhone(r.phone); filled++; }
      if (r.source) { setSource(r.source); filled++; }
      if (r.estimated_value_eur != null) { setValue(String(r.estimated_value_eur)); filled++; }
      if (r.notes) { setNotes(r.notes); filled++; }
      if (filled === 0) {
        toast.warning("AI kon geen velden herkennen. Vul handmatig aan.");
      } else {
        toast.success(`AI heeft ${filled} veld${filled === 1 ? "" : "en"} ingevuld — controleer even.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI-invullen mislukt");
    } finally {
      setAiLoading(false);
    }
  }


  async function save() {
    if (!organizationId) {
      toast.error("Geen actieve organisatie", {
        description: "Selecteer eerst een omgeving in de sidebar.",
      });
      return;
    }
    const parsed = leadFormSchema.safeParse({
      name,
      company,
      contactPerson,
      email,
      phone,
      source,
      stage,
      value,
      notes,
    });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      const nextErrors: LeadFormErrors = {};
      (Object.keys(flat) as (keyof LeadFormErrors)[]).forEach((k) => {
        const msg = flat[k]?.[0];
        if (msg) nextErrors[k] = msg;
      });
      setErrors(nextErrors);
      const count = Object.keys(nextErrors).length;
      toast.error("Controleer het formulier", {
        description: `${count} veld${count === 1 ? "" : "en"} met een fout. Zie de rode meldingen bij de invoer.`,
      });
      return;
    }
    setErrors({});
    const d = parsed.data;
    setSaving(true);
    const { data: inserted, error } = await supabase
      .from("leads")
      .insert({
        organization_id: organizationId,
        name: d.name,
        company: d.company || null,
        rep: d.contactPerson || null,
        email: d.email || null,
        phone: d.phone || null,
        source: d.source,
        stage: d.stage as never,
        value: d.value,
        notes: d.notes || null,
      } as never)
      .select("id, name")
      .single();
    setSaving(false);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique")) {
        toast.error("Deze lead bestaat al", {
          description: "Er is al een lead met dezelfde gegevens.",
        });
      } else if (msg.includes("permission") || msg.includes("row-level")) {
        toast.error("Geen toegang", {
          description: "Je hebt geen rechten om een lead toe te voegen in deze omgeving.",
        });
      } else {
        toast.error("Opslaan mislukt", { description: error.message });
      }
      return;
    }
    toast.success("Lead aangemaakt", {
      description: `${(inserted as { name: string } | null)?.name ?? d.name} staat nu op status "${d.stage}".`,
    });
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nieuwe lead</DialogTitle>
          <DialogDescription>Voeg handmatig een lead toe aan de pipeline.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm max-h-[70vh] overflow-y-auto pr-1">
          <div className="rounded-md border border-dashed bg-muted/40 p-3 grid gap-2">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              AI-invulhulp — plak tekst
            </div>
            <Textarea
              rows={4}
              placeholder="Plak hier een e-mail, LinkedIn-bericht, notitie of visitekaartje-tekst…"
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              disabled={aiLoading}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                AI vult de velden hieronder in. Je kunt daarna nog aanpassen.
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={runAiExtract}
                disabled={aiLoading || !aiText.trim()}
              >
                {aiLoading ? (
                  <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Bezig…</>
                ) : (
                  <><Sparkles className="mr-1 h-3.5 w-3.5" /> AI invullen</>
                )}
              </Button>
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Naam *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              aria-invalid={!!errors.name}
              className={errors.name ? "border-destructive" : ""}
            />
            <FieldError msg={errors.name} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Bedrijf</Label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                maxLength={200}
                aria-invalid={!!errors.company}
                className={errors.company ? "border-destructive" : ""}
              />
              <FieldError msg={errors.company} />
            </div>
            <div className="grid gap-1">
              <Label>Contactpersoon</Label>
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                maxLength={200}
                aria-invalid={!!errors.contactPerson}
                className={errors.contactPerson ? "border-destructive" : ""}
              />
              <FieldError msg={errors.contactPerson} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                aria-invalid={!!errors.email}
                className={errors.email ? "border-destructive" : ""}
              />
              <FieldError msg={errors.email} />
            </div>
            <div className="grid gap-1">
              <Label>Telefoon</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={40}
                aria-invalid={!!errors.phone}
                className={errors.phone ? "border-destructive" : ""}
              />
              <FieldError msg={errors.phone} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Bron</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className={errors.source ? "border-destructive" : ""}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "handmatig",
                    "website",
                    "referral",
                    "cold_outreach",
                    "linkedin",
                    "evenement",
                    "aanbesteding",
                    "anders",
                  ].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError msg={errors.source} />
            </div>
            <div className="grid gap-1">
              <Label>Status</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className={errors.stage ? "border-destructive" : ""}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError msg={errors.stage} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Waarde (€ p/m indicatie)</Label>
            <Input
              type="number"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={!!errors.value}
              className={errors.value ? "border-destructive" : ""}
            />
            <FieldError msg={errors.value} />
          </div>
          <div className="grid gap-1">
            <Label>Notities</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              aria-invalid={!!errors.notes}
              className={errors.notes ? "border-destructive" : ""}
            />
            <div className="flex justify-between">
              <FieldError msg={errors.notes} />
              <span className="ml-auto text-[10px] text-muted-foreground">{notes.length}/2000</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuleren
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Lead aanmaken
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditLeadDialog({
  lead,
  onClose,
  onSaved,
}: {
  lead: Lead | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [stage, setStage] = useState<string>("nieuwe");
  const [value, setValue] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (lead) {
      setName(lead.name ?? "");
      setCompany(lead.company ?? "");
      setContactPerson(lead.rep ?? "");
      setEmail(lead.email ?? "");
      setPhone(lead.phone ?? "");
      setSource(lead.source ?? "handmatig");
      setStage(lead.stage);
      setValue(lead.value != null ? String(lead.value) : "0");
      setNotes(lead.notes ?? "");
    }
  }, [lead]);

  async function save() {
    if (!lead) return;
    if (!name.trim()) {
      toast.error("Naam is verplicht");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("leads")
      .update({
        name: name.trim(),
        company: company.trim() || null,
        rep: contactPerson.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        source: source.trim() || null,
        stage: stage as never,
        value: Number(value) || 0,
        notes: notes.trim() || null,
      } as never)
      .eq("id", lead.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Lead bijgewerkt");
    onSaved();
  }

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Lead bewerken</DialogTitle>
          <DialogDescription>Werk de gegevens van deze lead bij.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <div className="grid gap-1">
            <Label>Naam *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Bedrijf</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={200} />
            </div>
            <div className="grid gap-1">
              <Label>Contactpersoon</Label>
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                maxLength={200}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
              />
            </div>
            <div className="grid gap-1">
              <Label>Telefoon</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Bron</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "handmatig",
                    "website",
                    "referral",
                    "cold_outreach",
                    "linkedin",
                    "evenement",
                    "aanbesteding",
                    "anders",
                  ].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Status</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Waarde (€ p/m indicatie)</Label>
            <Input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Notities</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuleren
          </Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Opslaan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Kanban view                                                                */
/* -------------------------------------------------------------------------- */

function KanbanBoard({
  leads,
  loading,
  onWin,
  onLose,
  onEdit,
  onDetail,
  onDragEnd,
}: {
  leads: Lead[];
  loading: boolean;
  onWin: (l: Lead) => void;
  onLose: (l: Lead) => void;
  onEdit: (l: Lead) => void;
  onDetail: (l: Lead) => void;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
        Laden…
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {KANBAN_COLUMNS.map((column) => {
          const items = leads
            .filter((r) => (column.stages as readonly string[]).includes(r.stage))
            .sort((a, b) => a.position - b.position);
          return (
            <KanbanColumn
              key={column.key}
              column={column}
              leads={items}
              onWin={onWin}
              onLose={onLose}
              onEdit={onEdit}
              onDetail={onDetail}
            />
          );
        })}
      </div>
    </DndContext>
  );
}

function KanbanColumn({
  column,
  leads,
  onWin,
  onLose,
  onEdit,
  onDetail,
}: {
  column: KanbanColumn;
  leads: Lead[];
  onWin: (l: Lead) => void;
  onLose: (l: Lead) => void;
  onEdit: (l: Lead) => void;
  onDetail: (l: Lead) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-[280px] shrink-0 flex-col rounded-xl border bg-muted/30 transition ${
        isOver ? "border-brand/60 bg-brand/10" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${column.dot}`} />
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
            {column.label}
          </span>
        </div>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {leads.length}
        </span>
      </div>
      <div className="min-h-[120px] space-y-2 p-2">
        <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.length === 0 ? (
            <div className="rounded border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
              Sleep hier
            </div>
          ) : (
            leads.map((l) => (
              <KanbanCard
                key={l.id}
                lead={l}
                onWin={onWin}
                onLose={onLose}
                onEdit={onEdit}
                onDetail={onDetail}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

function KanbanCard({
  lead,
  onWin,
  onLose,
  onEdit,
  onDetail,
}: {
  lead: Lead;
  onWin: (l: Lead) => void;
  onLose: (l: Lead) => void;
  onEdit: (l: Lead) => void;
  onDetail: (l: Lead) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: lead.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab rounded-lg border border-border bg-card p-3 shadow-sm transition hover:border-brand/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{lead.name}</div>
          {lead.company && (
            <div className="truncate text-xs text-muted-foreground">{lead.company}</div>
          )}
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {lead.source ?? "—"}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {lead.value != null && lead.value > 0 && (
          <span className="font-mono text-foreground">
            € {Number(lead.value).toLocaleString("nl-NL")}/m
          </span>
        )}
        {lead.email && (
          <span title={lead.email} className="inline-flex">
            <Mail className="h-3 w-3" />
          </span>
        )}
        {lead.phone && (
          <span title={lead.phone} className="inline-flex">
            <Phone className="h-3 w-3" />
          </span>
        )}
      </div>

      <div className="mt-3 flex justify-end gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          title="Zet op gewonnen"
          onClick={() => onWin(lead)}
          disabled={lead.stage === "gewonnen"}
        >
          <Trophy className="h-3.5 w-3.5 text-emerald-600" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          title="Zet op verloren"
          onClick={() => onLose(lead)}
          disabled={lead.stage === "verloren"}
        >
          <XCircle className="h-3.5 w-3.5 text-rose-600" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          title="Bewerken"
          onClick={() => onEdit(lead)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          title="Details"
          onClick={() => onDetail(lead)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
