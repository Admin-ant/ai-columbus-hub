import { createRoot } from "react-dom/client";
import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";
import { InvoiceTemplate, type InvoiceTemplateProps } from "@/components/invoice-template";

/**
 * Renders <InvoiceTemplate> off-screen and rasterizes it to a multi-page A4
 * PDF Blob using the same pipeline as the preview dialog's "Download PDF"
 * action — so the emailed PDF matches the on-screen preview exactly (logo,
 * layout, colours, header/footer, page breaks).
 *
 * Slim variant of the dialog pipeline:
 *   - A4, 12 mm margins, 9 mm header + footer bands
 *   - 200 DPI raster, 2x oversampling
 *   - Row-keep-together (thead + first row grouped)
 *   - Header (org name / "Factuur {nr}") + footer ("Pagina X van Y")
 *   - No TOC (invoices are typically single-page)
 */
export async function renderInvoiceTemplatePdfBlob(
  props: InvoiceTemplateProps,
): Promise<Blob> {
  const A4_W_MM = 210;
  const A4_H_MM = 297;
  const MARGIN_MM = 12;
  const HEADER_H_MM = 9;
  const FOOTER_H_MM = 9;
  const CONTENT_W_MM = A4_W_MM - MARGIN_MM * 2;
  const CONTENT_H_MM = A4_H_MM - MARGIN_MM * 2 - HEADER_H_MM - FOOTER_H_MM;
  const CONTENT_TOP_MM = MARGIN_MM + HEADER_H_MM;
  const TARGET_DPI = 200;
  const RENDER_W_PX = Math.round((CONTENT_W_MM / 25.4) * TARGET_DPI);
  const CANVAS_SCALE = Math.min(3, Math.max(2, window.devicePixelRatio || 2));

  // Off-screen mount point. Kept inside the document so Tailwind + app CSS
  // (custom properties, fonts) still cascade into the InvoiceTemplate.
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";
  wrapper.style.width = `${RENDER_W_PX}px`;
  wrapper.style.background = "#ffffff";
  wrapper.style.color = "#0a0a0a";
  wrapper.style.boxSizing = "border-box";
  // Force light theme tokens so oklch dark-mode variants never leak into
  // the raster when the app is being viewed in dark mode.
  wrapper.style.colorScheme = "light";
  wrapper.classList.remove("dark");
  wrapper.setAttribute("data-theme", "light");
  wrapper.style.setProperty("-webkit-font-smoothing", "antialiased");
  wrapper.style.setProperty("text-rendering", "geometricPrecision");
  document.body.appendChild(wrapper);

  const root = createRoot(wrapper);
  root.render(<InvoiceTemplate {...props} />);

  try {
    // Wait one paint tick so React commits and layout runs, then wait for
    // any <img> the template loads (logo, QR codes rendered as <svg> are
    // synchronous so only <img> tags need awaiting).
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => setTimeout(r, 50));
    const imgs = Array.from(wrapper.querySelectorAll("img"));
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete && img.naturalWidth > 0) return resolve();
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
      ),
    );

    // De InvoiceTemplate-card heeft standaard max-w-[820px]; forceer voor
    // export dat alle elementen de volledige wrapper-breedte gebruiken.
    wrapper.querySelectorAll<HTMLElement>("*").forEach((el) => {
      el.style.maxWidth = "none";
    });


    const wrapperTop = wrapper.getBoundingClientRect().top;
    const breakSelector =
      "tr,thead,tfoot,li,p,h1,h2,h3,h4,h5,h6,figure,img,section,article,[data-pdf-block]";
    const cssBoundaries = Array.from(
      wrapper.querySelectorAll<HTMLElement>(breakSelector),
    )
      .map((el) => el.getBoundingClientRect().bottom - wrapperTop)
      .filter((y) => y > 0)
      .sort((a, b) => a - b);

    // Keep-together ranges (rows must not be split, thead+first row grouped).
    const cssKeepRanges: { top: number; bottom: number }[] = Array.from(
      wrapper.querySelectorAll<HTMLElement>("tr,[data-keep-together]"),
    )
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top - wrapperTop, bottom: r.bottom - wrapperTop };
      })
      .filter((r) => r.bottom > r.top);
    for (const table of Array.from(wrapper.querySelectorAll<HTMLElement>("table"))) {
      const thead = table.querySelector<HTMLElement>("thead");
      const firstRow = table.querySelector<HTMLElement>("tbody > tr");
      if (thead && firstRow) {
        cssKeepRanges.push({
          top: thead.getBoundingClientRect().top - wrapperTop,
          bottom: firstRow.getBoundingClientRect().bottom - wrapperTop,
        });
      }
    }
    cssKeepRanges.sort((a, b) => a.top - b.top);

    const wrapperHeightCss = wrapper.getBoundingClientRect().height;

    const canvas = await html2canvas(wrapper, {
      scale: CANVAS_SCALE,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: RENDER_W_PX,
      imageTimeout: 15000,
      logging: false,
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const pxPerMm = canvas.width / CONTENT_W_MM;
    const pageContentHeightPx = Math.floor(CONTENT_H_MM * pxPerMm);
    const cssToCanvas = canvas.height / wrapperHeightCss;
    const boundariesPx = cssBoundaries.map((y) => Math.floor(y * cssToCanvas));
    const keepPx = cssKeepRanges.map((r) => ({
      top: Math.floor(r.top * cssToCanvas),
      bottom: Math.ceil(r.bottom * cssToCanvas),
    }));
    const isInsideKeep = (y: number) => {
      for (const r of keepPx) {
        if (r.top >= y) break;
        if (y > r.top && y < r.bottom) return true;
      }
      return false;
    };
    const MIN_PAGE_FILL = pageContentHeightPx * 0.35;
    const findBreak = (start: number, maxEnd: number): number => {
      let best = -1;
      for (const b of boundariesPx) {
        if (b <= start) continue;
        if (b > maxEnd) break;
        if (b - start < MIN_PAGE_FILL) continue;
        if (isInsideKeep(b)) continue;
        best = b;
      }
      if (best !== -1) return best;
      for (const r of keepPx) {
        if (r.top >= maxEnd) break;
        if (maxEnd > r.top && maxEnd < r.bottom && r.top > start) return r.top;
      }
      return maxEnd;
    };

    let rendered = 0;
    let pageIndex = 0;
    while (rendered < canvas.height) {
      const remaining = canvas.height - rendered;
      const sliceH =
        remaining <= pageContentHeightPx
          ? remaining
          : findBreak(rendered, rendered + pageContentHeightPx) - rendered;

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceH;
      const ctx = pageCanvas.getContext("2d");
      if (!ctx) break;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(canvas, 0, rendered, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      const sliceImg = pageCanvas.toDataURL("image/png");
      const sliceHmm = sliceH / pxPerMm;
      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(sliceImg, "PNG", MARGIN_MM, CONTENT_TOP_MM, CONTENT_W_MM, sliceHmm, undefined, "FAST");

      rendered += sliceH;
      pageIndex += 1;
    }

    // Header + footer on each page.
    const total = pdf.getNumberOfPages();
    const headerLeft = props.organization?.name || "";
    const headerRight = `Factuur ${props.invoice_number || ""}`.trim();
    const issueStr = props.issue_date
      ? new Date(props.issue_date).toLocaleDateString(props.language === "en" ? "en-IE" : "nl-NL")
      : "";
    for (let p = 1; p <= total; p += 1) {
      pdf.setPage(p);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(110, 110, 110);
      if (headerLeft) pdf.text(headerLeft, MARGIN_MM, MARGIN_MM + 4);
      if (headerRight) {
        const w = pdf.getTextWidth(headerRight);
        pdf.text(headerRight, A4_W_MM - MARGIN_MM - w, MARGIN_MM + 4);
      }
      pdf.setDrawColor(220, 220, 220);
      pdf.setLineWidth(0.2);
      pdf.line(MARGIN_MM, MARGIN_MM + 6.5, A4_W_MM - MARGIN_MM, MARGIN_MM + 6.5);
      const footerY = A4_H_MM - MARGIN_MM - 3;
      pdf.line(MARGIN_MM, footerY - 3, A4_W_MM - MARGIN_MM, footerY - 3);
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      if (issueStr) pdf.text(issueStr, MARGIN_MM, footerY);
      const pageStr = `Pagina ${p} van ${total}`;
      const psW = pdf.getTextWidth(pageStr);
      pdf.text(pageStr, (A4_W_MM - psW) / 2, footerY);
      if (headerRight) {
        const w = pdf.getTextWidth(headerRight);
        pdf.text(headerRight, A4_W_MM - MARGIN_MM - w, footerY);
      }
    }

    return pdf.output("blob") as Blob;
  } finally {
    root.unmount();
    wrapper.remove();
  }
}
