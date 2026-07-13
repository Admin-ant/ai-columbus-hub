import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { THEMES, type PdfTemplate } from "./pdf-template";

export interface InvoicePdfLine {
  description: string;
  quantity: number;
  unit_price_cents: number;
  vat_rate: number;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
}

export interface InvoicePdfData {
  invoice_number: string;
  issue_date: string;
  due_date: string;
  currency: string;
  client_name: string | null;
  client_email?: string | null;
  client_address?: string | null;
  organization_name?: string | null;
  organization_address?: string | null;
  organization_email?: string | null;
  organization_kvk?: string | null;
  organization_vat?: string | null;
  organization_iban?: string | null;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  status: string;
  paid_at?: string | null;
  notes?: string | null;
  lines: InvoicePdfLine[];
}

const fmtCents = (c: number, lang: string) =>
  new Intl.NumberFormat(lang === "en" ? "en-IE" : "nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format((c ?? 0) / 100);

const fmtDate = (iso: string, lang: string) =>
  new Date(iso).toLocaleDateString(lang === "en" ? "en-IE" : "nl-NL");

export function buildInvoicePdf(
  inv: InvoicePdfData,
  tpl: PdfTemplate,
  lang: string,
): jsPDF {
  const theme = THEMES[tpl.theme];
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const fmt = (c: number) => fmtCents(c, lang);
  let y = 48;

  // Logo (top-right)
  if (tpl.logoDataUrl) {
    try {
      const mime = tpl.logoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      doc.addImage(tpl.logoDataUrl, mime, pageW - 40 - 80, 32, 80, 40, undefined, "FAST");
    } catch {
      /* ignore */
    }
  }

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...theme.head);
  doc.text(lang === "en" ? "Invoice" : "Factuur", 40, y);
  y += 6;
  doc.setDrawColor(...theme.accent);
  doc.setLineWidth(1.2);
  doc.line(40, y, 180, y);
  y += 18;

  // Sender + meta block
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.text(inv.organization_name ?? "", 40, y);
  doc.setFont("helvetica", "normal");
  let sy = y + 14;
  const senderLines = [
    inv.organization_address ?? "",
    inv.organization_email ?? "",
    inv.organization_kvk ? `KvK: ${inv.organization_kvk}` : "",
    inv.organization_vat ? `BTW: ${inv.organization_vat}` : "",
  ].filter(Boolean);
  senderLines.forEach((l) => {
    doc.text(l, 40, sy);
    sy += 12;
  });

  // Meta on right
  const metaX = pageW - 40;
  const metaLabelX = metaX - 200;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  const statusLabels: Record<string, { nl: string; en: string }> = {
    draft: { nl: "Concept", en: "Draft" },
    sent: { nl: "Verzonden", en: "Sent" },
    paid: { nl: "Betaald", en: "Paid" },
    overdue: { nl: "Vervallen", en: "Overdue" },
    cancelled: { nl: "Geannuleerd", en: "Cancelled" },
  };
  const statusLabel =
    statusLabels[inv.status]?.[lang === "en" ? "en" : "nl"] ?? inv.status;
  const meta: Array<[string, string]> = [
    [lang === "en" ? "Invoice #" : "Factuurnr.", inv.invoice_number],
    [lang === "en" ? "Issue date" : "Factuurdatum", fmtDate(inv.issue_date, lang)],
    [lang === "en" ? "Due date" : "Vervaldatum", fmtDate(inv.due_date, lang)],
    ["Status", statusLabel],
  ];
  if (inv.paid_at) {
    meta.push([lang === "en" ? "Paid on" : "Betaald op", fmtDate(inv.paid_at, lang)]);
  }
  let my = y;
  meta.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(k, metaLabelX, my);
    doc.setFont("helvetica", "normal");
    doc.text(v, metaX, my, { align: "right" });
    my += 14;
  });

  y = Math.max(sy, my) + 12;

  // Bill-to
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "bold");
  doc.text(lang === "en" ? "BILL TO" : "GEFACTUREERD AAN", 40, y);
  y += 14;
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.text(inv.client_name ?? "—", 40, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const client_lines = [inv.client_address ?? "", inv.client_email ?? ""].filter(Boolean);
  client_lines.forEach((l) => {
    doc.text(l, 40, y);
    y += 12;
  });
  y += 8;

  // Lines table
  autoTable(doc, {
    startY: y,
    head: [[
      lang === "en" ? "Description" : "Omschrijving",
      lang === "en" ? "Qty" : "Aantal",
      lang === "en" ? "Unit price" : "Prijs",
      "BTW",
      lang === "en" ? "Total" : "Totaal",
    ]],
    body: inv.lines.map((l) => [
      l.description,
      String(l.quantity),
      fmt(l.unit_price_cents),
      `${l.vat_rate}%`,
      fmt(l.total_cents),
    ]),
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

  const afterTableY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  let ty = afterTableY + 16;

  // Totals block
  const totalsX = pageW - 40;
  const labelX = totalsX - 180;
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const totalsRows: Array<[string, string, boolean]> = [
    [lang === "en" ? "Subtotal" : "Subtotaal", fmt(inv.subtotal_cents), false],
    ["BTW", fmt(inv.vat_cents), false],
    [lang === "en" ? "Total" : "Totaal", fmt(inv.total_cents), true],
  ];
  totalsRows.forEach(([label, val, bold]) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    if (bold) {
      doc.setTextColor(...theme.head);
      doc.setFontSize(12);
    }
    doc.text(label, labelX, ty);
    doc.text(val, totalsX, ty, { align: "right" });
    ty += bold ? 18 : 14;
    if (bold) {
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
    }
  });

  ty += 6;
  if (inv.organization_iban) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(
      (lang === "en" ? "Please transfer to IBAN: " : "Gelieve over te maken op IBAN: ") +
        inv.organization_iban +
        (inv.invoice_number ? ` — ref. ${inv.invoice_number}` : ""),
      40,
      ty,
    );
    ty += 14;
  }

  if (inv.notes) {
    ty += 8;
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(inv.notes, 40, ty, { maxWidth: pageW - 80 });
  }

  // Footer
  if (tpl.footerText) {
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(tpl.footerText, pageW / 2, pageH - 24, { align: "center" });
  }
  if (tpl.showPageNumbers) {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 160);
      doc.text(`${i} / ${pages}`, pageW - 40, pageH - 24, { align: "right" });
    }
  }

  // "Betaald" stempel wanneer factuur is voldaan
  if (inv.status === "paid") {
    const pages = doc.getNumberOfPages();
    const stampLabel = lang === "en" ? "PAID" : "BETAALD";
    const dateLabel = inv.paid_at
      ? (lang === "en" ? "on " : "op ") + fmtDate(inv.paid_at, lang)
      : "";
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.saveGraphicsState();
      doc.setGState(doc.GState({ opacity: 0.18 }));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(96);
      doc.setTextColor(16, 160, 90);
      doc.text(stampLabel, pageW / 2, pageH / 2, {
        align: "center",
        angle: 20,
      });
      if (dateLabel) {
        doc.setFontSize(18);
        doc.text(dateLabel, pageW / 2, pageH / 2 + 40, {
          align: "center",
          angle: 20,
        });
      }
      doc.restoreGraphicsState();
    }
  }

  return doc;
}

export function suggestInvoiceFilename(invoiceNumber: string, clientName?: string | null) {
  const slug = (clientName ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `factuur-${invoiceNumber}${slug ? "-" + slug : ""}.pdf`;
}
