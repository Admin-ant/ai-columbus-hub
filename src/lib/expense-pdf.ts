import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { THEMES, type PdfTemplate } from "./pdf-template";

export interface ExpenseJournalHistoryEntry {
  id: string;
  created_at: string | null;
  description: string | null;
  is_reversal: boolean;
  is_reversed: boolean;
}

export interface ExpensePdfData {
  id: string;
  expense_date: string;
  supplier: string;
  description: string | null;
  category: string | null;
  reference: string | null;
  payment_method: string | null;
  status: string;
  journal_status: string | null;
  amount_cents: number;
  vat_cents: number;
  total_cents: number;
  vat_rate: number | null;
  notes: string | null;
  paid_at: string | null;
  client_name?: string | null;
  project_name?: string | null;
  organization_name?: string | null;
  history?: ExpenseJournalHistoryEntry[];
  attachment_names?: string[];
}

const fmtCents = (c: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(
    (c ?? 0) / 100,
  );

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("nl-NL") : "—";

const PAY_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  paid: "Betaald",
  reimbursed: "Vergoed",
  cancelled: "Geannuleerd",
};

const JOURNAL_STATUS_LABEL: Record<string, string> = {
  not_posted: "Niet geboekt",
  pending: "In afwachting",
  posted: "Geboekt",
  reversed: "Teruggeboekt",
  error: "Fout",
};

function drawHeader(doc: jsPDF, tpl: PdfTemplate, title: string, subtitle?: string) {
  const theme = THEMES[tpl.theme];
  const pageW = doc.internal.pageSize.getWidth();
  if (tpl.logoDataUrl) {
    try {
      const mime = tpl.logoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      doc.addImage(tpl.logoDataUrl, mime, pageW - 40 - 80, 32, 80, 40, undefined, "FAST");
    } catch {
      /* ignore */
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(theme.head[0], theme.head[1], theme.head[2]);
  doc.text(title, 40, 60);
  doc.setDrawColor(theme.accent[0], theme.accent[1], theme.accent[2]);
  doc.setLineWidth(1.2);
  doc.line(40, 66, 200, 66);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text(subtitle, 40, 82);
  }
}

function drawFooter(doc: jsPDF, tpl: PdfTemplate) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (tpl.footerText) {
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text(tpl.footerText, pageW / 2, pageH - 24, { align: "center" });
    }
    if (tpl.showPageNumbers) {
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 160);
      doc.text(`${i} / ${pages}`, pageW - 40, pageH - 24, { align: "right" });
    }
  }
}

/**
 * Bouwt een PDF voor één inkoopfactuur (uitgave) op basis van het gedeelde
 * PDF-template. Inclusief BTW-uitsplitsing, journaal-historie en bijlagen-lijst.
 */
export function buildExpensePdf(expense: ExpensePdfData, tpl: PdfTemplate): jsPDF {
  const theme = THEMES[tpl.theme];
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  drawHeader(
    doc,
    tpl,
    "Inkoopfactuur",
    expense.organization_name ?? undefined,
  );

  let y = 110;

  // Leverancier + factuur meta
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text(expense.supplier, 40, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  y += 14;
  if (expense.description) {
    doc.text(expense.description, 40, y, { maxWidth: pageW / 2 - 40 });
    y += 14;
  }
  if (expense.category) {
    doc.text(`Categorie: ${expense.category}`, 40, y);
    y += 12;
  }
  if (expense.client_name) {
    doc.text(`Klant: ${expense.client_name}`, 40, y);
    y += 12;
  }
  if (expense.project_name) {
    doc.text(`Project: ${expense.project_name}`, 40, y);
    y += 12;
  }

  // Meta rechts
  const metaX = pageW - 40;
  const metaLabelX = metaX - 220;
  let my = 110;
  const meta: Array<[string, string]> = [
    ["Factuurdatum", fmtDate(expense.expense_date)],
    ["Factuurnr. lev.", expense.reference ?? "—"],
    ["Betaalstatus", PAY_STATUS_LABEL[expense.status] ?? expense.status],
    ["Boekingsstatus", JOURNAL_STATUS_LABEL[expense.journal_status ?? "not_posted"] ?? "—"],
    ["Betaald op", fmtDate(expense.paid_at)],
    ["Betaalwijze", expense.payment_method ?? "—"],
    ["ID", expense.id],
  ];
  meta.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.text(k, metaLabelX, my);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 20, 20);
    doc.text(String(v), metaX, my, { align: "right" });
    my += 13;
  });

  y = Math.max(y, my) + 14;

  // Bedragen tabel
  autoTable(doc, {
    startY: y,
    head: [["Omschrijving", "BTW", "Excl. BTW", "BTW-bedrag", "Totaal"]],
    body: [
      [
        expense.description || expense.category || expense.supplier,
        `${expense.vat_rate ?? 21}%`,
        fmtCents(expense.amount_cents),
        fmtCents(expense.vat_cents),
        fmtCents(expense.total_cents),
      ],
    ],
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: theme.head, textColor: 255 },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
    margin: { left: 40, right: 40 },
  });

  const afterTable =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  let ty = afterTable + 14;

  // Totalen rechts
  const totalsX = pageW - 40;
  const labelX = totalsX - 180;
  doc.setFontSize(10);
  const rows: Array<[string, string, boolean]> = [
    ["Subtotaal", fmtCents(expense.amount_cents), false],
    ["BTW", fmtCents(expense.vat_cents), false],
    ["Totaal te betalen", fmtCents(expense.total_cents), true],
  ];
  rows.forEach(([label, val, bold]) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    if (bold) {
      doc.setTextColor(theme.head[0], theme.head[1], theme.head[2]);
      doc.setFontSize(12);
    } else {
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(10);
    }
    doc.text(label, labelX, ty);
    doc.text(val, totalsX, ty, { align: "right" });
    ty += bold ? 18 : 14;
  });

  ty += 6;

  // Journaal-historie
  if (expense.history && expense.history.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text("Doorboekingsgeschiedenis", 40, ty);
    ty += 6;
    autoTable(doc, {
      startY: ty,
      head: [["Datum", "Type", "Omschrijving", "Journaal-ID"]],
      body: expense.history.map((h) => [
        fmtDate(h.created_at),
        h.is_reversal ? "Terugboeking" : h.is_reversed ? "Origineel (teruggeboekt)" : "Boeking",
        h.description ?? "—",
        h.id,
      ]),
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: theme.head, textColor: 255 },
      margin: { left: 40, right: 40 },
    });
    ty =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
      ty;
    ty += 12;
  }

  // Bijlagen
  if (expense.attachment_names && expense.attachment_names.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text("Bijlagen", 40, ty);
    ty += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    expense.attachment_names.forEach((n) => {
      doc.text(`• ${n}`, 48, ty);
      ty += 12;
    });
  }

  if (expense.notes) {
    ty += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Notitie", 40, ty);
    ty += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(expense.notes, 40, ty, { maxWidth: pageW - 80 });
  }

  drawFooter(doc, tpl);
  return doc;
}

