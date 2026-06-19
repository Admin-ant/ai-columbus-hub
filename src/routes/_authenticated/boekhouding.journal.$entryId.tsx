import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Loader2, FileText, Receipt, ScrollText, Download, Eye, EyeOff } from "lucide-react";


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

  function exportPdf() {
    const tpl: PdfTemplate = loadTemplate(entry!.organization_id);
    const theme = THEMES[tpl.theme];
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const fmt = (c: number) => centsFmt(c, lang);
    let y = 48;

    if (tpl.logoDataUrl) {
      try {
        const mime = tpl.logoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
        doc.addImage(tpl.logoDataUrl, mime, pageW - 40 - 80, 32, 80, 40, undefined, "FAST");
      } catch {
        /* ignore */
      }
    }

    doc.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
    doc.rect(40, y - 14, 3, 22, "F");
    doc.setTextColor(theme.head[0], theme.head[1], theme.head[2]);
    doc.setFontSize(18);
    doc.text(tpl.title || "Journaalpost", 50, y);
    y += 22;

    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(entry!.description, 40, y);
    y += 14;
    doc.text(`Datum: ${new Date(entry!.entry_date).toLocaleDateString(lang)}`, 40, y);
    y += 12;
    doc.text(`Bron: ${entry!.source ?? "—"}`, 40, y);
    y += 12;
    doc.text(`ID: ${entry!.id}`, 40, y);
    y += 18;

    if (sourceInvoice) {
      doc.setTextColor(0);
      doc.setFontSize(11);
      doc.text("Bronfactuur", 40, y);
      y += 14;
      doc.setFontSize(9);
      doc.setTextColor(60);
      doc.text(
        `${sourceInvoice.invoice_number} — ${sourceInvoice.client_name ?? "—"} — status: ${sourceInvoice.status}`,
        40,
        y,
      );
      y += 12;
      doc.text(
        `Subtotaal ${fmt(sourceInvoice.subtotal_cents)} · BTW ${fmt(sourceInvoice.vat_cents)} · Totaal ${fmt(sourceInvoice.total_cents)}`,
        40,
        y,
      );
      y += 16;
    }
    if (sourceQuote) {
      doc.setTextColor(0);
      doc.setFontSize(11);
      doc.text("Bronofferte", 40, y);
      y += 14;
      doc.setFontSize(9);
      doc.setTextColor(60);
      doc.text(
        `${sourceQuote.quote_number} — ${sourceQuote.client_name ?? "—"} — status: ${sourceQuote.status}`,
        40,
        y,
      );
      y += 16;
    }

    autoTable(doc, {
      startY: y + 6,
      head: [["Code", "Rekening", "Omschrijving", "Debet", "Credit"]],
      body: entry!.journal_lines.map((l) => [
        l.chart_of_accounts?.code ?? "—",
        l.chart_of_accounts?.name ?? "—",
        l.description ?? "—",
        l.debit_cents > 0 ? fmt(l.debit_cents) : "",
        l.credit_cents > 0 ? fmt(l.credit_cents) : "",
      ]),
      foot: [["", "", "Totaal", fmt(totalDebit), fmt(totalCredit)]],
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: theme.head, textColor: 255 },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 50 },
        3: { halign: "right" },
        4: { halign: "right" },
      },
      margin: { bottom: 60 },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    doc.setFontSize(9);
    doc.setTextColor(balanced ? 16 : 180, balanced ? 122 : 30, balanced ? 87 : 30);
    doc.text(
      balanced ? "✓ Journaalpost in balans" : "✗ Journaalpost NIET in balans",
      40,
      finalY + 24,
    );

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(theme.accent[0], theme.accent[1], theme.accent[2]);
      doc.setLineWidth(0.5);
      doc.line(40, pageH - 36, pageW - 40, pageH - 36);
      doc.setFontSize(8);
      doc.setTextColor(120);
      if (tpl.footerText) doc.text(tpl.footerText, 40, pageH - 22);
      if (tpl.showPageNumbers) {
        doc.text(`Pagina ${i} van ${pages}`, pageW - 40, pageH - 22, { align: "right" });
      }
    }

    const ref = sourceInvoice?.invoice_number ?? entry!.id.slice(0, 8);
    doc.save(`journaalpost-${ref}.pdf`);
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
          <PdfTemplateDialog orgId={entry.organization_id} />
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
    </div>
  );
}
