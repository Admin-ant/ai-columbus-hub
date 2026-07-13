import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Loader2, Printer, X, Copy, Link2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InvoiceTemplate, type InvoiceTemplateProps } from "@/components/invoice-template";
import {
  createMollieInvoicePayment,
  revokeMollieInvoicePayment,
} from "@/lib/mollie-invoice.functions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceStatus: string;
  data: InvoiceTemplateProps;
  onPaymentLinkChanged?: (url: string | null) => void;
}

/**
 * Preview-modal voor een factuur. Toont InvoiceTemplate 1-op-1 zoals
 * de PDF, met acties: printen / Save-as-PDF (via browser print),
 * Mollie-betaallink genereren en link kopieren.
 */
export function InvoicePreviewDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceStatus,
  data,
  onPaymentLinkChanged,
}: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const createFn = useServerFn(createMollieInvoicePayment);
  const revokeFn = useServerFn(revokeMollieInvoicePayment);
  const [paymentLink, setPaymentLink] = useState<string | null>(data.payment_link_url ?? null);

  useEffect(() => {
    setPaymentLink(data.payment_link_url ?? null);
  }, [data.payment_link_url]);

  function handlePrint() {
    // Scope de print naar #invoice-print-area via CSS in de dialog.
    window.print();
  }

  async function handleCreateLink() {
    setCreatingLink(true);
    try {
      const r = await createFn({ data: { invoice_id: invoiceId } });
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
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>Factuurvoorbeeld — {data.invoice_number}</DialogTitle>
            <div className="flex flex-wrap items-center gap-2">
              {canPay && !paymentLink && (
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
                  {canPay && (
                    <Button size="sm" variant="ghost" onClick={handleRevoke} disabled={revoking}>
                      {revoking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
                      Verwijder
                    </Button>
                  )}
                </>
              )}
              <Button size="sm" variant="outline" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" /> Print / PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[75vh] overflow-y-auto bg-muted/30 p-6">
          <div id="invoice-print-area" ref={printRef}>
            <InvoiceTemplate {...data} payment_link_url={paymentLink} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