/**
 * Bouwt één PDF met meerdere inkoopfacturen als periodedump.
 * Bevat een samenvattingspagina en per uitgave één pagina.
 */
export function buildExpensesPeriodPdf(
  expenses: ExpensePdfData[],
  tpl: PdfTemplate,
  period: { from?: string | null; to?: string | null; label?: string | null },
): jsPDF {
  const theme = THEMES[tpl.theme];
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  const periodLabel =
    period.label ??
    `${period.from ? fmtDate(period.from) : "begin"} — ${period.to ? fmtDate(period.to) : "nu"}`;
  drawHeader(doc, tpl, "Inkoopfacturen — periode", periodLabel);

  const totalExcl = expenses.reduce((s, e) => s + (e.amount_cents ?? 0), 0);
  const totalVat = expenses.reduce((s, e) => s + (e.vat_cents ?? 0), 0);
  const totalIncl = expenses.reduce((s, e) => s + (e.total_cents ?? 0), 0);
  const totalOpen = expenses
    .filter((e) => e.status === "open")
    .reduce((s, e) => s + (e.total_cents ?? 0), 0);
  const totalPaid = expenses
    .filter((e) => e.status === "paid")
    .reduce((s, e) => s + (e.total_cents ?? 0), 0);

  autoTable(doc, {
    startY: 110,
    head: [["Aantal", "Excl. BTW", "BTW", "Totaal", "Openstaand", "Betaald"]],
    body: [
      [
        String(expenses.length),
        fmtCents(totalExcl),
        fmtCents(totalVat),
        fmtCents(totalIncl),
        fmtCents(totalOpen),
        fmtCents(totalPaid),
      ],
    ],
    styles: { fontSize: 10, cellPadding: 6, halign: "right" },
    headStyles: { fillColor: theme.head, textColor: 255, halign: "right" },
    columnStyles: { 0: { halign: "left" } },
    margin: { left: 40, right: 40 },
  });

  let y =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
      120) + 18;

  autoTable(doc, {
    startY: y,
    head: [["Datum", "Leverancier", "Factuurnr.", "Status", "Excl.", "BTW", "Totaal"]],
    body: expenses.map((e) => [
      fmtDate(e.expense_date),
      e.supplier,
      e.reference ?? "—",
      PAY_STATUS_LABEL[e.status] ?? e.status,
      fmtCents(e.amount_cents),
      fmtCents(e.vat_cents),
      fmtCents(e.total_cents),
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: theme.head, textColor: 255 },
    columnStyles: {
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
    margin: { left: 40, right: 40 },
  });

  y =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
      y) + 12;
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(`Gegenereerd ${new Date().toLocaleString("nl-NL")}`, 40, y);

  // Detailpagina's
  expenses.forEach((e) => {
    doc.addPage();
    drawHeader(doc, tpl, `Inkoopfactuur — ${e.supplier}`, e.reference ?? undefined);

    let dy = 110;
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const rows: Array<[string, string]> = [
      ["Datum", fmtDate(e.expense_date)],
      ["Categorie", e.category ?? "—"],
      ["Betaalstatus", PAY_STATUS_LABEL[e.status] ?? e.status],
      ["Boekingsstatus", JOURNAL_STATUS_LABEL[e.journal_status ?? "not_posted"] ?? "—"],
      ["Excl. BTW", fmtCents(e.amount_cents)],
      ["BTW", fmtCents(e.vat_cents)],
      ["Totaal", fmtCents(e.total_cents)],
    ];
    rows.forEach(([k, v]) => {
      doc.setFont("helvetica", "bold");
      doc.text(k, 40, dy);
      doc.setFont("helvetica", "normal");
      doc.text(v, 180, dy);
      dy += 13;
    });
    if (e.description) {
      dy += 6;
      doc.setFont("helvetica", "italic");
      doc.text(e.description, 40, dy, { maxWidth: pageW - 80 });
    }
  });

  drawFooter(doc, tpl);
  return doc;
}

export function suggestExpenseFilename(e: {
  expense_date: string;
  supplier: string;
  reference: string | null;
}) {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const parts = ["inkoopfactuur", e.expense_date, slug(e.supplier)];
  if (e.reference) parts.push(slug(e.reference));
  return parts.filter(Boolean).join("-") + ".pdf";
}
