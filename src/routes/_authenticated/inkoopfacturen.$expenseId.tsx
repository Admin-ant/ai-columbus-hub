import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  Paperclip,
  Pencil,
  Receipt,
  RefreshCw,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildExpensePdf,
  suggestExpenseFilename,
  type ExpenseJournalHistoryEntry,
} from "@/lib/expense-pdf";
import { loadTemplate } from "@/lib/pdf-template";

type Expense = Database["public"]["Tables"]["expenses"]["Row"];
type Attachment = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};
type JournalEntry = {
  id: string;
  description: string | null;
  reverses_entry_id: string | null;
  reversed_by_entry_id: string | null;
  created_at: string | null;
  entry_date: string | null;
};
type JournalLine = {
  id: string;
  entry_id: string;
  debit_cents: number;
  credit_cents: number;
  description: string | null;
  chart_of_accounts: { code: string; name: string } | null;
};

const EUR = (c: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(
    (c ?? 0) / 100,
  );

const PAY_STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  paid: { label: "Betaald", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  reimbursed: { label: "Vergoed", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  cancelled: { label: "Geannuleerd", cls: "bg-zinc-100 text-zinc-700 border-zinc-200" },
};

const JOURNAL_STATUS: Record<string, { label: string; cls: string }> = {
  not_posted: { label: "Niet geboekt", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  pending: { label: "In afwachting", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  posted: { label: "Geboekt", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  reversed: { label: "Teruggeboekt", cls: "bg-orange-100 text-orange-800 border-orange-200" },
  error: { label: "Fout", cls: "bg-red-100 text-red-800 border-red-200" },
};

export const Route = createFileRoute("/_authenticated/inkoopfacturen/$expenseId")({
  head: () => ({ meta: [{ title: "Inkoopfactuur" }] }),
  component: ExpenseDetailPage,
});

function ExpenseDetailPage() {
  const { expenseId } = Route.useParams();
  const { user } = useAuth();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [lines, setLines] = useState<JournalLine[]>([]);
  const [clientName, setClientName] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadName, setDownloadName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: exp, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", expenseId)
      .maybeSingle();
    if (error || !exp) {
      toast.error(error?.message ?? "Inkoopfactuur niet gevonden");
      setLoading(false);
      return;
    }
    setExpense(exp as Expense);

    const [{ data: atts }, { data: jes }, { data: cli }, { data: prj }, { data: org }] =
      await Promise.all([
        supabase
          .from("expense_attachments")
          .select("id,file_name,storage_path,mime_type,size_bytes,created_at")
          .eq("expense_id", expenseId)
          .order("created_at", { ascending: false }),
        supabase
          .from("journal_entries")
          .select("id,description,reverses_entry_id,reversed_by_entry_id,created_at,entry_date")
          .eq("expense_id", expenseId)
          .order("created_at", { ascending: true }),
        exp.client_id
          ? supabase.from("clients").select("name").eq("id", exp.client_id).maybeSingle()
          : Promise.resolve({ data: null }),
        exp.project_id
          ? supabase.from("projects").select("name").eq("id", exp.project_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("organizations").select("name").eq("id", exp.organization_id).maybeSingle(),
      ]);
    setAttachments((atts ?? []) as Attachment[]);
    const entryRows = (jes ?? []) as JournalEntry[];
    setEntries(entryRows);
    setClientName((cli as { name?: string } | null)?.name ?? null);
    setProjectName((prj as { name?: string } | null)?.name ?? null);
    setOrgName((org as { name?: string } | null)?.name ?? null);

    if (entryRows.length > 0) {
      const { data: ln } = await supabase
        .from("journal_lines")
        .select("id,entry_id,debit_cents,credit_cents,description,chart_of_accounts(code,name)")
        .in("entry_id", entryRows.map((e) => e.id));
      setLines((ln ?? []) as unknown as JournalLine[]);
    } else {
      setLines([]);
    }
    setLoading(false);
  }, [expenseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const history: ExpenseJournalHistoryEntry[] = useMemo(
    () =>
      entries.map((e) => ({
        id: e.id,
        created_at: e.created_at,
        description: e.description,
        is_reversal: !!e.reverses_entry_id,
        is_reversed: !!e.reversed_by_entry_id,
      })),
    [entries],
  );

  async function openAttachment(a: Attachment) {
    const { data, error } = await supabase.storage
      .from("expense-attachments")
      .createSignedUrl(a.storage_path, 60 * 5);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Kan bestand niet openen");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function openDownloadDialog() {
    if (!expense) return;
    setDownloadName(
      suggestExpenseFilename({
        expense_date: expense.expense_date,
        supplier: expense.supplier,
        reference: expense.reference,
      }),
    );
    setDownloadOpen(true);
  }

  function downloadPdf() {
    if (!expense) return;
    const tpl = loadTemplate(expense.organization_id, user?.id ?? null);
    const doc = buildExpensePdf(
      {
        id: expense.id,
        expense_date: expense.expense_date,
        supplier: expense.supplier,
        description: expense.description,
        category: expense.category,
        reference: expense.reference,
        payment_method: expense.payment_method,
        status: expense.status,
        journal_status: expense.journal_status,
        amount_cents: expense.amount_cents,
        vat_cents: expense.vat_cents,
        total_cents: expense.total_cents,
        vat_rate: expense.vat_rate ? Number(expense.vat_rate) : null,
        notes: expense.notes,
        paid_at: expense.paid_at,
        client_name: clientName,
        project_name: projectName,
        organization_name: orgName,
        history,
        attachment_names: attachments.map((a) => a.file_name),
      },
      tpl,
    );
    let name = downloadName.trim() || "inkoopfactuur.pdf";
    if (!/\.pdf$/i.test(name)) name += ".pdf";
    doc.save(name);
    setDownloadOpen(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
      </div>
    );
  }
  if (!expense) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-sm text-muted-foreground">Inkoopfactuur niet gevonden.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/inkoopfacturen">
            <ArrowLeft className="mr-2 h-4 w-4" /> Terug naar overzicht
          </Link>
        </Button>
      </div>
    );
  }

  const linesByEntry = new Map<string, JournalLine[]>();
  lines.forEach((l) => {
    const arr = linesByEntry.get(l.entry_id) ?? [];
    arr.push(l);
    linesByEntry.set(l.entry_id, arr);
  });

  const payStatus = PAY_STATUS[expense.status] ?? PAY_STATUS.open;
  const jStatus =
    JOURNAL_STATUS[expense.journal_status ?? "not_posted"] ?? JOURNAL_STATUS.not_posted;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/inkoopfacturen">
              <ArrowLeft className="mr-1 h-4 w-4" /> Overzicht
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Inkoopfactuur — {expense.supplier}
            </h1>
            <p className="text-sm text-muted-foreground">
              {expense.expense_date}
              {expense.reference ? ` · Factuurnr. ${expense.reference}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openDownloadDialog}>
            <Download className="mr-2 h-4 w-4" /> PDF downloaden
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Bedragen
          </div>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Excl. BTW</dt>
              <dd className="tabular-nums">{EUR(expense.amount_cents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>BTW ({expense.vat_rate ?? 21}%)</dt>
              <dd className="tabular-nums">{EUR(expense.vat_cents)}</dd>
            </div>
            <div className="flex justify-between border-t pt-1 font-semibold">
              <dt>Totaal</dt>
              <dd className="tabular-nums">{EUR(expense.total_cents)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div>
          <div className="mt-2 flex flex-col gap-2">
            <Badge variant="outline" className={payStatus.cls}>
              Betaalstatus: {payStatus.label}
            </Badge>
            <Badge variant="outline" className={jStatus.cls}>
              Boeking: {jStatus.label}
            </Badge>
            {expense.paid_at && (
              <span className="text-xs text-muted-foreground">
                Betaald op {new Date(expense.paid_at).toLocaleDateString("nl-NL")}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Metadata
          </div>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Categorie</dt>
              <dd className="text-right">{expense.category ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Betaalwijze</dt>
              <dd className="text-right">{expense.payment_method ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Klant</dt>
              <dd className="text-right">{clientName ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Project</dt>
              <dd className="text-right">{projectName ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </div>

      {expense.description && (
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Omschrijving
          </div>
          <p className="mt-1 text-sm">{expense.description}</p>
        </div>
      )}
      {expense.notes && (
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Notitie</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {expense.notes}
          </p>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Factuurregels & BTW</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Uitgaven kennen één regel; splits eventueel op via meerdere invoices.
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Omschrijving</TableHead>
              <TableHead className="text-right">BTW</TableHead>
              <TableHead className="text-right">Excl.</TableHead>
              <TableHead className="text-right">BTW-bedrag</TableHead>
              <TableHead className="text-right">Totaal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>
                {expense.description || expense.category || expense.supplier}
              </TableCell>
              <TableCell className="text-right">{expense.vat_rate ?? 21}%</TableCell>
              <TableCell className="text-right tabular-nums">
                {EUR(expense.amount_cents)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {EUR(expense.vat_cents)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {EUR(expense.total_cents)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">
              Doorboekingsgeschiedenis ({entries.length})
            </h2>
          </div>
        </div>
        {entries.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Deze inkoopfactuur is nog niet in het journaal geboekt.
          </div>
        ) : (
          <div className="divide-y">
            {entries.map((e) => {
              const entryLines = linesByEntry.get(e.id) ?? [];
              const debit = entryLines.reduce((s, l) => s + l.debit_cents, 0);
              const credit = entryLines.reduce((s, l) => s + l.credit_cents, 0);
              const type = e.reverses_entry_id
                ? { label: "Terugboeking", icon: Undo2, cls: "text-orange-600" }
                : e.reversed_by_entry_id
                  ? { label: "Origineel (teruggeboekt)", icon: BookOpen, cls: "text-muted-foreground" }
                  : { label: "Boeking", icon: BookOpen, cls: "text-emerald-600" };
              const Icon = type.icon;
              return (
                <div key={e.id} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${type.cls}`} />
                      <span className="text-sm font-medium">{type.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {e.entry_date ?? (e.created_at ? new Date(e.created_at).toLocaleDateString("nl-NL") : "—")}
                        {e.created_at && ` · aangemaakt ${new Date(e.created_at).toLocaleString("nl-NL")}`}
                      </span>
                    </div>
                    <Link
                      to="/boekhouding/journal/$entryId"
                      params={{ entryId: e.id }}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Open journaalpost
                    </Link>
                  </div>
                  {e.description && (
                    <p className="text-xs text-muted-foreground">{e.description}</p>
                  )}
                  {entryLines.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Rek.</TableHead>
                          <TableHead>Naam</TableHead>
                          <TableHead>Omschrijving</TableHead>
                          <TableHead className="text-right">Debet</TableHead>
                          <TableHead className="text-right">Credit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entryLines.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="font-mono text-xs">
                              {l.chart_of_accounts?.code ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {l.chart_of_accounts?.name ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {l.description ?? "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {l.debit_cents > 0 ? EUR(l.debit_cents) : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {l.credit_cents > 0 ? EUR(l.credit_cents) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t font-semibold">
                          <TableCell colSpan={3}>Totaal</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {EUR(debit)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {EUR(credit)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Bijlagen ({attachments.length})</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Uploaden en beheren gaat via de knop <em>Bijlagen</em> in het overzicht.
          </span>
        </div>
        {attachments.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Geen bijlagen bij deze inkoopfactuur.
          </div>
        ) : (
          <ul className="divide-y">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <button
                  onClick={() => void openAttachment(a)}
                  className="flex-1 truncate text-left text-sm font-medium text-primary hover:underline"
                >
                  {a.file_name}
                </button>
                <span className="text-xs text-muted-foreground">
                  {a.size_bytes ? `${(a.size_bytes / 1024).toFixed(0)} KB` : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleDateString("nl-NL")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={downloadOpen} onOpenChange={setDownloadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>PDF downloaden</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Bestandsnaam</Label>
            <Input
              value={downloadName}
              onChange={(e) => setDownloadName(e.target.value)}
              placeholder="inkoopfactuur.pdf"
            />
            <p className="text-xs text-muted-foreground">
              De PDF bevat leverancier, bedragen, BTW-uitsplitsing en de
              doorboekingsgeschiedenis met journaalverwijzingen.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDownloadOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={downloadPdf}>
              <Download className="mr-2 h-4 w-4" /> Downloaden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
