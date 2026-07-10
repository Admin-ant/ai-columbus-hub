import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Inbox, RefreshCw, Loader2, Search, Download, ExternalLink, Mail, Phone, Filter, Trophy, XCircle, Plus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [winLeadRow, setWinLeadRow] = useState<Lead | null>(null);
  const [loseLeadRow, setLoseLeadRow] = useState<Lead | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
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
      .select("id,name,company,email,phone,source,stage,notes,rep,value,created_at,updated_at")
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
        { event: "*", schema: "public", table: "leads", filter: `organization_id=eq.${currentOrganizationId}` },
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const cutoff =
      periodFilter === "all" ? 0 : now - Number(periodFilter) * 24 * 60 * 60 * 1000;
    return rows.filter((r) => {
      if (stageFilter !== "all" && r.stage !== stageFilter) return false;
      if (sourceFilter !== "all" && (r.source ?? "") !== sourceFilter) return false;
      if (cutoff && new Date(r.created_at).getTime() < cutoff) return false;
      if (q) {
        const hay = [r.name, r.company, r.email, r.phone, r.notes].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, stageFilter, sourceFilter, periodFilter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const nieuw = rows.filter((r) => r.stage === "nieuwe").length;
    const klant = rows.filter((r) => r.stage === "klant" || r.stage === "gewonnen").length;
    const last7 = rows.filter((r) => Date.now() - new Date(r.created_at).getTime() < 7 * 86400_000).length;
    return { total, nieuw, klant, last7 };
  }, [rows]);

  async function changeStage(lead: Lead, stage: string) {
    setRows((cur) => cur.map((r) => (r.id === lead.id ? { ...r, stage } : r)));
    const { error } = await supabase.from("leads").update({ stage: stage as never }).eq("id", lead.id);
    if (error) { toast.error(error.message); load(); }
    else toast.success("Status bijgewerkt");
  }

  function exportCsv() {
    const header = ["created_at","name","company","email","phone","source","stage","rep","value","notes"];
    const lines = [header.join(",")].concat(
      filtered.map((r) =>
        header.map((h) => {
          const v = (r as unknown as Record<string, unknown>)[h];
          const s = v == null ? "" : String(v).replace(/"/g, '""').replace(/\n/g, " ");
          return /[",;\n]/.test(s) ? `"${s}"` : s;
        }).join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0,10)}.csv`;
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
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="mr-1 h-4 w-4" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
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

        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "Alle" },
            { key: "nieuwe", label: "Nieuw" },
            { key: "in_contact", label: "Kwalificatie" },
            { key: "offerte_verzonden", label: "Offerte" },
            { key: "gewonnen", label: "Gewonnen" },
            { key: "verloren", label: "Verloren" },
          ].map((p) => {
            const count = p.key === "all" ? rows.length : rows.filter((r) => r.stage === p.key).length;
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
                <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${active ? "bg-primary-foreground/20" : "bg-muted"}`}>
                  {count}
                </span>
              </Button>
            );
          })}
        </div>


        <div className="rounded-xl border border-border bg-card p-3 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek op naam, bedrijf, email…"
              className="pl-8"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[180px]"><Filter className="h-3.5 w-3.5 mr-1" /><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle statussen</SelectItem>
              {STAGES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Bron" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle bronnen</SelectItem>
              {sources.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as typeof periodFilter)}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Hele periode</SelectItem>
              <SelectItem value="7">Laatste 7 dagen</SelectItem>
              <SelectItem value="30">Laatste 30 dagen</SelectItem>
              <SelectItem value="90">Laatste 90 dagen</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground ml-auto">
            {filtered.length} van {rows.length}
          </div>
        </div>

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
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Laden…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Geen leads gevonden.</td></tr>
              ) : (
                filtered.map((l) => (
                  <tr key={l.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-3 py-2 font-medium">{l.name}</td>
                    <td className="px-3 py-2">{l.company ?? "—"}</td>
                    <td className="px-3 py-2 text-xs space-y-0.5">
                      {l.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" /> {l.email}</div>}
                      {l.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {l.phone}</div>}
                      {!l.email && !l.phone && <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-xs">{l.source ?? "—"}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Select value={l.stage} onValueChange={(v) => changeStage(l, v)}>
                        <SelectTrigger className={`h-8 w-[170px] text-xs ${STAGE_COLORS[l.stage] ?? ""}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAGES.map((s) => (<SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" title="Zet op gewonnen" onClick={() => setWinLeadRow(l)} disabled={l.stage === "gewonnen"}>
                          <Trophy className="h-3.5 w-3.5 text-emerald-600" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Zet op verloren" onClick={() => setLoseLeadRow(l)} disabled={l.stage === "verloren"}>
                          <XCircle className="h-3.5 w-3.5 text-rose-600" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setOpenLead(l)}>
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

        <CreateLeadDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          organizationId={currentOrganizationId}
          onCreated={() => { setCreateOpen(false); load(); }}
        />


        <WinLeadDialog
          lead={winLeadRow}
          onClose={() => setWinLeadRow(null)}
          onDone={() => { setWinLeadRow(null); load(); }}
          fnWin={fnWin}
        />

        <LoseLeadDialog
          lead={loseLeadRow}
          onClose={() => setLoseLeadRow(null)}
          onDone={() => { setLoseLeadRow(null); load(); }}
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
                <Row k="Waarde" v={openLead.value != null ? `€ ${Number(openLead.value).toLocaleString("nl-NL")}` : null} />
                <Row k="Binnengekomen" v={new Date(openLead.created_at).toLocaleString("nl-NL")} />
                {openLead.notes && (
                  <div>
                    <div className="text-muted-foreground mb-1">Notities / bericht:</div>
                    <pre className="whitespace-pre-wrap rounded bg-muted/50 p-3 text-xs">{openLead.notes}</pre>
                  </div>
                )}
                <div className="pt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => navigate({ to: "/ai-columbus/leads" })}>
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
    <div className={`rounded-xl border bg-card p-4 ${accent ? "border-brand/40" : "border-border"}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${accent ? "text-brand" : ""}`}>{value}</div>
    </div>
  );
}

function WinLeadDialog({
  lead, onClose, onDone, fnWin,
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
          onClick: () => { window.location.href = `/contracten/${r.contractId}`; },
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
            <input className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Maandbedrag (€)</label>
              <input className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm" type="number" step="0.01" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">Setup (€)</label>
              <input className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm" type="number" step="0.01" value={setup} onChange={(e) => setSetup(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium">Startdatum</label>
              <input className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>Annuleer</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Bevestig gewonnen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LoseLeadDialog({
  lead, onClose, onDone, fnLose,
}: {
  lead: Lead | null;
  onClose: () => void;
  onDone: () => void;
  fnLose: ReturnType<typeof useServerFn<typeof loseLead>>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (lead) setReason(""); }, [lead]);
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
        <textarea className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reden (optioneel)" />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>Annuleer</Button>
          <Button variant="destructive" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Bevestig verloren
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Small no-op to preserve trailing closing brace
