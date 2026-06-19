import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { THEMES, type PdfTemplate } from "./pdf-template";

export interface JournalPdfLine {
  debit_cents: number;
  credit_cents: number;
  description: string | null;
  chart_of_accounts: { code: string; name: string } | null;
}

export interface JournalPdfData {
  id: string;
  entry_date: string;
  description: string;
  source: string | null;
  journal_lines: JournalPdfLine[];
  invoice?: {
    invoice_number: string;
    client_name: string | null;
    status: string;
    subtotal_cents: number;
    vat_cents: number;
    total_cents: number;
  } | null;
  quote?: {
    quote_number: string;
    client_name: string | null;
    status: string;
  } | null;
}

const fmtCents = (c: number, lang: string) =>
  new Intl.NumberFormat(lang === "en" ? "en-IE" : "nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format((c ?? 0) / 100);

export function buildJournalPdf(
  entry: JournalPdfData,
  tpl: PdfTemplate,
  lang: string,
): jsPDF {
  const theme = THEMES[tpl.theme];
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const fmt = (c: number) => fmtCents(c, lang);
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
  doc.text(entry.description, 40, y);
  y += 14;
  doc.text(`Datum: ${new Date(entry.entry_date).toLocaleDateString(lang)}`, 40, y);
  y += 12;
  doc.text(`Bron: ${entry.source ?? "—"}`, 40, y);
  y += 12;
  doc.text(`ID: ${entry.id}`, 40, y);
  y += 18;

  if (entry.invoice) {
    doc.setTextColor(0);
    doc.setFontSize(11);
    doc.text("Bronfactuur", 40, y);
    y += 14;
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(
      `${entry.invoice.invoice_number} — ${entry.invoice.client_name ?? "—"} — status: ${entry.invoice.status}`,
      40,
      y,
    );
    y += 12;
    doc.text(
      `Subtotaal ${fmt(entry.invoice.subtotal_cents)} · BTW ${fmt(entry.invoice.vat_cents)} · Totaal ${fmt(entry.invoice.total_cents)}`,
      40,
      y,
    );
    y += 16;
  }
  if (entry.quote) {
    doc.setTextColor(0);
    doc.setFontSize(11);
    doc.text("Bronofferte", 40, y);
    y += 14;
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(
      `${entry.quote.quote_number} — ${entry.quote.client_name ?? "—"} — status: ${entry.quote.status}`,
      40,
      y,
    );
    y += 16;
  }

  const totalDebit = entry.journal_lines.reduce((s, l) => s + l.debit_cents, 0);
  const totalCredit = entry.journal_lines.reduce((s, l) => s + l.credit_cents, 0);
  const balanced = totalDebit === totalCredit;

  autoTable(doc, {
    startY: y + 6,
    head: [["Code", "Rekening", "Omschrijving", "Debet", "Credit"]],
    body: entry.journal_lines.map((l) => [
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

  return doc;
}

export function journalPdfBlobUrl(entry: JournalPdfData, tpl: PdfTemplate, lang: string): string {
  const doc = buildJournalPdf(entry, tpl, lang);
  const blob = doc.output("blob");
  return URL.createObjectURL(blob);
}
