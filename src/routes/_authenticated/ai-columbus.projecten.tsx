import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Search, X, Trash2, ExternalLink, Download, FileSpreadsheet, Eye, ArrowRight, Info } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/ai-columbus/projecten")({
  head: () => ({ meta: [{ title: "Projecten (uitvoering)" }] }),
  component: ProjectsDashboardPage,
});

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type ProjectStatus = Database["public"]["Enums"]["project_status"];
type DeliveryStatus = Database["public"]["Enums"]["project_delivery_status"];
type ClientLite = { id: string; name: string };

const EUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

const STATUS_META: Record<ProjectStatus, { label: string; cls: string }> = {
  contact_gezocht:     { label: "Contact gezocht",     cls: "bg-blue-500 text-foreground" },
  afspraak_geboekt:    { label: "Afspraak geboekt",    cls: "bg-green-500 text-foreground" },
  offerte_verstuurd:   { label: "Offerte verstuurd",   cls: "bg-yellow-400 text-foreground" },
  contract_verstuurd:  { label: "Contract verstuurd",  cls: "bg-orange-500 text-foreground" },
  contract_getekend:   { label: "Contract getekend",   cls: "bg-emerald-700 text-foreground" },
  on_hold:             { label: "On hold",             cls: "bg-slate-400 text-foreground" },
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


function ProjectsDashboardPage() {
  const { user } = useAuth();
  const { currentOrganizationId, currentOrganization, loading: wsLoading } = useWorkspace();
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { display_name: string | null; email: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportType, setExportType] = useState<"csv" | "xlsx" | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", value: "0", monthly: "0", one_time: "0",
    target_month: "", client_id: "" as string,
    status: "contact_gezocht" as ProjectStatus,
    contact_name: "", contact_email: "", contact_phone: "", notes: "",
  });

  async function load() {
    if (!currentOrganizationId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("projects").select("*")
      .eq("organization_id", currentOrganizationId)
      .order("target_month", { ascending: true, nullsFirst: false });
    if (error) toast.error(error.message);
    const list = (data ?? []) as ProjectRow[];
    setRows(list);

    const ids = Array.from(new Set(list.map((r) => r.last_modified_by).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles").select("id,display_name,email").in("id", ids);
      const map: Record<string, { display_name: string | null; email: string | null }> = {};
      (profs ?? []).forEach((p) => { map[p.id] = { display_name: p.display_name, email: p.email }; });
      setProfiles(map);
    } else setProfiles({});
    setLoading(false);
  }

  useEffect(() => { if (!wsLoading) load(); /* eslint-disable-next-line */ }, [currentOrganizationId, wsLoading]);

  useEffect(() => {
    if (!currentOrganizationId) { setClients([]); return; }
    supabase.from("clients").select("id,name").eq("organization_id", currentOrganizationId).order("name")
      .then(({ data }) => setClients((data ?? []) as ClientLite[]));
  }, [currentOrganizationId]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.target_month) set.add(monthKey(r.target_month)); });
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (monthFilter !== "all" && monthKey(r.target_month) !== monthFilter) return false;
      if (q) {
        const hay = `${r.name} ${r.contact_name ?? ""} ${r.contact_email ?? ""} ${r.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, monthFilter, search]);

  const total = useMemo(() => filtered.reduce((s, r) => s + Number(r.value_cents ?? 0), 0), [filtered]);
  const monthlyTotal = useMemo(() => filtered.reduce((s, r) => s + Number((r as any).monthly_value_cents ?? 0), 0), [filtered]);
  const oneTimeTotal = useMemo(() => filtered.reduce((s, r) => s + Number((r as any).one_time_cents ?? 0), 0), [filtered]);

  async function updateRow(id: string, patch: Partial<ProjectRow>) {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch, last_modified_by: user?.id ?? r.last_modified_by, last_modified_at: new Date().toISOString() } : r)));
    const { error } = await supabase
      .from("projects")
      .update({ ...patch, last_modified_by: user?.id ?? null, last_modified_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(error.message); setRows(prev); }
    else if (user?.id) {
      setProfiles((p) => p[user.id] ? p : { ...p, [user.id]: { display_name: user.email ?? null, email: user.email ?? null } });
    }
  }

  async function deleteRow(id: string) {
    if (!confirm("Project verwijderen?")) return;
    const prev = rows;
    setRows((rs) => rs.filter((r) => r.id !== id));
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) { toast.error(error.message); setRows(prev); }
    else toast.success("Verwijderd");
  }

  async function createRow(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Naam verplicht");
    if (!currentOrganizationId) return toast.error("Geen organisatie");
    setSaving(true);
    const valueCents = Math.round((Number(form.value) || 0) * 100);
    const { error } = await supabase.from("projects").insert({
      organization_id: currentOrganizationId,
      name: form.name.trim(),
      value_cents: valueCents,
      monthly_value_cents: Math.round((Number(form.monthly) || 0) * 100),
      one_time_cents: Math.round((Number(form.one_time) || 0) * 100),
      target_month: form.target_month || null,
      status: form.status,
      client_id: form.client_id || null,
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      notes: form.notes || null,
      created_by: user?.id ?? null,
      last_modified_by: user?.id ?? null,
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Project toegevoegd");
    setOpen(false);
    setForm({ name: "", value: "0", monthly: "0", one_time: "0", target_month: "", client_id: "", status: "contact_gezocht", contact_name: "", contact_email: "", contact_phone: "", notes: "" });
    load();
  }

  const filtersActive = statusFilter !== "all" || monthFilter !== "all" || search !== "";

  function buildExportRows() {
    return filtered.map((r) => ({
      Project: r.name,
      "Waarde (EUR)": Number(r.value_cents ?? 0) / 100,
      "Maandelijkse opbrengst (EUR)": Number((r as any).monthly_value_cents ?? 0) / 100,
      "Eenmalige kosten (EUR)": Number((r as any).one_time_cents ?? 0) / 100,
      Maand: r.target_month ? monthLabel(r.target_month) : "",
      Status: STATUS_META[r.status].label,
      Contactpersoon: r.contact_name ?? "",
      Email: r.contact_email ?? "",
      Telefoon: r.contact_phone ?? "",
      Notities: r.notes ?? "",
      "Laatst gewijzigd door":
        (r.last_modified_by && (profiles[r.last_modified_by]?.display_name || profiles[r.last_modified_by]?.email)) || "",
      "Laatst gewijzigd op": r.last_modified_at
        ? new Date(r.last_modified_at).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })
        : "",
    }));
  }

  function filterSummary() {
    const parts: string[] = [];
    parts.push(`Status: ${statusFilter === "all" ? "Alle" : STATUS_META[statusFilter as ProjectStatus].label}`);
    parts.push(`Maand: ${monthFilter === "all" ? "Alle" : monthLabel(`${monthFilter}-01`)}`);
    if (search) parts.push(`Zoekterm: ${search}`);
    return parts.join(" · ");
  }

  function fileBase() {
    const stamp = new Date().toISOString().slice(0, 10);
    return `projecten_${currentOrganization?.slug ?? "export"}_${stamp}`;
  }

  function runExport(type: "csv" | "xlsx") {
    if (type === "csv") exportCsv();
    else exportXlsx();
    setExportOpen(false);
  }

  function exportCsv() {
    const rows = buildExportRows();
    if (rows.length === 0) return toast.error("Geen rijen om te exporteren");
    const headers = Object.keys(rows[0]);
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const meta = [
      `# Projectenexport — ${currentOrganization?.name ?? ""}`,
      `# Filters: ${filterSummary()}`,
      `# Rijen: ${rows.length} · Totale waarde: € ${(total / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      "",
    ].join("\n");
    const body = [headers.join(";"), ...rows.map((r) => headers.map((h) => esc((r as Record<string, unknown>)[h])).join(";"))].join("\n");
    const totalRow = headers
      .map((h, i) => (i === 0 ? "TOTAAL" : h === "Waarde (EUR)" ? (total / 100).toFixed(2) : ""))
      .join(";");
    const csv = "\ufeff" + meta + body + "\n" + totalRow + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${fileBase()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} rijen geëxporteerd`);
  }

  function exportXlsx() {
    const rows = buildExportRows();
    if (rows.length === 0) return toast.error("Geen rijen om te exporteren");
    const wb = XLSX.utils.book_new();
    const headerRow = ["Projectenexport", currentOrganization?.name ?? ""];
    const filtersRow = ["Filters", filterSummary()];
    const countRow = ["Rijen", rows.length];
    const totalRow = ["Totale waarde (EUR)", total / 100];
    const headers = Object.keys(rows[0]);
    const dataAoa: (string | number)[][] = [
      headerRow, filtersRow, countRow, totalRow, [],
      headers,
      ...rows.map((r) => headers.map((h) => (r as Record<string, string | number>)[h])),
      ["TOTAAL", total / 100],
    ];
    const ws = XLSX.utils.aoa_to_sheet(dataAoa);
    ws["!cols"] = headers.map((h) => ({ wch: h === "Notities" ? 40 : h === "Project" ? 24 : 18 }));
    // Currency format on value column (index 1) for data + total rows
    const headerRowIdx = 6; // 1-based: 5 meta rows + headers at row 6
    for (let i = 0; i < rows.length; i++) {
      const cell = XLSX.utils.encode_cell({ r: headerRowIdx + i, c: 1 });
      if (ws[cell]) ws[cell].z = '€ #,##0.00;€ -#,##0.00;-';
    }
    const totalCell = XLSX.utils.encode_cell({ r: headerRowIdx + rows.length, c: 1 });
    if (ws[totalCell]) ws[totalCell].z = '€ #,##0.00;€ -#,##0.00;-';
    const totalsValCell = XLSX.utils.encode_cell({ r: 3, c: 1 });
    if (ws[totalsValCell]) ws[totalsValCell].z = '€ #,##0.00;€ -#,##0.00;-';
    XLSX.utils.book_append_sheet(wb, ws, "Projecten");
    XLSX.writeFile(wb, `${fileBase()}.xlsx`);
    toast.success(`${rows.length} rijen geëxporteerd`);
  }

  const exportPreviewRows = buildExportRows();


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {currentOrganization?.name ?? ""} — Projecten dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Overzicht van status en voortgang van klanten/projecten.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={filtered.length === 0}>
                <Download className="mr-2 h-4 w-4" /> Exporteren
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setExportType("xlsx"); setExportOpen(true); }}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setExportType("csv"); setExportOpen(true); }}>
                <Download className="mr-2 h-4 w-4" /> CSV (.csv)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nieuw project toevoegen</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nieuw project</DialogTitle>
              <DialogDescription>{currentOrganization?.name}</DialogDescription>
            </DialogHeader>
            <form onSubmit={createRow} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Naam *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Klant</Label>
                  <Select value={form.client_id || "__none"} onValueChange={(v) => {
                    const id = v === "__none" ? "" : v;
                    const c = clients.find(c => c.id === id);
                    setForm({ ...form, client_id: id, name: form.name || (c?.name ?? "") });
                  }}>
                    <SelectTrigger><SelectValue placeholder="Geen klant" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Geen klant</SelectItem>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Totale deal-waarde (€)</Label>
                  <Input type="number" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Doelmaand</Label>
                  <Input type="month" value={form.target_month ? form.target_month.slice(0,7) : ""}
                    onChange={(e) => setForm({ ...form, target_month: e.target.value ? `${e.target.value}-01` : "" })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Maandelijkse opbrengst (€)</Label>
                  <Input type="number" step="0.01" value={form.monthly} onChange={(e) => setForm({ ...form, monthly: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Eenmalige kosten (€)</Label>
                  <Input type="number" step="0.01" value={form.one_time} onChange={(e) => setForm({ ...form, one_time: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ProjectStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_KEYS.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Contactpersoon</Label>
                  <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Telefoon</Label>
                  <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Notities</Label>
                  <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Opslaan
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={exportOpen} onOpenChange={setExportOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" /> Exportvoorbeeld
              </DialogTitle>
              <DialogDescription>
                Controleer welke rijen en filters worden meegenomen in de export.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Aantal rijen</div>
                  <div className="text-2xl font-semibold tabular-nums">{exportPreviewRows.length}</div>
                </div>
                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Totale waarde</div>
                  <div className="text-2xl font-semibold tabular-nums">{EUR.format(total / 100)}</div>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Actieve filters</div>
                <div className="rounded-md border bg-card p-2.5 text-sm">{filterSummary()}</div>
              </div>
              {exportPreviewRows.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">
                    Eerste {Math.min(exportPreviewRows.length, 5)} project{exportPreviewRows.length === 1 ? "" : "en"}
                  </div>
                  <ul className="max-h-32 overflow-auto rounded-md border bg-card text-sm">
                    {exportPreviewRows.slice(0, 5).map((r, i) => (
                      <li key={i} className="flex items-center justify-between border-b px-3 py-1.5 last:border-b-0">
                        <span className="truncate pr-2">{r.Project}</span>
                        <span className="tabular-nums text-muted-foreground">{EUR.format(Number(r["Waarde (EUR)"]))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setExportOpen(false)}>Annuleren</Button>
              <Button onClick={() => exportType && runExport(exportType)} disabled={!exportType || exportPreviewRows.length === 0}>
                {exportType === "xlsx" ? <FileSpreadsheet className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
                Exporteer {exportType === "xlsx" ? "Excel" : "CSV"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Maandelijkse opbrengst</div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{EUR.format(monthlyTotal / 100)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Som van alle {filtered.length} projecten in filter</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Eenmalige kosten</div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">{EUR.format(oneTimeTotal / 100)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Totaal eenmalig / setup</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Totale deal-waarde</div>
          <div className="mt-2 text-2xl font-bold tabular-nums">{EUR.format(total / 100)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Som van 'Waarde' kolom</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {STATUS_KEYS.map((s) => {
          const items = rows.filter((r) => r.status === s);
          const sum = items.reduce((acc, r) => acc + Number(r.value_cents ?? 0), 0);
          const active = statusFilter === s;
          return (
            <button key={s} type="button"
              onClick={() => setStatusFilter(active ? "all" : s)}
              className={`rounded-lg border bg-card p-3 text-left transition-shadow hover:shadow-md ${active ? "ring-2 ring-primary" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_META[s].cls.split(" ")[0]}`} />
                <span className="text-xs font-medium text-muted-foreground">{items.length}</span>
              </div>
              <div className="mt-2 text-xs font-medium leading-tight">{STATUS_META[s].label}</div>
              <div className="mt-1 text-base font-semibold tabular-nums">{EUR.format(sum / 100)}</div>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek project, contact of notitie…" className="h-9 pl-7" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle statussen</SelectItem>
              {STATUS_KEYS.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Maand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle maanden</SelectItem>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>{monthLabel(`${m}-01`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button variant="ghost" size="sm" className="h-9"
              onClick={() => { setStatusFilter("all"); setMonthFilter("all"); setSearch(""); }}>
              <X className="mr-1 h-3 w-3" /> Wis filters
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Project</th>
                  <th className="px-4 py-2 text-right font-medium">Waarde</th>
                  <th className="px-4 py-2 text-right font-medium">Mnd opbrengst</th>
                  <th className="px-4 py-2 text-right font-medium">Eenmalig</th>
                  <th className="px-4 py-2 font-medium">Maand</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Contact</th>
                  <th className="px-4 py-2 font-medium">Laatste actie / Notities</th>
                  <th className="px-4 py-2 font-medium">Laatst gewijzigd</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">Geen projecten met deze filters.</td></tr>
                )}
                {filtered.map((r) => {
                  const prof = r.last_modified_by ? profiles[r.last_modified_by] : null;
                  const who = prof?.display_name || prof?.email || "—";
                  return (
                    <tr key={r.id} className="border-b align-top hover:bg-muted/20">
                      <td className="px-4 py-2 font-medium">
                        <div className="flex items-center gap-1">
                          <EditableText value={r.name} onSave={(v) => updateRow(r.id, { name: v || r.name })} />
                          <Link to="/ai-columbus/projecten/$projectId" params={{ projectId: r.id }}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Open detail">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <EditableNumber value={Number(r.value_cents) / 100}
                          onSave={(v) => updateRow(r.id, { value_cents: Math.round(v * 100) })} />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <EditableNumber value={Number((r as any).monthly_value_cents ?? 0) / 100}
                          onSave={(v) => updateRow(r.id, { monthly_value_cents: Math.round(v * 100) } as any)} />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <EditableNumber value={Number((r as any).one_time_cents ?? 0) / 100}
                          onSave={(v) => updateRow(r.id, { one_time_cents: Math.round(v * 100) } as any)} />
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        <Input type="month" defaultValue={r.target_month ? r.target_month.slice(0,7) : ""}
                          onBlur={(e) => {
                            const v = e.target.value ? `${e.target.value}-01` : null;
                            if (v !== r.target_month) updateRow(r.id, { target_month: v });
                          }}
                          className="h-8 w-[130px] text-xs" />
                      </td>
                      <td className="px-4 py-2">
                        <Select value={r.status} onValueChange={(v) => updateRow(r.id, { status: v as ProjectStatus })}>
                          <SelectTrigger className="h-8 w-[170px] border-0 p-0 [&>span]:w-full">
                            <Badge className={`${STATUS_META[r.status].cls} w-full justify-center`}>
                              {STATUS_META[r.status].label}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_KEYS.map((s) => (
                              <SelectItem key={s} value={s}>
                                <span className={`mr-2 inline-block h-2 w-2 rounded-full ${STATUS_META[s].cls.split(" ")[0]}`} />
                                {STATUS_META[s].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <EditableText placeholder="Naam" value={r.contact_name ?? ""}
                          onSave={(v) => updateRow(r.id, { contact_name: v || null })} />
                        <EditableText placeholder="E-mail" value={r.contact_email ?? ""}
                          onSave={(v) => updateRow(r.id, { contact_email: v || null })}
                          className="text-muted-foreground" />
                        <EditableText placeholder="Telefoon" value={r.contact_phone ?? ""}
                          onSave={(v) => updateRow(r.id, { contact_phone: v || null })}
                          className="text-muted-foreground" />
                      </td>
                      <td className="px-4 py-2 min-w-[220px]">
                        <Textarea defaultValue={r.notes ?? ""} rows={2}
                          placeholder="Korte update…"
                          onBlur={(e) => { if (e.target.value !== (r.notes ?? "")) updateRow(r.id, { notes: e.target.value || null }); }}
                          className="min-h-[44px] text-xs" />
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        <div>{who}</div>
                        <div>{r.last_modified_at ? new Date(r.last_modified_at).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" }) : "—"}</div>
                      </td>
                      <td className="px-2 py-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteRow(r.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/40 font-semibold">
                  <td className="px-4 py-3">Totaal ({filtered.length})</td>
                  <td className="px-4 py-3 text-right tabular-nums">{EUR.format(total / 100)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{EUR.format(monthlyTotal / 100)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-indigo-600 dark:text-indigo-400">{EUR.format(oneTimeTotal / 100)}</td>
                  <td colSpan={6}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function EditableText({
  value, onSave, placeholder, className,
}: { value: string; onSave: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <Input
      defaultValue={value}
      placeholder={placeholder}
      onBlur={(e) => { if (e.target.value !== value) onSave(e.target.value); }}
      className={`h-7 border-transparent bg-transparent px-1 text-xs hover:border-input focus:border-input ${className ?? ""}`}
    />
  );
}

function EditableNumber({
  value, onSave,
}: { value: number; onSave: (v: number) => void }) {
  return (
    <Input
      type="number" step="0.01"
      defaultValue={value}
      onBlur={(e) => {
        const v = Number(e.target.value) || 0;
        if (v !== value) onSave(v);
      }}
      className="h-7 border-transparent bg-transparent px-1 text-right text-xs hover:border-input focus:border-input"
    />
  );
}
