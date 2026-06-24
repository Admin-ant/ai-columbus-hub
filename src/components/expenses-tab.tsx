import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Trash2, BookOpen, Receipt, Search } from "lucide-react";
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

const EUR = (cents: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format((cents ?? 0) / 100);

const CATEGORIES = [
  "Software & abonnementen", "Hosting & infrastructuur", "Marketing", "Kantoorbenodigdheden",
  "Reizen", "Verzekeringen", "Bankkosten", "Inhuur / freelance", "Overig",
];

const STATUS_LABEL: Record<string, string> = {
  open: "Open", paid: "Betaald", reimbursed: "Vergoed", cancelled: "Geannuleerd",
};

export function ExpensesTab({ orgId, userId }: { orgId: string; userId: string | null }) {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [postedIds, setPostedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const [{ data: exps }, { data: cls }, { data: prjs }, { data: jes }] = await Promise.all([
      supabase.from("expenses").select("*").eq("organization_id", orgId).order("expense_date", { ascending: false }),
      supabase.from("clients").select("id,name").eq("organization_id", orgId).order("name"),
      supabase.from("projects").select("id,name").eq("organization_id", orgId).order("name"),
      supabase.from("journal_entries").select("expense_id").eq("organization_id", orgId).not("expense_id", "is", null),
    ]);
    setExpenses((exps ?? []) as ExpenseRow[]);
    setClients((cls ?? []) as ClientRow[]);
    setProjects((prjs ?? []) as ProjectRow[]);
    setPostedIds(new Set((jes ?? []).map((j: { expense_id: string | null }) => j.expense_id).filter(Boolean) as string[]));
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

  const amountCents = Math.round((Number(form.amount.replace(",", ".")) || 0) * 100);
  const vatCents = Math.round(amountCents * (Number(form.vat_rate) / 100));
  const totalCents = amountCents + vatCents;

  async function saveExpense() {
    if (!form.supplier.trim()) { toast.error("Leverancier is verplicht"); return; }
    if (amountCents <= 0) { toast.error("Bedrag moet groter zijn dan 0"); return; }
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
      vat_rate: Number(form.vat_rate),
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

  async function postToJournal(id: string) {
    const { error } = await supabase.rpc("post_expense_journal", { _expense_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Uitgave geboekt in journaal");
    setPreviewId(null);
    void load();
  }

  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewExpense = useMemo(() => expenses.find(e => e.id === previewId) ?? null, [expenses, previewId]);

  async function markPaid(id: string) {
    const { error } = await supabase.from("expenses").update({
      status: "paid", paid_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Gemarkeerd als betaald");
    void load();
  }

  const filtered = useMemo(() => {
    return expenses.filter(e => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const blob = `${e.supplier} ${e.description ?? ""} ${e.reference ?? ""} ${e.category ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });
  }, [expenses, statusFilter, search]);

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
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle statussen</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="paid">Betaald</SelectItem>
              <SelectItem value="reimbursed">Vergoed</SelectItem>
              <SelectItem value="cancelled">Geannuleerd</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
                <div className="flex justify-between"><span>BTW ({form.vat_rate}%)</span><span className="tabular-nums">{EUR(vatCents)}</span></div>
                <div className="mt-1 flex justify-between border-t pt-1 font-semibold"><span>Totaal</span><span className="tabular-nums">{EUR(totalCents)}</span></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
              <Button onClick={saveExpense} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Opslaan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Leverancier</TableHead>
              <TableHead>Categorie</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Geboekt</TableHead>
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
              const posted = postedIds.has(e.id);
              return (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground">{e.expense_date}</TableCell>
                  <TableCell>
                    <div className="font-medium">{e.supplier}</div>
                    {e.description && <div className="text-xs text-muted-foreground">{e.description}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{e.category ?? "—"}</TableCell>
                  <TableCell><Badge variant={e.status === "paid" ? "default" : "outline"}>{STATUS_LABEL[e.status] ?? e.status}</Badge></TableCell>
                  <TableCell>
                    {posted ? <Badge variant="secondary" className="gap-1"><BookOpen className="h-3 w-3" /> Ja</Badge> : <Badge variant="outline">Nee</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{EUR(e.amount_cents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{EUR(e.vat_cents)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{EUR(e.total_cents)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {e.status !== "paid" && (
                        <Button variant="ghost" size="sm" title="Markeer als betaald" onClick={() => markPaid(e.id)}>
                          <Receipt className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {!posted && (
                        <Button variant="ghost" size="sm" title="Voorvertoning journaal" onClick={() => setPreviewId(e.id)}>
                          <BookOpen className="h-3.5 w-3.5" />
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
