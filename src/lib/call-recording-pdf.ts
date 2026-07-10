import jsPDF from "jspdf";

export interface CallRecordingPdfInput {
  title: string | null;
  summary: string | null;
  transcript: string | null;
  report_markdown: string | null;
  workflow_stage: string | null;
  suggested_stage: string | null;
  duration_seconds: number | null;
  tasks_created: number;
  created_at: string;
  finalized_at: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("nl-NL", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function fmtDuration(sec: number | null): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Very light markdown → plain-text renderer for PDF (headings, bullets). */
function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\r/g, "");
}

function drawSection(doc: jsPDF, title: string, body: string, y: number, marginX: number, contentW: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  const bottom = pageH - 60;

  if (y > bottom - 60) { doc.addPage(); y = 60; }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 30);
  doc.text(title, marginX, y);
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(55, 55, 65);
  const text = body.trim().length ? body : "—";
  const lines = doc.splitTextToSize(text, contentW) as string[];
  for (const line of lines) {
    if (y > bottom) { doc.addPage(); y = 60; }
    doc.text(line, marginX, y);
    y += 13;
  }
  return y + 10;
}

function drawHeader(doc: jsPDF, rec: CallRecordingPdfInput, target: string | null): number {
  const marginX = 48;
  const pageW = doc.internal.pageSize.getWidth();

  // Accent bar
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageW, 46, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Gespreksverslag", marginX, 30);

  doc.setTextColor(20, 20, 30);
  let y = 78;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const title = rec.title ?? "Gesprek";
  const titleLines = doc.splitTextToSize(title, pageW - marginX * 2) as string[];
  for (const line of titleLines) { doc.text(line, marginX, y); y += 20; }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 100);
  const meta = [
    target ? `Klant/Lead: ${target}` : null,
    `Datum: ${fmtDate(rec.finalized_at ?? rec.created_at)}`,
    `Duur: ${fmtDuration(rec.duration_seconds)}`,
    rec.workflow_stage ? `Fase (voor): ${rec.workflow_stage}` : null,
    rec.suggested_stage ? `Fase (na): ${rec.suggested_stage}` : null,
    `Taken aangemaakt: ${rec.tasks_created}`,
  ].filter(Boolean) as string[];
  for (const m of meta) { doc.text(m, marginX, y); y += 12; }

  doc.setDrawColor(220, 222, 230);
  doc.line(marginX, y + 4, pageW - marginX, y + 4);
  return y + 20;
}

function drawFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 150);
    doc.text(`Pagina ${i} van ${pageCount}`, pageW - 48, pageH - 24, { align: "right" });
  }
}

function renderOne(doc: jsPDF, rec: CallRecordingPdfInput, target: string | null) {
  const marginX = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - marginX * 2;

  let y = drawHeader(doc, rec, target);

  if (rec.summary) {
    y = drawSection(doc, "Samenvatting", rec.summary, y, marginX, contentW);
  }
  y = drawSection(doc, "AI-rapport", stripMarkdown(rec.report_markdown ?? ""), y, marginX, contentW);
  y = drawSection(doc, "Transcript", rec.transcript ?? "", y, marginX, contentW);
}

/** Export a single call recording as PDF. */
export function exportCallRecordingPdf(rec: CallRecordingPdfInput, target: string | null) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  renderOne(doc, rec, target);
  drawFooter(doc);
  const safe = (rec.title ?? "gespreksverslag").replace(/[^\w\-]+/g, "_").slice(0, 60);
  const stamp = new Date(rec.created_at).toISOString().slice(0, 10);
  doc.save(`${safe}_${stamp}.pdf`);
}

/** Export multiple recordings into one bundled PDF. */
export function exportCallRecordingsBundle(
  recs: CallRecordingPdfInput[],
  targetLabel: string,
) {
  if (recs.length === 0) return;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  recs.forEach((rec, i) => {
    if (i > 0) doc.addPage();
    renderOne(doc, rec, targetLabel);
  });
  drawFooter(doc);
  const safe = targetLabel.replace(/[^\w\-]+/g, "_").slice(0, 60);
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`gespreksverslagen_${safe}_${stamp}.pdf`);
}
