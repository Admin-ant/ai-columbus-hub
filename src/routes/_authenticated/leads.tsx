import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Inbox, RefreshCw, Loader2, Search, Download, ExternalLink, Mail, Phone, Filter, Trophy, XCircle, Plus, Pencil } from "lucide-react";
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
                        <Button size="sm" variant="ghost" title="Bewerken" onClick={() => setEditLead(l)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Details" onClick={() => setOpenLead(l)}>
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

        <EditLeadDialog
          lead={editLead}
          onClose={() => setEditLead(null)}
          onSaved={() => { setEditLead(null); load(); }}
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

const leadFormSchema = z.object({
  name: z.string().trim().min(2, "Naam moet minimaal 2 tekens zijn").max(200, "Naam mag max 200 tekens zijn"),
  company: z.string().trim().max(200, "Bedrijf mag max 200 tekens zijn").optional().or(z.literal("")),
  contactPerson: z.string().trim().max(200, "Contactpersoon mag max 200 tekens zijn").optional().or(z.literal("")),
  email: z.string().trim().max(255, "Email mag max 255 tekens zijn").email("Ongeldig e-mailadres").optional().or(z.literal("")),
  phone: z.string().trim().max(40, "Telefoon mag max 40 tekens zijn").regex(/^[+0-9()\-\s]*$/, "Alleen cijfers, spaties, +, -, ( en ) toegestaan").optional().or(z.literal("")),
  source: z.string().trim().min(1, "Kies een bron"),
  stage: z.string().trim().min(1, "Kies een status"),
  value: z.coerce.number({ invalid_type_error: "Waarde moet een getal zijn" }).min(0, "Waarde mag niet negatief zijn").max(10_000_000, "Waarde te hoog"),
  notes: z.string().trim().max(2000, "Notities mogen max 2000 tekens zijn").optional().or(z.literal("")),
});

type LeadFormErrors = Partial<Record<keyof z.infer<typeof leadFormSchema>, string>>;

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive">{msg}</p>;
}

function CreateLeadDialog({
  open, onClose, organizationId, onCreated,
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

  useEffect(() => {
    if (open) {
      setName(""); setCompany(""); setContactPerson(""); setEmail("");
      setPhone(""); setSource("handmatig"); setStage("nieuwe"); setValue("0"); setNotes("");
      setErrors({});
    }
  }, [open]);

  async function save() {
    if (!organizationId) {
      toast.error("Geen actieve organisatie", { description: "Selecteer eerst een omgeving in de sidebar." });
      return;
    }
    const parsed = leadFormSchema.safeParse({
      name, company, contactPerson, email, phone, source, stage, value, notes,
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
        toast.error("Deze lead bestaat al", { description: "Er is al een lead met dezelfde gegevens." });
      } else if (msg.includes("permission") || msg.includes("row-level")) {
        toast.error("Geen toegang", { description: "Je hebt geen rechten om een lead toe te voegen in deze omgeving." });
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
        <div className="grid gap-3 text-sm">
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
                <SelectTrigger className={errors.source ? "border-destructive" : ""}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["handmatig","website","referral","cold_outreach","linkedin","evenement","aanbesteding","anders"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError msg={errors.source} />
            </div>
            <div className="grid gap-1">
              <Label>Status</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className={errors.stage ? "border-destructive" : ""}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
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
          <Button variant="outline" onClick={onClose} disabled={saving}>Annuleren</Button>
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
  lead, onClose, onSaved,
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
    if (!name.trim()) { toast.error("Naam is verplicht"); return; }
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
    if (error) { toast.error(error.message); return; }
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
              <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} maxLength={200} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} />
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["handmatig","website","referral","cold_outreach","linkedin","evenement","aanbesteding","anders"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Status</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
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
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Annuleren</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Opslaan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

