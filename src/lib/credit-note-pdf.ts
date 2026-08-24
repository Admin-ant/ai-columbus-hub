/**
 * Creditnota-PDF: eigen layout met gecrediteerde regels en bedragen.
 * Client-side (jsPDF), haalt zelf de benodigde gegevens op via de Supabase client.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { supabase } from "@/integrations/supabase/client";
import { loadTemplate, THEMES, type PdfTemplate } from "./pdf-template";

export interface CreditNotePdfLine {
  description: string;
  quantity: number;
  unit_price_cents: number;
  vat_rate: number;
  total_cents: number;
}

export interface CreditNotePdfData {
  credit_number: string;
  issue_date: string;
  currency: string;
  original_number?: string | null;
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
  notes?: string | null;
  lines: CreditNotePdfLine[];
}

const locale = (lang: string) => (lang === "en" ? "en-IE" : "nl-NL");

const fmtCents = (c: number, lang: string, currency: string) =>
  new Intl.NumberFormat(locale(lang), { style: "currency", currency: currency || "EUR" }).format(
    (c ?? 0) / 100,
  );

const fmtDate = (iso: string, lang: string) => new Date(iso).toLocaleDateString(locale(lang));

export function buildCreditNotePdf(cn: CreditNotePdfData, tpl: PdfTemplate, lang: string): jsPDF {
  const en = lang === "en";
  const theme = THEMES[tpl.theme];
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  // Creditbedragen tonen we als negatief bedrag.
  const neg = (c: number) => -Math.abs(c ?? 0);
  const fmt = (c: number) => fmtCents(c, lang, cn.currency);
  let y = 48;

  if (tpl.logoDataUrl) {
    try {
      const mime = tpl.logoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      doc.addImage(tpl.logoDataUrl, mime, pageW - 40 - 80, 32, 80, 40, undefined, "FAST");
    } catch {
      /* ignore */
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...theme.head);
  doc.text(en ? "Credit note" : "Creditnota", 40, y);
  y += 6;
  doc.setDrawColor(...theme.accent);
  doc.setLineWidth(1.2);
  doc.line(40, y, 200, y);
  y += 18;

  // Afzender
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.text(cn.organization_name ?? "", 40, y);
  doc.setFont("helvetica", "normal");
  let sy = y + 14;
  [
    cn.organization_address ?? "",
    cn.organization_email ?? "",
    cn.organization_kvk ? `KvK: ${cn.organization_kvk}` : "",
    cn.organization_vat ? `BTW: ${cn.organization_vat}` : "",
  ]
    .filter(Boolean)
    .forEach((l) => {
      doc.text(l, 40, sy);
      sy += 12;
    });

  // Meta rechts
  const metaX = pageW - 40;
  const metaLabelX = metaX - 210;
  doc.setFontSize(9);
  const meta: Array<[string, string]> = [
    [en ? "Credit note #" : "Creditnotanr.", cn.credit_number],
    [en ? "Date" : "Datum", fmtDate(cn.issue_date, lang)],
  ];
  if (cn.original_number) {
    meta.push([en ? "Original invoice" : "Oorspronkelijke factuur", cn.original_number]);
  }
  let my = y;
  meta.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text(k, metaLabelX, my);
    doc.setFont("helvetica", "normal");
    doc.text(v, metaX, my, { align: "right" });
    my += 14;
  });

  y = Math.max(sy, my) + 12;

  // Klant
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "bold");
  doc.text(en ? "CREDITED TO" : "GECREDITEERD AAN", 40, y);
  y += 14;
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(cn.client_name ?? "—", 40, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  [cn.client_address ?? "", cn.client_email ?? ""].filter(Boolean).forEach((l) => {
    doc.text(l, 40, y);
    y += 12;
  });
  y += 8;

  // Gecrediteerde regels
  autoTable(doc, {
    startY: y,
    head: [
      [
        en ? "Description" : "Omschrijving",
        en ? "Qty" : "Aantal",
        en ? "Unit price" : "Prijs",
        "BTW",
        en ? "Credited" : "Gecrediteerd",
      ],
    ],
    body: cn.lines.map((l) => [
      l.description,
      String(l.quantity),
      fmt(Math.abs(l.unit_price_cents)),
      `${l.vat_rate}%`,
      fmt(neg(l.total_cents)),
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

  const afterTableY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  let ty = afterTableY + 16;

  const totalsX = pageW - 40;
  const labelX = totalsX - 200;
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const rows: Array<[string, string, boolean]> = [
    [en ? "Subtotal" : "Subtotaal", fmt(neg(cn.subtotal_cents)), false],
    ["BTW", fmt(neg(cn.vat_cents)), false],
    [en ? "Total credited" : "Totaal gecrediteerd", fmt(neg(cn.total_cents)), true],
  ];
  rows.forEach(([label, val, bold]) => {
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

  ty += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(
    en
      ? "This amount will be settled with you. No payment is required."
      : "Dit bedrag wordt met u verrekend. U hoeft niets te betalen.",
    40,
    ty,
    { maxWidth: pageW - 80 },
  );
  ty += 16;

  if (cn.notes) {
    doc.text(cn.notes, 40, ty, { maxWidth: pageW - 80 });
  }

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

  return doc;
}

export function suggestCreditNoteFilename(creditNumber: string, clientName?: string | null) {
  const safe = (clientName ?? "").replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "-");
  return `creditnota-${creditNumber}${safe ? `-${safe}` : ""}.pdf`;
}

type OrgRow = {
  name: string | null;
  tax_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  kvk_number: string | null;
  iban: string | null;
};

/** Haalt de creditnota met regels op en bouwt het PDF-document (zonder te downloaden). */
export async function prepareCreditNotePdf(opts: {
  creditNoteId: string;
  userId?: string | null;
  lang?: string;
}): Promise<{ doc: jsPDF; filename: string; dataUrl: string }> {
  const { creditNoteId, userId, lang = "nl" } = opts;


  const { data: cnRow, error } = await supabase
    .from("invoices")
    .select(
      "id,organization_id,invoice_number,issue_date,currency,client_id,client_name,subtotal_cents,vat_cents,total_cents,notes,credit_of_invoice_id",
    )
    .eq("id", creditNoteId)
    .maybeSingle();
  if (error || !cnRow) throw new Error("Creditnota niet gevonden");
  const c = cnRow as unknown as Record<string, unknown>;
  const orgId = String(c["organization_id"]);
  const clientId = (c["client_id"] as string | null) ?? null;
  const originalId = (c["credit_of_invoice_id"] as string | null) ?? null;

  const [linesRes, orgRes, clientRes, origRes] = await Promise.all([
    supabase
      .from("invoice_lines")
      .select("description,quantity,unit_price_cents,vat_rate,total_cents")
      .eq("invoice_id", creditNoteId)
      .order("position"),
    supabase
      .from("organizations")
      .select(
        "name,tax_number,address_line1,address_line2,postal_code,city,country,email,kvk_number,iban",
      )
      .eq("id", orgId)
      .maybeSingle(),
    clientId
      ? supabase
          .from("clients")
          .select("email,address_line1,postal_code,city")
          .eq("id", clientId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    originalId
      ? supabase.from("invoices").select("invoice_number").eq("id", originalId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const org = (orgRes.data ?? null) as OrgRow | null;
  const client = (clientRes.data ?? null) as {
    email: string | null;
    address_line1: string | null;
    postal_code: string | null;
    city: string | null;
  } | null;
  const original = (origRes.data ?? null) as { invoice_number: string | null } | null;

  const lines = ((linesRes.data ?? []) as Array<Record<string, unknown>>).map((l) => ({
    description: String(l["description"] ?? ""),
    quantity: Math.abs(Number(l["quantity"] ?? 0)),
    unit_price_cents: Number(l["unit_price_cents"] ?? 0),
    vat_rate: Number(l["vat_rate"] ?? 0),
    total_cents: Number(l["total_cents"] ?? 0),
  }));

  const creditNumber = String(c["invoice_number"] ?? "");
  const data: CreditNotePdfData = {
    credit_number: creditNumber,
    issue_date: String(c["issue_date"] ?? new Date().toISOString().slice(0, 10)),
    currency: (c["currency"] as string) ?? "EUR",
    original_number: original?.invoice_number ?? null,
    client_name: (c["client_name"] as string | null) ?? null,
    client_email: client?.email ?? null,
    client_address: client
      ? [client.address_line1, [client.postal_code, client.city].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", ")
      : null,
    organization_name: org?.name ?? null,
    organization_vat: org?.tax_number ?? null,
    organization_address: org
      ? [
          org.address_line1,
          org.address_line2,
          [org.postal_code, org.city].filter(Boolean).join(" "),
          org.country,
        ]
          .filter(Boolean)
          .join(", ")
      : null,
    organization_email: org?.email ?? null,
    organization_kvk: org?.kvk_number ?? null,
    organization_iban: org?.iban ?? null,
    subtotal_cents: Number(c["subtotal_cents"] ?? 0),
    vat_cents: Number(c["vat_cents"] ?? 0),
    total_cents: Number(c["total_cents"] ?? 0),
    notes: (c["notes"] as string | null) ?? null,
    lines,
  };

  const tpl = loadTemplate(orgId, userId ?? null);
  const doc = buildCreditNotePdf(data, tpl, lang);
  const filename = suggestCreditNoteFilename(creditNumber, data.client_name);
  doc.save(filename);
  return filename;
}
