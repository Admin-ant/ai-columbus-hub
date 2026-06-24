import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Loader2, Trash2, BookOpen, Receipt, Search, Download, Undo2, ExternalLink, AlertTriangle, Paperclip, Upload, FileText, RefreshCw, DownloadCloud,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
type ClientRow = Pick<Database["public"]["Tables"]["clients"]["Row"], "id" | "name">;
type ProjectRow = Pick<Database["public"]["Tables"]["projects"]["Row"], "id" | "name">;
type AccountRow = Pick<Database["public"]["Tables"]["chart_of_accounts"]["Row"], "id" | "code" | "name" | "type">;
type JournalLink = {
  id: string;
  expense_id: string | null;
  description: string | null;
  reverses_entry_id: string | null;
  reversed_by_entry_id: string | null;
  created_at: string | null;
};

const EUR = (cents: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format((cents ?? 0) / 100);

const CATEGORIES = [
  "Software & abonnementen", "Hosting & infrastructuur", "Marketing", "Kantoorbenodigdheden",
  "Reizen", "Verzekeringen", "Bankkosten", "Inhuur / freelance", "Overig",
];

const PAY_STATUS_LABEL: Record<string, string> = {
  open: "Open", paid: "Betaald", reimbursed: "Vergoed", cancelled: "Geannuleerd",
};

const JOURNAL_STATUS: Record<string, { label: string; cls: string }> = {
  not_posted: { label: "Niet geboekt", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  pending:    { label: "In afwachting", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  posted:     { label: "Geboekt", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  reversed:   { label: "Teruggeboekt", cls: "bg-orange-100 text-orange-800 border-orange-200" },
  error:      { label: "Fout", cls: "bg-red-100 text-red-800 border-red-200" },
};

// Toegestane tegenrekeningen voor handmatige selectie
const COUNTER_ACCOUNT_CODES = new Set(["1000", "1100", "1700", "4000"]);

export function ExpensesTab({ orgId, userId }: { orgId: string; userId: string | null }) {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [journalByExpense, setJournalByExpense] = useState<Map<string, JournalLink>>(new Map());
  const [attachmentCounts, setAttachmentCounts] = useState<Map<string, number>>(new Map());
  const [attachExpenseId, setAttachExpenseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [journalFilter, setJournalFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [counterCode, setCounterCode] = useState<string>("");
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseConfirm, setReverseConfirm] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const [{ data: exps }, { data: cls }, { data: prjs }, { data: jes }, { data: accs }] = await Promise.all([
      supabase.from("expenses").select("*").eq("organization_id", orgId).order("expense_date", { ascending: false }),
      supabase.from("clients").select("id,name").eq("organization_id", orgId).order("name"),
      supabase.from("projects").select("id,name").eq("organization_id", orgId).order("name"),
      supabase.from("journal_entries")
        .select("id,expense_id,description,reverses_entry_id,reversed_by_entry_id,created_at")
        .eq("organization_id", orgId)
        .not("expense_id", "is", null)
        .order("created_at", { ascending: false }),
      supabase.from("chart_of_accounts").select("id,code,name,type").eq("organization_id", orgId).order("code"),
    ]);
    setExpenses((exps ?? []) as ExpenseRow[]);
    setClients((cls ?? []) as ClientRow[]);
    setProjects((prjs ?? []) as ProjectRow[]);
    setAccounts((accs ?? []) as AccountRow[]);
    // Hoogste actieve boeking per uitgave (laatste die niet teruggeboekt is, anders meest recente)
    const map = new Map<string, JournalLink>();
    ((jes ?? []) as JournalLink[]).forEach(j => {
      if (!j.expense_id) return;
      const existing = map.get(j.expense_id);
      const isActive = !j.reverses_entry_id && !j.reversed_by_entry_id;
      if (!existing || isActive) map.set(j.expense_id, j);
    });
    setJournalByExpense(map);

    // Aantal bijlagen per uitgave
    const { data: atts } = await supabase
      .from("expense_attachments")
      .select("expense_id")
      .eq("organization_id", orgId);
    const counts = new Map<string, number>();
    ((atts ?? []) as { expense_id: string }[]).forEach(a => {
      counts.set(a.expense_id, (counts.get(a.expense_id) ?? 0) + 1);
    });
    setAttachmentCounts(counts);

    setLoading(false);
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  // Form
  const [form, setForm] = useState({
    supplier: "", description: "", category: "Software & abonnementen",
    expense_date: new Date().toISOString().slice(0, 10),
    amount: "", vat_rate: 21,
    payment_method: "bank", reference: "",
    client_id: "", project_id: "",
    status: "open" as "open" | "paid" | "reimbursed" | "cancelled",
    notes: "",
  });

  function resetForm() {
    setForm({
      supplier: "", description: "", category: "Software & abonnementen",
      expense_date: new Date().toISOString().slice(0, 10),
      amount: "", vat_rate: 21, payment_method: "bank", reference: "",
      client_id: "", project_id: "",
      status: "open", notes: "",
    });
  }

  // --- Validatie & afronding ---
  const amountNumber = Number(form.amount.replace(",", "."));
  const amountValid = !Number.isNaN(amountNumber) && amountNumber > 0 && amountNumber < 1_000_000;
  const amountCents = amountValid ? Math.round(amountNumber * 100) : 0;
  const vatRate = Number(form.vat_rate);
  const vatCents = Math.round(amountCents * (vatRate / 100));
  const totalCents = amountCents + vatCents;
  const formErrors: string[] = [];
  if (!form.supplier.trim()) formErrors.push("Leverancier is verplicht");
  if (!amountValid) formErrors.push("Bedrag moet groter dan 0 en kleiner dan € 1.000.000 zijn");
  if (![0, 9, 21].includes(vatRate)) formErrors.push("BTW-tarief moet 0%, 9% of 21% zijn");
  if (amountCents + vatCents !== totalCents) formErrors.push("Totaal komt niet overeen met subtotaal + BTW");

  async function saveExpense() {
    if (formErrors.length) { toast.error(formErrors[0]); return; }
    setSaving(true);
    const { error } = await supabase.from("expenses").insert({
      organization_id: orgId,
      supplier: form.supplier.trim(),
      description: form.description || null,
      category: form.category || null,
      expense_date: form.expense_date,
      amount_cents: amountCents,
      vat_cents: vatCents,
      total_cents: totalCents,
      vat_rate: vatRate,
      payment_method: form.payment_method || null,
      reference: form.reference || null,
      client_id: form.client_id || null,
      project_id: form.project_id || null,
      status: form.status,
      paid_at: form.status === "paid" ? new Date().toISOString() : null,
      notes: form.notes || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Uitgave opgeslagen");
    resetForm();
    setOpen(false);
    void load();
  }

  async function deleteExpense(id: string) {
    if (!confirm("Uitgave verwijderen?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Verwijderd");
    void load();
  }

  async function postToJournal(id: string, code: string) {
    // Optimistisch: zet status op pending
    await supabase.from("expenses").update({ journal_status: "pending" }).eq("id", id);
    const { error } = await supabase.rpc("post_expense_journal", { _expense_id: id, _counter_code: code || undefined });
    if (error) {
      await supabase.from("expenses").update({ journal_status: "error", journal_error: error.message }).eq("id", id);
      toast.error(error.message);
      void load();
      return;
    }
    toast.success("Uitgave geboekt in journaal");
    setPreviewId(null);
    setCounterCode("");
    void load();
  }

  async function reverseJournal(id: string) {
    const { error } = await supabase.rpc("reverse_expense_journal", { _expense_id: id, _reason: reverseReason || undefined });
    if (error) { toast.error(error.message); return; }
    toast.success("Boeking teruggedraaid");
    setReverseId(null);
    setReverseReason("");
    setReverseConfirm(false);
    void load();
  }

  async function markPaid(id: string) {
    const { error } = await supabase.from("expenses").update({
      status: "paid", paid_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Gemarkeerd als betaald");
    void load();
  }

  const previewExpense = useMemo(() => expenses.find(e => e.id === previewId) ?? null, [expenses, previewId]);
  const reverseExpense = useMemo(() => expenses.find(e => e.id === reverseId) ?? null, [expenses, reverseId]);

  // Suggested counter account (Bank bij betaald, anders Crediteuren)
  const suggestedCode = useMemo(() => {
    if (!previewExpense) return "1700";
    return previewExpense.status === "paid" || previewExpense.paid_at ? "1100" : "1700";
  }, [previewExpense]);

  useEffect(() => {
    if (previewId) setCounterCode(suggestedCode);
  }, [previewId, suggestedCode]);

  const counterAccounts = useMemo(
    () => accounts.filter(a => COUNTER_ACCOUNT_CODES.has(a.code)),
    [accounts],
  );

  const filtered = useMemo(() => {
    return expenses.filter(e => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (journalFilter !== "all" && (e.journal_status ?? "not_posted") !== journalFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const blob = `${e.supplier} ${e.description ?? ""} ${e.reference ?? ""} ${e.category ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });
  }, [expenses, statusFilter, journalFilter, search]);

  const totals = useMemo(() => {
    const r = { total: 0, open: 0, paid: 0, vat: 0 };
    expenses.forEach(e => {
      r.total += Number(e.total_cents ?? 0);
      r.vat += Number(e.vat_cents ?? 0);
      if (e.status === "paid") r.paid += Number(e.total_cents ?? 0);
      else if (e.status === "open") r.open += Number(e.total_cents ?? 0);
    });
    return r;
  }, [expenses]);

  function exportCSV() {
    const rows = [
      ["Datum","Leverancier","Omschrijving","Categorie","Referentie","Betaalstatus","Boekingsstatus","Bedrag excl.","BTW","Totaal","Journaal-ID"],
      ...filtered.map(e => {
        const j = journalByExpense.get(e.id);
        return [
          e.expense_date,
          e.supplier,
          (e.description ?? "").replace(/[\r\n]+/g, " "),
          e.category ?? "",
          e.reference ?? "",
          PAY_STATUS_LABEL[e.status] ?? e.status,
          JOURNAL_STATUS[e.journal_status ?? "not_posted"]?.label ?? e.journal_status ?? "",
          ((e.amount_cents ?? 0) / 100).toFixed(2).replace(".", ","),
          ((e.vat_cents ?? 0) / 100).toFixed(2).replace(".", ","),
          ((e.total_cents ?? 0) / 100).toFixed(2).replace(".", ","),
          j?.id ?? "",
        ];
      }),
    ];
    const csv = rows.map(r => r.map(c => {
      const s = String(c ?? "");
      return /[";,\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uitgaven-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPreviewPDF() {
    if (!previewExpense) return;
    const e = previewExpense;
    const code = counterCode || suggestedCode;
    const acc = counterAccounts.find(a => a.code === code);
    const lines = [
      { acc: "4000", name: `Kosten algemeen${e.category ? ` (${e.category})` : ""}`, debit: e.amount_cents, credit: 0 },
      ...(e.vat_cents > 0 ? [{ acc: "1500", name: `Te vorderen BTW ${e.vat_rate ?? 21}%`, debit: e.vat_cents, credit: 0 }] : []),
      { acc: code, name: acc?.name ?? "Tegenrekening", debit: 0, credit: e.total_cents },
    ];
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Journaalvoorvertoning</title>
      <style>body{font:13px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:32px;color:#111}
      h1{font-size:18px;margin:0 0 8px}h2{font-size:14px;margin:20px 0 6px}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th,td{padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:left}
      th{background:#f8fafc;font-weight:600}.r{text-align:right;font-variant-numeric:tabular-nums}
      .meta{color:#6b7280;font-size:12px}.tot{font-weight:600;border-top:2px solid #111}
      .balanced{color:#059669}.unbalanced{color:#dc2626}</style></head><body>
      <h1>Journaalvoorvertoning</h1>
      <div class="meta">${e.expense_date} · ${e.supplier}${e.reference ? ` · ${e.reference}` : ""}</div>
      <div>${e.description ?? ""}</div>
      <h2>Boekingsregels</h2>
      <table><thead><tr><th>Rek.</th><th>Omschrijving</th><th class="r">Debet</th><th class="r">Credit</th></tr></thead><tbody>
      ${lines.map(l => `<tr><td>${l.acc}</td><td>${l.name}</td><td class="r">${l.debit ? EUR(l.debit) : "—"}</td><td class="r">${l.credit ? EUR(l.credit) : "—"}</td></tr>`).join("")}
      <tr class="tot"><td colspan="2">Totaal</td><td class="r">${EUR(totalDebit)}</td><td class="r">${EUR(totalCredit)}</td></tr>
      </tbody></table>
      <p class="${totalDebit === totalCredit ? "balanced" : "unbalanced"}">${totalDebit === totalCredit ? "✓ In balans" : "✗ Niet in balans"}</p>
      <p class="meta">Tegenrekening: ${code} — ${acc?.name ?? ""} (${e.status === "paid" || e.paid_at ? "auto: betaald → Bank" : "auto: open → Crediteuren"})</p>
      <script>window.print();</script></body></html>`);
    w.document.close();
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Totaal uitgaven" value={EUR(totals.total)} />
        <Stat label="Openstaand" value={EUR(totals.open)} accent={totals.open > 0 ? "text-orange-600" : ""} />
        <Stat label="Betaald" value={EUR(totals.paid)} accent="text-emerald-600" />
        <Stat label="Voorbelasting BTW" value={EUR(totals.vat)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Zoek leverancier, omschrijving…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Betaalstatus" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle betaalstatussen</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="paid">Betaald</SelectItem>
              <SelectItem value="reimbursed">Vergoed</SelectItem>
              <SelectItem value="cancelled">Geannuleerd</SelectItem>
            </SelectContent>
          </Select>
          <Select value={journalFilter} onValueChange={setJournalFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Boekingsstatus" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle boekingsstatussen</SelectItem>
              <SelectItem value="not_posted">Niet geboekt</SelectItem>
              <SelectItem value="pending">In afwachting</SelectItem>
              <SelectItem value="posted">Geboekt</SelectItem>
              <SelectItem value="reversed">Teruggeboekt</SelectItem>
              <SelectItem value="error">Fout</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCSV}><Download className="mr-2 h-4 w-4" /> Export CSV</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Nieuwe uitgave</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Uitgave invoeren</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Leverancier *</Label><Input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder="Bijv. Hetzner, Adobe…" /></div>
                <div><Label>Datum *</Label><Input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} /></div>
                <div className="sm:col-span-2"><Label>Omschrijving</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Bijv. Maandelijkse hosting" /></div>
                <div>
                  <Label>Categorie</Label>
                  <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Betaalmethode</Label>
                  <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank</SelectItem>
                      <SelectItem value="credit_card">Creditcard</SelectItem>
                      <SelectItem value="cash">Contant</SelectItem>
                      <SelectItem value="ideal">iDEAL</SelectItem>
                      <SelectItem value="other">Overig</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Bedrag excl. BTW *</Label><Input inputMode="decimal" placeholder="0,00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
                <div>
                  <Label>BTW %</Label>
                  <Select value={String(form.vat_rate)} onValueChange={v => setForm({ ...form, vat_rate: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="21">21%</SelectItem>
                      <SelectItem value="9">9%</SelectItem>
                      <SelectItem value="0">0%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Klant (optioneel)</Label>
                  <Select value={form.client_id || "none"} onValueChange={v => setForm({ ...form, client_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Geen —</SelectItem>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Project (optioneel)</Label>
                  <Select value={form.project_id || "none"} onValueChange={v => setForm({ ...form, project_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Geen —</SelectItem>
                      {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as typeof form.status })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="paid">Betaald</SelectItem>
                      <SelectItem value="reimbursed">Vergoed</SelectItem>
                      <SelectItem value="cancelled">Geannuleerd</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Referentie / factuurnr.</Label><Input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></div>
                <div className="sm:col-span-2"><Label>Notitie</Label><Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
                <div className="sm:col-span-2 rounded-md border bg-muted/40 p-3 text-sm">
                  <div className="flex justify-between"><span>Subtotaal</span><span className="tabular-nums">{EUR(amountCents)}</span></div>
                  <div className="flex justify-between"><span>BTW ({vatRate}%) — afgerond op centen</span><span className="tabular-nums">{EUR(vatCents)}</span></div>
                  <div className="mt-1 flex justify-between border-t pt-1 font-semibold"><span>Totaal</span><span className="tabular-nums">{EUR(totalCents)}</span></div>
                  {formErrors.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-xs text-destructive">
                      {formErrors.map((er, i) => <li key={i}>{er}</li>)}
                    </ul>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
                <Button onClick={saveExpense} disabled={saving || formErrors.length > 0}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Opslaan
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Leverancier</TableHead>
              <TableHead>Categorie</TableHead>
              <TableHead>Betaalstatus</TableHead>
              <TableHead>Boekingsstatus</TableHead>
              <TableHead className="text-right">Excl.</TableHead>
              <TableHead className="text-right">BTW</TableHead>
              <TableHead className="text-right">Totaal</TableHead>
              <TableHead className="text-right">Acties</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">Geen uitgaven gevonden.</TableCell></TableRow>
            ) : filtered.map(e => {
              const j = journalByExpense.get(e.id);
              const status = e.journal_status ?? "not_posted";
              const meta = JOURNAL_STATUS[status] ?? JOURNAL_STATUS.not_posted;
              const canPost = status === "not_posted" || status === "error" || status === "reversed";
              const canReverse = status === "posted" && !!j?.id;
              return (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground">{e.expense_date}</TableCell>
                  <TableCell>
                    <div className="font-medium">{e.supplier}</div>
                    {e.description && <div className="text-xs text-muted-foreground">{e.description}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{e.category ?? "—"}</TableCell>
                  <TableCell><Badge variant={e.status === "paid" ? "default" : "outline"}>{PAY_STATUS_LABEL[e.status] ?? e.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                      {j?.id && (status === "posted" || status === "reversed") && (
                        <Link
                          to="/boekhouding/journal/$entryId"
                          params={{ entryId: j.id }}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" /> Journaalpost
                        </Link>
                      )}
                      {status === "error" && e.journal_error && (
                        <span className="text-xs text-destructive line-clamp-2" title={e.journal_error}>{e.journal_error}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{EUR(e.amount_cents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{EUR(e.vat_cents)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{EUR(e.total_cents)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Bijlagen"
                        onClick={() => setAttachExpenseId(e.id)}
                        className="relative"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        {(attachmentCounts.get(e.id) ?? 0) > 0 && (
                          <span className="ml-1 text-[10px] font-semibold tabular-nums">{attachmentCounts.get(e.id)}</span>
                        )}
                      </Button>
                      {e.status !== "paid" && (
                        <Button variant="ghost" size="sm" title="Markeer als betaald" onClick={() => markPaid(e.id)}>
                          <Receipt className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canPost && (
                        <Button variant="ghost" size="sm" title="Voorvertoning journaal" onClick={() => setPreviewId(e.id)}>
                          <BookOpen className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canReverse && (
                        <Button variant="ghost" size="sm" title="Terugboeken" onClick={() => { setReverseId(e.id); setReverseReason(""); setReverseConfirm(false); }}>
                          <Undo2 className="h-3.5 w-3.5 text-orange-600" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" title="Verwijder" onClick={() => deleteExpense(e.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Journaalvoorvertoning */}
      <Dialog open={!!previewId} onOpenChange={(o) => { if (!o) { setPreviewId(null); setCounterCode(""); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Journaalvoorvertoning</DialogTitle></DialogHeader>
          {previewExpense && (() => {
            const e = previewExpense;
            const code = counterCode || suggestedCode;
            const acc = counterAccounts.find(a => a.code === code);
            const lines = [
              { acc: "4000", name: `Kosten algemeen${e.category ? ` (${e.category})` : ""}`, debit: e.amount_cents, credit: 0 },
              ...(e.vat_cents > 0 ? [{ acc: "1500", name: `Te vorderen BTW ${e.vat_rate ?? 21}%`, debit: e.vat_cents, credit: 0 }] : []),
              { acc: code, name: acc?.name ?? "Tegenrekening", debit: 0, credit: e.total_cents },
            ];
            const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
            const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
            const balanced = totalDebit === totalCredit;
            const sumCheck = (e.amount_cents ?? 0) + (e.vat_cents ?? 0) === (e.total_cents ?? 0);
            return (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  <div className="font-medium">{e.supplier}</div>
                  {e.description && <div className="text-xs text-muted-foreground">{e.description}</div>}
                  <div className="mt-1 text-xs text-muted-foreground">Datum {e.expense_date} · Betaalstatus {PAY_STATUS_LABEL[e.status] ?? e.status}</div>
                </div>

                <div>
                  <Label className="text-xs">Tegenrekening</Label>
                  <Select value={code} onValueChange={setCounterCode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {counterAccounts.map(a => (
                        <SelectItem key={a.id} value={a.code}>
                          {a.code} — {a.name}{a.code === suggestedCode ? "  (auto-suggestie)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Suggestie op basis van betaalstatus: {suggestedCode === "1100" ? "betaald → Bank (1100)" : "open → Crediteuren (1700)"}.
                  </p>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Rek.</TableHead>
                      <TableHead>Omschrijving</TableHead>
                      <TableHead className="text-right">Debet</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{l.acc}</TableCell>
                        <TableCell className="text-sm">{l.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.debit ? EUR(l.debit) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.credit ? EUR(l.credit) : "—"}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t font-semibold">
                      <TableCell colSpan={2}>Totaal</TableCell>
                      <TableCell className="text-right tabular-nums">{EUR(totalDebit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{EUR(totalCredit)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                <div className={`text-xs ${balanced ? "text-emerald-600" : "text-destructive"}`}>
                  {balanced ? "✓ Journaalpost is in balans" : "✗ Niet in balans"}
                </div>
                {!sumCheck && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Let op: subtotaal + BTW ≠ totaal in uitgave-record. Controleer de bedragen.
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={exportPreviewPDF}><Download className="mr-2 h-4 w-4" /> PDF</Button>
            <Button variant="outline" onClick={() => { setPreviewId(null); setCounterCode(""); }}>Annuleren</Button>
            <Button
              onClick={() => previewId && postToJournal(previewId, counterCode || suggestedCode)}
              disabled={!previewExpense || (previewExpense.amount_cents + previewExpense.vat_cents !== previewExpense.total_cents)}
            >
              <BookOpen className="mr-2 h-4 w-4" /> Bevestigen en boeken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terugboeken */}
      <Dialog open={!!reverseId} onOpenChange={(o) => { if (!o) { setReverseId(null); setReverseReason(""); setReverseConfirm(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Uitgave terugboeken</DialogTitle></DialogHeader>
          {reverseExpense && (() => {
            const j = journalByExpense.get(reverseExpense.id);
            return (
              <div className="space-y-3 text-sm">
                <div className="rounded-md border bg-muted/40 p-3">
                  <div className="font-medium">{reverseExpense.supplier}</div>
                  <div className="text-xs text-muted-foreground">{reverseExpense.expense_date} · {EUR(reverseExpense.total_cents)}</div>
                  {j?.id && (
                    <Link
                      to="/boekhouding/journal/$entryId"
                      params={{ entryId: j.id }}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Oorspronkelijke journaalpost openen
                    </Link>
                  )}
                </div>
                <div className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Er wordt een spiegel-journaalpost aangemaakt met omgedraaide debet/credit. De uitgave krijgt status <strong>Teruggeboekt</strong> en wordt gekoppeld aan de originele boeking.
                </div>
                <div>
                  <Label>Reden (optioneel)</Label>
                  <Textarea rows={2} value={reverseReason} onChange={e => setReverseReason(e.target.value)} placeholder="Bijv. verkeerde categorie, dubbele invoer…" />
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={reverseConfirm}
                    onChange={e => setReverseConfirm(e.target.checked)}
                  />
                  Ik weet zeker dat ik deze boeking wil terugdraaien.
                </label>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseId(null)}>Annuleren</Button>
            <Button
              variant="destructive"
              disabled={!reverseConfirm}
              onClick={() => reverseId && reverseJournal(reverseId)}
            >
              <Undo2 className="mr-2 h-4 w-4" /> Terugboeken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AttachmentsDialog
        orgId={orgId}
        expenseId={attachExpenseId}
        expense={expenses.find(e => e.id === attachExpenseId) ?? null}
        userId={userId}
        onClose={() => setAttachExpenseId(null)}
        onChanged={() => void load()}
      />
    </div>
  );
}

function Stat({ label, value, accent = "" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}

type AttachmentRow = {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  uploaded_by: string | null;
};

function AttachmentsDialog({
  orgId, expenseId, expense, userId, onClose, onChanged,
}: {
  orgId: string;
  expenseId: string | null;
  expense: ExpenseRow | null;
  userId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState<Array<{ name: string; pct: number; status: "uploading" | "done" | "error"; message?: string }>>([]);

  const refresh = useCallback(async () => {
    if (!expenseId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("expense_attachments")
      .select("id,storage_path,file_name,mime_type,size_bytes,created_at,uploaded_by")
      .eq("expense_id", expenseId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data ?? []) as AttachmentRow[]);
    setLoading(false);
  }, [expenseId]);

  useEffect(() => { if (expenseId) void refresh(); else { setItems([]); setProgress([]); } }, [expenseId, refresh]);

  function uploadWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      if (file.type) xhr.setRequestHeader("Content-Type", file.type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
      xhr.onerror = () => reject(new Error("Netwerkfout"));
      xhr.send(file);
    });
  }

  async function handleFiles(files: FileList | File[] | null) {
    if (!files || !expenseId) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    setProgress(list.map((f) => ({ name: f.name, pct: 0, status: "uploading" as const })));

    await Promise.all(list.map(async (file, idx) => {
      const update = (patch: Partial<{ pct: number; status: "uploading" | "done" | "error"; message: string }>) =>
        setProgress((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

      if (file.size > 25 * 1024 * 1024) {
        update({ status: "error", message: "Groter dan 25 MB" });
        return;
      }
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${orgId}/${expenseId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
      try {
        const signed = await supabase.storage.from("expense-attachments").createSignedUploadUrl(path);
        if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message ?? "Geen upload-URL");
        await uploadWithProgress(signed.data.signedUrl, file, (pct) => update({ pct }));
        const ins = await supabase.from("expense_attachments").insert({
          organization_id: orgId,
          expense_id: expenseId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_by: userId,
        });
        if (ins.error) {
          await supabase.storage.from("expense-attachments").remove([path]);
          throw new Error(ins.error.message);
        }
        update({ pct: 100, status: "done" });
      } catch (e) {
        update({ status: "error", message: e instanceof Error ? e.message : "Mislukt" });
      }
    }));

    setUploading(false);
    const okCount = list.length - progress.filter((p) => p.status === "error").length;
    if (okCount > 0) toast.success(`${okCount} bijlage(n) geüpload`);
    await refresh();
    onChanged();
    setTimeout(() => setProgress((prev) => prev.filter((p) => p.status === "error")), 1500);
  }

  async function openAttachment(a: AttachmentRow) {
    const { data, error } = await supabase.storage
      .from("expense-attachments")
      .createSignedUrl(a.storage_path, 60 * 5);
    if (error || !data?.signedUrl) { toast.error(error?.message ?? "Kan bestand niet openen"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function removeAttachment(a: AttachmentRow) {
    if (!confirm(`Bijlage "${a.file_name}" verwijderen?`)) return;
    await supabase.storage.from("expense-attachments").remove([a.storage_path]);
    const { error } = await supabase.from("expense_attachments").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Verwijderd");
    await refresh();
    onChanged();
  }

  return (
    <Dialog open={!!expenseId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Bijlagen{expense ? ` — ${expense.supplier}` : ""}</DialogTitle>
        </DialogHeader>

        <label
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation(); setIsDragging(false);
            if (!uploading) void handleFiles(e.dataTransfer.files);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-sm transition-colors ${
            isDragging ? "border-primary bg-primary/10" : "border-muted-foreground/30 bg-muted/30 hover:bg-muted/50"
          }`}
        >
          <Upload className={`h-5 w-5 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
          <span className={isDragging ? "text-primary font-medium" : "text-muted-foreground"}>
            {uploading
              ? "Bezig met uploaden…"
              : isDragging
                ? "Laat los om te uploaden"
                : "Sleep meerdere bestanden hier of klik (PDF, JPG, PNG — max 25 MB per bestand)"}
          </span>
          <input
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }}
          />
        </label>

        {progress.length > 0 && (
          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            {progress.map((p, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium" title={p.name}>{p.name}</span>
                  <span className={`shrink-0 tabular-nums ${
                    p.status === "error" ? "text-destructive" : p.status === "done" ? "text-green-600" : "text-muted-foreground"
                  }`}>
                    {p.status === "error" ? (p.message ?? "Fout") : p.status === "done" ? "Klaar" : `${p.pct}%`}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full transition-all ${
                      p.status === "error" ? "bg-destructive" : p.status === "done" ? "bg-green-500" : "bg-primary"
                    }`}
                    style={{ width: `${p.status === "error" ? 100 : p.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="max-h-72 overflow-y-auto rounded-md border">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
            </div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Nog geen bijlagen.</div>
          ) : (
            <ul className="divide-y">
              {items.map(a => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <button
                    onClick={() => openAttachment(a)}
                    className="flex-1 truncate text-left text-sm font-medium text-primary hover:underline"
                    title={a.file_name}
                  >
                    {a.file_name}
                  </button>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {a.size_bytes ? `${(a.size_bytes / 1024).toFixed(0)} KB` : ""}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => removeAttachment(a)} title="Verwijder">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={uploading}>Sluiten</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
