import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Download, Loader2, Printer, X, Copy, Link2 } from "lucide-react";
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

  useEffect(() => {
    setPaymentLink(data.payment_link_url ?? null);
  }, [data.payment_link_url]);

  useEffect(() => {
    if (defaultPreferredMethod) setMethod(defaultPreferredMethod);
  }, [defaultPreferredMethod]);

  function handlePrint() {
    window.print();
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
              <Button size="sm" variant="outline" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" /> Print / PDF
              </Button>
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

        <div className="max-h-[75vh] overflow-y-auto bg-muted/30 p-6">
          <div id="invoice-print-area" ref={printRef}>
            <InvoiceTemplate {...data} payment_link_url={paymentLink} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
