import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Loader2, FileText, Receipt, ScrollText, Download, Eye, EyeOff, History, Paperclip } from "lucide-react";


import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PdfTemplateDialog } from "@/components/pdf-template-dialog";
import { loadTemplate, type PdfTemplate } from "@/lib/pdf-template";
import { buildJournalPdf, journalPdfBlobUrl, type JournalPdfData } from "@/lib/journal-pdf";


import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/boekhouding/journal/$entryId")({
  head: () => ({ meta: [{ title: "Journaalpost" }] }),
  component: JournalDetailPage,
});

interface LineRow {
  id: string;
  debit_cents: number;
  credit_cents: number;
  description: string | null;
  chart_of_accounts: { code: string; name: string; type: string } | null;
}

interface EntryDetail {
  id: string;
  entry_date: string;
  description: string;
  source: string | null;
  organization_id: string;
  invoice_id: string | null;
  quote_id: string | null;
  expense_id: string | null;
  created_at: string;
  invoices: {
    id: string;
    invoice_number: string;
    client_name: string | null;
    status: string;
    subtotal_cents: number;
    vat_cents: number;
    total_cents: number;
    issue_date: string;
    due_date: string;
    quote_id: string | null;
  } | null;
  quotes: {
    id: string;
    quote_number: string;
    client_name: string | null;
    status: string;
    total_cents: number | null;
  } | null;
  journal_lines: LineRow[];
}

