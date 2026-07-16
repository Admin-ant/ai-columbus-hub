import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Download, Loader2, Printer, X, Copy, Link2, FileText, LayoutList } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { InvoiceTemplate, type InvoiceTemplateProps } from "@/components/invoice-template";
import {
  createMollieInvoicePayment,
  revokeMollieInvoicePayment,
  type MolliePaymentMethod,
} from "@/lib/mollie-invoice.functions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceStatus: string;
  data: InvoiceTemplateProps;
  defaultPreferredMethod?: MolliePaymentMethod | null;
  onPaymentLinkChanged?: (url: string | null) => void;
}

const METHOD_OPTIONS: { value: MolliePaymentMethod | "any"; label: string }[] = [
  { value: "any", label: "Alle methoden (klant kiest)" },
  { value: "ideal", label: "iDEAL" },
  { value: "creditcard", label: "Creditcard" },
  { value: "bancontact", label: "Bancontact" },
  { value: "paypal", label: "PayPal" },
  { value: "banktransfer", label: "Overboeking" },
  { value: "applepay", label: "Apple Pay" },
  { value: "sofort", label: "SOFORT" },
];

export function InvoicePreviewDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceStatus,
  data,
  defaultPreferredMethod,
  onPaymentLinkChanged,
}: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const createFn = useServerFn(createMollieInvoicePayment);
  const revokeFn = useServerFn(revokeMollieInvoicePayment);
  const [paymentLink, setPaymentLink] = useState<string | null>(data.payment_link_url ?? null);
  const [method, setMethod] = useState<MolliePaymentMethod | "any">(
    defaultPreferredMethod ?? "any",
  );
  const [restrict, setRestrict] = useState(false);
  const [paginated, setPaginated] = useState(true);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const [sheetHeight, setSheetHeight] = useState(0);
  // Export settings
  type PageSize = "a4" | "letter";
  type MarginProfile = "compact" | "normal" | "wide";
  type QualityProfile = "draft" | "standard" | "high";
  const [pageSize, setPageSize] = useState<PageSize>("a4");
  const [marginProfile, setMarginProfile] = useState<MarginProfile>("normal");
  const [quality, setQuality] = useState<QualityProfile>("standard");

  const PAGE_DIMS: Record<PageSize, { w: number; h: number; label: string }> = {
    a4: { w: 210, h: 297, label: "A4 (210 × 297 mm)" },
    letter: { w: 216, h: 279, label: "Letter (216 × 279 mm)" },
  };
  const MARGIN_MM_BY: Record<MarginProfile, number> = { compact: 8, normal: 12, wide: 20 };
  const DPI_BY: Record<QualityProfile, number> = { draft: 120, standard: 200, high: 260 };

  const currentPage = PAGE_DIMS[pageSize];
  const currentMarginMm = MARGIN_MM_BY[marginProfile];
  // Preview sheet aspect ratio uses the same page size + margins.
  const PAGE_ASPECT =
    (currentPage.h - currentMarginMm * 2) / (currentPage.w - currentMarginMm * 2);

  const recomputeBreaks = useCallback(() => {
    const node = sheetRef.current;
    if (!node || !paginated) return;
    const rect = node.getBoundingClientRect();
    const sheetTop = rect.top;
    const totalHeight = rect.height;
    setSheetHeight(totalHeight);
    const pageHeightPx = rect.width * PAGE_ASPECT;
    if (pageHeightPx <= 0 || totalHeight <= pageHeightPx) {
      setPageBreaks([]);
      return;
    }
    const selector = "tr,thead,tfoot,li,p,h1,h2,h3,h4,h5,h6,figure,img,section,article,[data-pdf-block]";
    const boundaries = Array.from(node.querySelectorAll<HTMLElement>(selector))
      .map((el) => el.getBoundingClientRect().bottom - sheetTop)
      .filter((y) => y > 0)
      .sort((a, b) => a - b);
    const MIN_FILL = pageHeightPx * 0.35;
    const breaks: number[] = [];
    let cursor = 0;
    while (cursor + pageHeightPx < totalHeight) {
      const target = cursor + pageHeightPx;
      let best = -1;
      for (const b of boundaries) {
        if (b <= cursor) continue;
        if (b > target) break;
        if (b - cursor >= MIN_FILL) best = b;
      }
      const cut = best === -1 ? target : best;
      breaks.push(cut);
      cursor = cut;
    }
    setPageBreaks(breaks);
  }, [paginated, PAGE_ASPECT]);

  useLayoutEffect(() => {
    if (!paginated) return;
    recomputeBreaks();
    const node = sheetRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => recomputeBreaks());
    ro.observe(node);
    const mo = new MutationObserver(() => recomputeBreaks());
    mo.observe(node, { childList: true, subtree: true, characterData: true });
    const t = setTimeout(recomputeBreaks, 200);
    return () => {
      ro.disconnect();
      mo.disconnect();
      clearTimeout(t);
    };
  }, [paginated, recomputeBreaks, data]);

  useEffect(() => {
    setPaymentLink(data.payment_link_url ?? null);
  }, [data.payment_link_url]);

  useEffect(() => {
    if (defaultPreferredMethod) setMethod(defaultPreferredMethod);
  }, [defaultPreferredMethod]);

  function handlePrint() {
    window.print();
  }

  async function handleDownloadPdf() {
    const node = printRef.current;
    if (!node) return;
    setDownloadingPdf(true);

    // Fixed A4 layout in mm — the template is scaled to fit the printable area
    // (page minus margins) so the output is always identical, regardless of the
    // on-screen preview width.
    const A4_W_MM = 210;
    const A4_H_MM = 297;
    const MARGIN_MM = 12;
    const CONTENT_W_MM = A4_W_MM - MARGIN_MM * 2;
    const CONTENT_H_MM = A4_H_MM - MARGIN_MM * 2;

    // Render the template at a fixed pixel width so the aspect ratio is
    // deterministic. We render at ~200 DPI (roughly 2× the standard 96 DPI)
    // so text and images stay crisp when placed on the A4 page.
    const TARGET_DPI = 200;
    const RENDER_W_PX = Math.round((CONTENT_W_MM / 25.4) * TARGET_DPI);
    // Additional canvas oversampling on top of that, clamped by the device
    // pixel ratio so we don't blow up memory on low-end devices.
    const CANVAS_SCALE = Math.min(3, Math.max(2, window.devicePixelRatio || 2));

    const wrapper = document.createElement("div");
    wrapper.style.position = "fixed";
    wrapper.style.left = "-10000px";
    wrapper.style.top = "0";
    wrapper.style.width = `${RENDER_W_PX}px`;
    wrapper.style.background = "#ffffff";
    wrapper.style.boxSizing = "border-box";
    wrapper.style.fontFamily = getComputedStyle(node).fontFamily;
    // Keep text hinting crisp on the raster.
    wrapper.style.setProperty("-webkit-font-smoothing", "antialiased");
    wrapper.style.setProperty("text-rendering", "geometricPrecision");

    const clone = node.cloneNode(true) as HTMLElement;
    clone.style.width = "100%";
    clone.style.maxWidth = "100%";
    clone.style.boxShadow = "none";
    clone.style.margin = "0";
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    try {
      // Collect safe page-break boundaries from the DOM BEFORE rasterizing.
      // Any element that shouldn't be split (table rows, cards, sections,
      // headings, paragraphs) contributes its bottom-edge as a candidate
      // break point. We snap each page to the nearest boundary <= the
      // theoretical cut, so lines and rows stay whole.
      const wrapperTop = wrapper.getBoundingClientRect().top;
      const breakSelector = [
        "tr",
        "thead",
        "tfoot",
        "li",
        "p",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "figure",
        "img",
        "section",
        "article",
        "[data-pdf-block]",
      ].join(",");
      const boundaryEls = Array.from(
        wrapper.querySelectorAll<HTMLElement>(breakSelector),
      );
      // Bottom offsets (in wrapper CSS px) that are safe to break AFTER.
      const cssBoundaries = boundaryEls
        .map((el) => el.getBoundingClientRect().bottom - wrapperTop)
        .filter((y) => y > 0)
        .sort((a, b) => a - b);
      const wrapperHeightCss = wrapper.getBoundingClientRect().height;

      // Collect headings for the auto-generated table of contents.
      // Any element with [data-toc] (optionally [data-toc-label="..."])
      // or a native h1–h6 becomes a TOC entry.
      const headingEls = Array.from(
        wrapper.querySelectorAll<HTMLElement>(
          "h1,h2,h3,h4,h5,h6,[data-toc]",
        ),
      );
      const headings = headingEls
        .map((el) => {
          const tag = el.tagName.toLowerCase();
          const levelFromTag = tag.length === 2 && tag[0] === "h" ? parseInt(tag[1], 10) : NaN;
          const levelAttr = parseInt(el.getAttribute("data-toc-level") || "", 10);
          const level = Math.min(
            4,
            Math.max(1, Number.isFinite(levelAttr) ? levelAttr : Number.isFinite(levelFromTag) ? levelFromTag : 2),
          );
          const text = (el.getAttribute("data-toc-label") || el.textContent || "")
            .replace(/\s+/g, " ")
            .trim();
          const topCss = el.getBoundingClientRect().top - wrapperTop;
          return { level, text, topCss };
        })
        .filter((h) => h.text.length > 0 && h.text.length <= 160);

      const canvas = await html2canvas(wrapper, {
        scale: CANVAS_SCALE,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: RENDER_W_PX,
        imageTimeout: 15000,
        logging: false,
      });

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      // 1 mm in canvas pixels — content width fills exactly CONTENT_W_MM.
      const pxPerMm = canvas.width / CONTENT_W_MM;
      const pageContentHeightPx = Math.floor(CONTENT_H_MM * pxPerMm);

      // Convert CSS-px boundaries to canvas-px so they align with the raster.
      const cssToCanvas = canvas.height / wrapperHeightCss;
      const boundariesPx = cssBoundaries.map((y) => Math.floor(y * cssToCanvas));

      const MIN_PAGE_FILL = pageContentHeightPx * 0.35; // avoid nearly-empty pages

      const findBreak = (start: number, maxEnd: number): number => {
        // Largest boundary that fits: start < b <= maxEnd, and produces a
        // reasonably filled page (>= MIN_PAGE_FILL). Otherwise hard-cut.
        let best = -1;
        for (const b of boundariesPx) {
          if (b <= start) continue;
          if (b > maxEnd) break;
          if (b - start >= MIN_PAGE_FILL) best = b;
        }
        return best === -1 ? maxEnd : best;
      };

      let renderedPx = 0;
      let pageIndex = 0;
      const pageStartsPx: number[] = []; // canvas-px start of each content page
      while (renderedPx < canvas.height) {
        const remaining = canvas.height - renderedPx;
        let sliceHeightPx: number;
        if (remaining <= pageContentHeightPx) {
          sliceHeightPx = remaining;
        } else {
          const maxEnd = renderedPx + pageContentHeightPx;
          const cut = findBreak(renderedPx, maxEnd);
          sliceHeightPx = cut - renderedPx;
        }

        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeightPx;
        const ctx = pageCanvas.getContext("2d");
        if (!ctx) break;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(
          canvas,
          0, renderedPx, canvas.width, sliceHeightPx,
          0, 0, canvas.width, sliceHeightPx,
        );
        // PNG keeps text edges sharp (JPEG blurs small type).
        const sliceImg = pageCanvas.toDataURL("image/png");
        const sliceHeightMm = sliceHeightPx / pxPerMm;
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(sliceImg, "PNG", MARGIN_MM, MARGIN_MM, CONTENT_W_MM, sliceHeightMm, undefined, "FAST");

        pageStartsPx.push(renderedPx);
        renderedPx += sliceHeightPx;
        pageIndex += 1;
      }

      // Build clickable Table of Contents (only when we have ≥ 2 headings
      // AND the document spans more than one page — a single-page invoice
      // doesn't need a TOC).
      if (headings.length >= 2 && pageIndex > 1) {
        // Map each heading to its content page index (0-based).
        const entries = headings.map((h) => {
          const topCanvas = h.topCss * cssToCanvas;
          let idx = 0;
          for (let i = 0; i < pageStartsPx.length; i += 1) {
            if (pageStartsPx[i] <= topCanvas) idx = i;
            else break;
          }
          return { ...h, contentPageIndex: idx };
        });

        // Insert TOC as the new first page; all content pages shift by +1.
        pdf.insertPage(1);
        pdf.setPage(1);

        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(20, 20, 20);
        pdf.setFontSize(20);
        pdf.text("Inhoudsopgave", MARGIN_MM, MARGIN_MM + 8);
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.3);
        pdf.line(MARGIN_MM, MARGIN_MM + 11, A4_W_MM - MARGIN_MM, MARGIN_MM + 11);

        pdf.setFont("helvetica", "normal");
        const rightX = A4_W_MM - MARGIN_MM;
        const leftX = MARGIN_MM;
        let y = MARGIN_MM + 22;
        const lineGap = 7;
        const bottomLimit = A4_H_MM - MARGIN_MM;

        // Try to set outline (jsPDF outline API — best-effort).
        // Older jsPDF versions expose pdf.outline.add(parent, title, { pageNumber }).
        const outline = (pdf as unknown as {
          outline?: { add: (parent: unknown, title: string, opts: { pageNumber: number }) => unknown };
        }).outline;

        for (const e of entries) {
          if (y > bottomLimit) break; // TOC longer than one page: truncate silently
          const targetPage = e.contentPageIndex + 2; // +1 for TOC insert, +1 to 1-index
          const indent = (e.level - 1) * 4;
          const fontSize = e.level === 1 ? 12 : e.level === 2 ? 11 : 10;
          pdf.setFontSize(fontSize);
          pdf.setTextColor(e.level === 1 ? 20 : 60, e.level === 1 ? 20 : 60, e.level === 1 ? 20 : 60);

          const pageStr = String(targetPage);
          const pageStrW = pdf.getTextWidth(pageStr);
          const titleMaxW = rightX - (leftX + indent) - pageStrW - 6;
          const titleLines = pdf.splitTextToSize(e.text, titleMaxW) as string[];
          const title = titleLines[0] + (titleLines.length > 1 ? "…" : "");
          const titleW = pdf.getTextWidth(title);

          pdf.text(title, leftX + indent, y);
          // Dotted leader between title and page number.
          const dotsStart = leftX + indent + titleW + 2;
          const dotsEnd = rightX - pageStrW - 2;
          if (dotsEnd > dotsStart) {
            pdf.setTextColor(160, 160, 160);
            const dot = ".";
            const dotW = pdf.getTextWidth(dot);
            const dotCount = Math.max(0, Math.floor((dotsEnd - dotsStart) / (dotW * 1.6)));
            if (dotCount > 0) {
              pdf.text(" ".repeat(0) + Array(dotCount).fill(dot).join(" "), dotsStart, y);
            }
            pdf.setTextColor(e.level === 1 ? 20 : 60, e.level === 1 ? 20 : 60, e.level === 1 ? 20 : 60);
          }
          pdf.text(pageStr, rightX - pageStrW, y);

          // Clickable link across the entire row.
          pdf.link(leftX, y - fontSize * 0.35, rightX - leftX, fontSize * 0.5 + 2, {
            pageNumber: targetPage,
          });

          // PDF bookmark / outline entry.
          try {
            outline?.add(null, e.text, { pageNumber: targetPage });
          } catch {
            // outline API unavailable — links still work.
          }

          y += lineGap;
        }
      }

      const filename = `factuur-${data.invoice_number || "download"}.pdf`;
      pdf.save(filename);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF genereren mislukt");
    } finally {
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
      setDownloadingPdf(false);
    }
  }



  async function handleCreateLink() {
    setCreatingLink(true);
    try {
      const preferred = method === "any" ? null : method;
      const r = await createFn({
        data: { invoice_id: invoiceId, preferred_method: preferred, restrict: restrict && !!preferred },
      });
      setPaymentLink(r.checkoutUrl);
      onPaymentLinkChanged?.(r.checkoutUrl);
      toast.success(r.reused ? "Bestaande betaallink hergebruikt" : "Betaallink aangemaakt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kon geen betaallink maken");
    } finally {
      setCreatingLink(false);
    }
  }

  async function handleCopyLink() {
    if (!paymentLink) return;
    try {
      await navigator.clipboard.writeText(paymentLink);
      toast.success("Betaallink gekopieerd");
    } catch {
      toast.error("Kopiëren mislukt");
    }
  }

  async function handleRevoke() {
    if (!window.confirm("Betaallink verwijderen?")) return;
    setRevoking(true);
    try {
      await revokeFn({ data: { invoice_id: invoiceId } });
      setPaymentLink(null);
      onPaymentLinkChanged?.(null);
      toast.success("Betaallink verwijderd");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    } finally {
      setRevoking(false);
    }
  }

  const canPay = invoiceStatus !== "paid" && invoiceStatus !== "cancelled";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0">
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #invoice-print-area, #invoice-print-area * { visibility: visible !important; }
            #invoice-print-area {
              position: absolute !important;
              inset: 0 !important;
              padding: 0 !important;
              margin: 0 !important;
              box-shadow: none !important;
              background: white !important;
            }
            .no-print { display: none !important; }
            @page { size: A4; margin: 12mm; }
          }
        `}</style>

        <DialogHeader className="no-print border-b px-6 py-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <DialogTitle>Factuurvoorbeeld — {data.invoice_number}</DialogTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={paginated ? "default" : "outline"}
                  onClick={() => setPaginated((v) => !v)}
                  title="Toon pagina-indeling zoals in de PDF"
                >
                  {paginated ? (
                    <LayoutList className="mr-2 h-4 w-4" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  {paginated ? "Paginavoorbeeld aan" : "Paginavoorbeeld uit"}
                </Button>
                <Button size="sm" onClick={handleDownloadPdf} disabled={downloadingPdf}>
                  {downloadingPdf ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Download PDF
                </Button>
                <Button size="sm" variant="outline" onClick={handlePrint}>
                  <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
              </div>

            </div>

            {canPay && (
              <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
                <div className="min-w-[220px] flex-1">
                  <Label className="text-xs">Betaalmethode voorkeur</Label>
                  <Select
                    value={method}
                    onValueChange={(v) => setMethod(v as MolliePaymentMethod | "any")}
                    disabled={!!paymentLink || creatingLink}
                  >
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METHOD_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {method !== "any" && !paymentLink && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={restrict}
                      onCheckedChange={(c) => setRestrict(c === true)}
                    />
                    Alleen deze methode toestaan
                  </label>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {!paymentLink && (
                    <Button size="sm" onClick={handleCreateLink} disabled={creatingLink}>
                      {creatingLink ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CreditCard className="mr-2 h-4 w-4" />
                      )}
                      Mollie betaallink maken
                    </Button>
                  )}
                  {paymentLink && (
                    <>
                      <Button asChild size="sm" variant="secondary">
                        <a href={paymentLink} target="_blank" rel="noopener noreferrer">
                          <Link2 className="mr-2 h-4 w-4" /> Open betaallink
                        </a>
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleCopyLink}>
                        <Copy className="mr-2 h-4 w-4" /> Kopieer
                      </Button>
                      <Button size="sm" variant="ghost" onClick={handleRevoke} disabled={revoking}>
                        {revoking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
                        Verwijder
                      </Button>
                    </>
                  )}
                </div>
                {paymentLink && (
                  <div className="ml-auto rounded bg-white p-1" title="Scan om te betalen">
                    <QRCodeSVG value={paymentLink} size={72} level="M" />
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="max-h-[75vh] overflow-y-auto bg-muted/40 p-6">
          {paginated ? (
            <div className="mx-auto" style={{ maxWidth: 820 }}>
              <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>Weergave op A4 (210 × 297 mm, 12 mm marge)</span>
                <span>{pageBreaks.length + 1} pagina{pageBreaks.length === 0 ? "" : "'s"}</span>
              </div>
              <div
                className="relative mx-auto rounded-sm bg-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.25)] ring-1 ring-black/5"
                style={{ padding: "24px" }}
              >
                <div id="invoice-print-area" ref={printRef}>
                  <div ref={sheetRef}>
                    <InvoiceTemplate {...data} payment_link_url={paymentLink} />
                  </div>
                </div>
                {/* Page-break overlay */}
                <div className="pointer-events-none absolute inset-0">
                  {pageBreaks.map((y, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0"
                      style={{ top: `${24 + y}px` }}
                    >
                      <div className="relative">
                        <div className="h-0 border-t-2 border-dashed border-primary/60" />
                        <div className="absolute -top-3 right-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-foreground shadow">
                          Einde pagina {i + 1}
                        </div>
                        <div className="absolute top-1 left-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground shadow-sm">
                          Pagina {i + 2}
                        </div>
                      </div>
                    </div>
                  ))}
                  {sheetHeight > 0 && (
                    <div className="absolute left-2 top-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground shadow-sm">
                      Pagina 1
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div id="invoice-print-area" ref={printRef}>
              <InvoiceTemplate {...data} payment_link_url={paymentLink} />
            </div>
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}