interface AttachmentRow {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

interface ExportLogRow {
  id: string;
  file_name: string;
  file_size_bytes: number | null;
  template_theme: string | null;
  exported_at: string;
  exported_by: string | null;
  profiles: { display_name: string | null; email: string | null } | null;
}

const centsFmt = (cents: number, lang: string) =>
  new Intl.NumberFormat(lang === "en" ? "en-IE" : "nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format((cents ?? 0) / 100);

function JournalDetailPage() {
  const { entryId } = Route.useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "nl";
  const navigate = useNavigate();
  const { user } = useAuth();
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tpl, setTpl] = useState<PdfTemplate | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const lastUrlRef = useRef<string | null>(null);
  const [history, setHistory] = useState<ExportLogRow[]>([]);

  const loadHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from("journal_export_log")
      .select("id, file_name, file_size_bytes, template_theme, exported_at, exported_by, profiles:exported_by(display_name, email)")
      .eq("journal_entry_id", entryId)
      .order("exported_at", { ascending: false })
      .limit(20);
    if (!error) setHistory((data as unknown as ExportLogRow[]) ?? []);
  }, [entryId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("journal_entries")
        .select(
          `id, entry_date, description, source, organization_id, invoice_id, quote_id, created_at,
           invoices(id, invoice_number, client_name, status, subtotal_cents, vat_cents, total_cents, issue_date, due_date, quote_id),
           quotes(id, quote_number, client_name, status, total_cents),
           journal_lines(id, debit_cents, credit_cents, description,
             chart_of_accounts(code, name, type))`,
        )
        .eq("id", entryId)
        .maybeSingle();
      if (cancelled) return;
      if (error) toast.error(error.message);
      setEntry((data as unknown as EntryDetail) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  const pdfData: JournalPdfData | null = useMemo(() => {
    if (!entry) return null;
    return {
      id: entry.id,
      entry_date: entry.entry_date,
      description: entry.description,
      source: entry.source,
      journal_lines: entry.journal_lines.map((l) => ({
        debit_cents: l.debit_cents,
        credit_cents: l.credit_cents,
        description: l.description,
        chart_of_accounts: l.chart_of_accounts
          ? { code: l.chart_of_accounts.code, name: l.chart_of_accounts.name }
          : null,
      })),
      invoice: entry.invoices
        ? {
            invoice_number: entry.invoices.invoice_number,
            client_name: entry.invoices.client_name,
            status: entry.invoices.status,
            subtotal_cents: entry.invoices.subtotal_cents,
            vat_cents: entry.invoices.vat_cents,
            total_cents: entry.invoices.total_cents,
          }
        : null,
      quote: entry.quotes
        ? {
            quote_number: entry.quotes.quote_number,
            client_name: entry.quotes.client_name,
            status: entry.quotes.status,
          }
        : null,
    };
  }, [entry]);

  useEffect(() => {
    if (entry) setTpl(loadTemplate(entry.organization_id, user?.id ?? null));
  }, [entry, user?.id]);

  // Concept-PDF preview blob URL — regenerates when template or data changes.
  useEffect(() => {
    if (!showPreview || !pdfData || !tpl) return;
    const handle = setTimeout(() => {
      try {
        const url = journalPdfBlobUrl(pdfData, tpl, lang);
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = url;
        setPreviewUrl(url);
      } catch {
        setPreviewUrl(null);
      }
    }, 150);
    return () => clearTimeout(handle);
  }, [showPreview, pdfData, tpl, lang]);

  useEffect(() => {
    return () => {
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    };
  }, []);



  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("common.loading")}
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/boekhouding" })}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> {t("common.back") ?? "Terug"}
        </Button>
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Journaalpost niet gevonden.
        </div>
      </div>
    );
  }

  const totalDebit = entry.journal_lines.reduce((s, l) => s + l.debit_cents, 0);
  const totalCredit = entry.journal_lines.reduce((s, l) => s + l.credit_cents, 0);
  const balanced = totalDebit === totalCredit;
  const sourceQuote = entry.quotes ?? null;
  const sourceInvoice = entry.invoices ?? null;

  async function exportPdf() {
    if (!pdfData) return;
    const effective = tpl ?? loadTemplate(entry!.organization_id, user?.id ?? null);
    const doc = buildJournalPdf(pdfData, effective, lang);
    const ref = sourceInvoice?.invoice_number ?? entry!.id.slice(0, 8);
    const fileName = `journaalpost-${ref}.pdf`;
    doc.save(fileName);

    try {
      const blob = doc.output("blob") as Blob;
      const { error } = await supabase.from("journal_export_log").insert({
        organization_id: entry!.organization_id,
        journal_entry_id: entry!.id,
        exported_by: user?.id ?? null,
        file_name: fileName,
        file_size_bytes: blob.size,
        template_theme: effective.theme,
      });
      if (error) throw error;
      void loadHistory();
    } catch (e) {
      console.warn("export log failed", e);
    }
  }

  function buildPreviewUrl(t: PdfTemplate): string | null {
    if (!pdfData) return null;
    return journalPdfBlobUrl(pdfData, t, lang);
  }




  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/boekhouding">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Boekhouding
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Badge
            variant={balanced ? "outline" : "destructive"}
            className={balanced ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : ""}
          >
            {balanced ? "In balans" : "Niet in balans"}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
            {showPreview ? "Preview verbergen" : "Concept-PDF"}
          </Button>
          <PdfTemplateDialog
            orgId={entry.organization_id}
            buildPreviewUrl={buildPreviewUrl}
            onChange={(t) => setTpl(t)}
          />
          <Button size="sm" onClick={exportPdf}>
            <Download className="mr-1.5 h-4 w-4" /> Exporteer PDF
          </Button>

        </div>
      </div>


      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <ScrollText className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{entry.description}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                Datum: <span className="font-medium text-foreground">{new Date(entry.entry_date).toLocaleDateString(lang)}</span>
              </span>
              <span>
                Bron: <Badge variant="outline" className="ml-1 capitalize">{entry.source ?? "—"}</Badge>
              </span>
              <span className="font-mono text-[11px]">#{entry.id.slice(0, 8)}</span>
            </div>
          </div>
        </div>
      </div>

      {showPreview && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2 text-sm font-medium">
            <span>Concept-PDF preview</span>
            <span className="text-xs text-muted-foreground">Wijzig de template om live te zien hoe de export eruit ziet.</span>
          </div>
          <div className="h-[640px] bg-muted/10">
            {previewUrl ? (
              <iframe key={previewUrl} src={previewUrl} title="Concept PDF" className="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preview wordt gegenereerd…
              </div>
            )}
          </div>
        </div>
      )}

      {(sourceInvoice || sourceQuote) && (
        <div className="grid gap-4 md:grid-cols-2">
          {sourceInvoice && (
            <div className="rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Receipt className="h-4 w-4 text-muted-foreground" /> Factuur
                </div>
                <Badge variant="outline" className="capitalize">{sourceInvoice.status}</Badge>
              </div>
              <div className="space-y-2 px-4 py-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nummer</span>
                  <span className="font-mono">{sourceInvoice.invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Klant</span>
                  <span className="font-medium">{sourceInvoice.client_name ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Factuurdatum</span>
                  <span>{new Date(sourceInvoice.issue_date).toLocaleDateString(lang)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vervaldatum</span>
                  <span>{new Date(sourceInvoice.due_date).toLocaleDateString(lang)}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-muted-foreground">Subtotaal</span>
                  <span className="tabular-nums">{centsFmt(sourceInvoice.subtotal_cents, lang)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">BTW</span>
                  <span className="tabular-nums">{centsFmt(sourceInvoice.vat_cents, lang)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Totaal</span>
                  <span className="tabular-nums">{centsFmt(sourceInvoice.total_cents, lang)}</span>
                </div>
              </div>
            </div>
          )}

          {sourceQuote && (
            <div className="rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-muted-foreground" /> Bronofferte
                </div>
                <Badge variant="outline" className="capitalize">{sourceQuote.status}</Badge>
              </div>
              <div className="space-y-2 px-4 py-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nummer</span>
                  <span className="font-mono">{sourceQuote.quote_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Klant</span>
                  <span className="font-medium">{sourceQuote.client_name ?? "—"}</span>
                </div>
                {sourceQuote.total_cents != null && (
                  <div className="flex justify-between border-t pt-2 font-semibold">
                    <span>Totaal</span>
                    <span className="tabular-nums">{centsFmt(sourceQuote.total_cents, lang)}</span>
                  </div>
                )}
                <div className="pt-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/quotes">Open offerte</Link>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-2.5 text-sm font-semibold">Boekregels</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Rekening</TableHead>
              <TableHead>Omschrijving</TableHead>
              <TableHead className="text-right">Debet</TableHead>
              <TableHead className="text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entry.journal_lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-mono text-sm">{l.chart_of_accounts?.code ?? "—"}</TableCell>
                <TableCell className="font-medium">{l.chart_of_accounts?.name ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{l.description ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.debit_cents > 0 ? centsFmt(l.debit_cents, lang) : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.credit_cents > 0 ? centsFmt(l.credit_cents, lang) : ""}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2 font-semibold">
              <TableCell colSpan={3}>Totaal</TableCell>
              <TableCell className="text-right tabular-nums">{centsFmt(totalDebit, lang)}</TableCell>
              <TableCell className="text-right tabular-nums">{centsFmt(totalCredit, lang)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-2.5 text-sm font-semibold">
          <span className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" /> Exporthistorie
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {history.length === 0 ? "Nog geen downloads" : `${history.length} export${history.length === 1 ? "" : "s"}`}
          </span>
        </div>
        {history.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            Zodra je deze journaalpost exporteert, verschijnt hier wie wanneer welke PDF heeft gedownload.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Gebruiker</TableHead>
                <TableHead>Bestand</TableHead>
                <TableHead>Thema</TableHead>
                <TableHead className="text-right">Grootte</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="text-sm">{new Date(h.exported_at).toLocaleString(lang)}</TableCell>
                  <TableCell className="text-sm">
                    {h.profiles?.display_name ?? h.profiles?.email ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{h.file_name}</TableCell>
                  <TableCell className="text-sm capitalize">{h.template_theme ?? "—"}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                    {h.file_size_bytes ? `${(h.file_size_bytes / 1024).toFixed(1)} KB` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
