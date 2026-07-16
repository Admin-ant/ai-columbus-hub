import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  Link2,
  Link2Off,
  Loader2,
  Mail,
  Paperclip,
  Pencil,
  Save,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { supabase } from "@/integrations/supabase/client";
import { renderInvoiceTemplatePdfBlob } from "@/lib/render-invoice-template-pdf";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildInvoicePdf, buildPaymentReceiptPdf, suggestInvoiceFilename, suggestReceiptFilename, type InvoicePdfData } from "@/lib/invoice-pdf";
import { loadTemplate } from "@/lib/pdf-template";
import {
  deleteInvoice,
  emailInvoice,
  getInvoiceAttachmentUrl,
  removeInvoiceAttachment,
  updateInvoice,
} from "@/lib/invoice-actions.functions";
import { InvoicePreviewDialog } from "@/components/invoice-preview-dialog";
import type { InvoiceTemplateProps, InvoiceTemplateLineKind } from "@/components/invoice-template";
import {
  createMollieInvoicePayment,
  listInvoicePaymentEvents,
  refreshMollieInvoiceStatus,
  type MolliePaymentMethod,
} from "@/lib/mollie-invoice.functions";
import { suggestInvoiceEmail } from "@/lib/invoice-email-ai.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCents } from "@/lib/currency";
import { QRCodeSVG } from "qrcode.react";
import { RefreshCw } from "lucide-react";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type InvoiceLine = Database["public"]["Tables"]["invoice_lines"]["Row"];
type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];
type EmailLogRow = {
  id: string;
  to_email: string;
  cc_emails: string[] | null;
  subject: string;
  status: string;
  error: string | null;
  created_at: string;
};
type AttachmentRow = {
  id: string;
  filename: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};
type PaymentEventRow = {
  id: string;
  event_type: string;
  mollie_payment_id: string | null;
  status: string | null;
  amount_cents: number | null;
  method: string | null;
  metadata: unknown;
  created_at: string;
};
type OrgRow = {
  id: string;
  name: string;
  tax_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  kvk_number: string | null;
  iban: string | null;
  bic: string | null;
  account_holder: string | null;
  brand_logo_url: string | null;
  logo_url: string | null;
};

const MOLLIE_BADGE_COLOR: Record<string, string> = {
  created: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  open: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
  expired: "bg-red-500/15 text-red-700 dark:text-red-300",
  canceled: "bg-muted text-muted-foreground",
  revoked: "bg-muted text-muted-foreground",
};
const MOLLIE_BADGE_LABEL: Record<string, string> = {
  created: "Aangemaakt",
  open: "Open",
  pending: "In behandeling",
  paid: "Betaald",
  failed: "Mislukt",
  expired: "Verlopen",
  canceled: "Geannuleerd",
  revoked: "Ingetrokken",
};

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft: "bg-muted text-foreground",
  sent: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  overdue: "bg-red-500/15 text-red-700 dark:text-red-300",
  cancelled: "bg-muted text-muted-foreground",
};

export const Route = createFileRoute("/_authenticated/invoices/$invoiceId")({
  head: () => ({ meta: [{ title: "Factuur" }] }),
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  const { invoiceId } = Route.useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [org, setOrg] = useState<OrgRow | null>(null);
  const [client, setClient] = useState<{ email: string | null; address_line1: string | null; postal_code: string | null; city: string | null } | null>(null);
  const [emailLog, setEmailLog] = useState<EmailLogRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [paymentEvents, setPaymentEvents] = useState<PaymentEventRow[]>([]);
  const [refreshingMollie, setRefreshingMollie] = useState(false);
  const listEventsFn = useServerFn(listInvoicePaymentEvents);
  const refreshMollieFn = useServerFn(refreshMollieInvoiceStatus);
  const [loading, setLoading] = useState(true);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailMode, setEmailMode] = useState<"normal" | "reminder">("normal");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState<null | { to: string }>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const eur = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en-IE" : "nl-NL", {
        style: "currency",
        currency: "EUR",
      }),
    [i18n.resolvedLanguage],
  );

  // Bepaal terug-navigatie op basis van de vorige pagina (Boekhouding of Facturen)
  const [backTo, setBackLink] = useState<"/invoices" | "/boekhouding">("/invoices");
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`invoice-back:${invoiceId}`);
      if (stored === "/boekhouding" || stored === "/invoices") {
        setBackLink(stored);
        return;
      }
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === window.location.origin) {
        const dest = ref.pathname.startsWith("/boekhouding") ? "/boekhouding" : "/invoices";
        setBackLink(dest);
        sessionStorage.setItem(`invoice-back:${invoiceId}`, dest);
      }
    } catch {
      /* ignore */
    }
  }, [invoiceId]);
  const backLabel = backTo === "/boekhouding" ? t("invoices.back_to_accounting", { defaultValue: "Terug naar Boekhouding" }) : t("invoices.back_to_list");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: inv, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .maybeSingle();
    if (error) toast.error(error.message);
    if (!inv) {
      setInvoice(null);
      setLoading(false);
      return;
    }
    setInvoice(inv as Invoice);

    const [ln, lg, at, orgRes, clRes] = await Promise.all([
      supabase.from("invoice_lines").select("*").eq("invoice_id", invoiceId).order("position"),
      supabase
        .from("invoice_email_log")
        .select("id,to_email,cc_emails,subject,status,error,created_at")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: false }),
      supabase
        .from("invoice_attachments")
        .select("id,filename,storage_path,mime_type,size_bytes,created_at")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: false }),
      supabase
        .from("organizations")
        .select("id,name,tax_number,address_line1,address_line2,postal_code,city,country,email,phone,website,kvk_number,iban,bic,account_holder,brand_logo_url,logo_url")
        .eq("id", (inv as Invoice).organization_id)
        .maybeSingle(),
      (inv as Invoice).client_id
        ? supabase
            .from("clients")
            .select("email,address_line1,postal_code,city")
            .eq("id", (inv as Invoice).client_id as string)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    setLines((ln.data ?? []) as InvoiceLine[]);
    setEmailLog((lg.data ?? []) as EmailLogRow[]);
    setAttachments((at.data ?? []) as AttachmentRow[]);
    setOrg((orgRes.data ?? null) as OrgRow | null);
    setClient(
      (clRes.data ?? null) as {
        email: string | null;
        address_line1: string | null;
        postal_code: string | null;
        city: string | null;
      } | null,
    );

    // Betalings-events (Mollie) apart laden — RLS via org membership
    try {
      const ev = await listEventsFn({ data: { invoice_id: invoiceId } });
      setPaymentEvents(ev.events as PaymentEventRow[]);
    } catch {
      setPaymentEvents([]);
    }
    setLoading(false);
  }, [invoiceId, listEventsFn]);

  useEffect(() => {
    void load();
  }, [load]);

  const buildPdf = useCallback(() => {
    if (!invoice) return null;
    const tpl = loadTemplate(invoice.organization_id, user?.id ?? null);
    const data: InvoicePdfData = {
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      currency: invoice.currency,
      client_name: invoice.client_name,
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
      subtotal_cents: invoice.subtotal_cents,
      vat_cents: invoice.vat_cents,
      total_cents: invoice.total_cents,
      status: invoice.status,
      paid_at: invoice.paid_at ?? null,
      lines: lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unit_price_cents: l.unit_price_cents,
        vat_rate: Number(l.vat_rate),
        subtotal_cents: l.subtotal_cents,
        vat_cents: l.vat_cents,
        total_cents: l.total_cents,
      })),
    };
    return buildInvoicePdf(data, tpl, i18n.resolvedLanguage ?? "nl");
  }, [invoice, lines, org, client, user, i18n.resolvedLanguage]);

  function downloadPdf(filename: string) {
    const doc = buildPdf();
    if (!doc) return;
    doc.save(filename);
  }

  // Builds the same InvoiceTemplate the user sees in the preview dialog and
  // rasterises it to a PDF blob for the email attachment. Kept in a callback
  // so the compose dialog can trigger it on submit (async, off-screen render).
  const buildTemplatePdfBlob = useCallback(async (): Promise<Blob> => {
    if (!invoice) throw new Error("Factuur niet geladen");
    const { renderInvoiceTemplatePdfBlob } = await import("@/lib/render-invoice-template-pdf");
    const templateProps: InvoiceTemplateProps = {
      organization: {
        name: org?.name ?? null,
        street: [org?.address_line1, org?.address_line2].filter(Boolean).join(" "),
        postal_city: [org?.postal_code, org?.city].filter(Boolean).join(" "),
        country: org?.country ?? null,
        phone: org?.phone ?? null,
        website: org?.website ?? null,
        kvk: org?.kvk_number ?? null,
        vat: org?.tax_number ?? null,
        iban: org?.iban ?? null,
        account_holder: org?.account_holder ?? org?.name ?? null,
        logo_url: org?.brand_logo_url ?? org?.logo_url ?? null,
      },
      client: {
        customer_number: null,
        company_name: invoice.client_name,
        street: client?.address_line1 ?? null,
        postal_city: [client?.postal_code, client?.city].filter(Boolean).join(" "),
      },
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      currency: invoice.currency ?? "EUR",
      language: i18n.resolvedLanguage ?? "nl",
      precomputed_subtotal_cents: invoice.subtotal_cents,
      precomputed_vat_cents: invoice.vat_cents,
      precomputed_total_cents: invoice.total_cents,
      payment_link_url:
        (invoice as unknown as { payment_link_url?: string | null; mollie_checkout_url?: string | null })
          .payment_link_url ??
        (invoice as unknown as { mollie_checkout_url?: string | null }).mollie_checkout_url ??
        null,
      lines: lines.map((l) => ({
        line_type:
          ((l as unknown as { line_type?: InvoiceTemplateLineKind }).line_type ??
            "item") as InvoiceTemplateLineKind,
        description: l.description,
        quantity: Number(l.quantity),
        unit_price_cents: l.unit_price_cents,
        vat_rate: Number(l.vat_rate),
        subtotal_cents: l.subtotal_cents,
        vat_cents: l.vat_cents,
        total_cents: l.total_cents,
      })),
    };
    return renderInvoiceTemplatePdfBlob(templateProps);
  }, [invoice, lines, org, client, i18n.resolvedLanguage]);

  // Dev-only test hook: exposes the email PDF renderer for the parity spec.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const g = window as unknown as {
      __invoicePdfTest?: { renderEmail?: () => Promise<Blob> };
    };
    g.__invoicePdfTest = { ...(g.__invoicePdfTest ?? {}), renderEmail: buildTemplatePdfBlob };
    return () => {
      if (g.__invoicePdfTest) delete g.__invoicePdfTest.renderEmail;
    };
  }, [buildTemplatePdfBlob]);

  function downloadReceipt() {
    if (!invoice) return;
    const tpl = loadTemplate(invoice.organization_id, user?.id ?? null);
    const data: InvoicePdfData = {
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      currency: invoice.currency,
      client_name: invoice.client_name,
      client_email: client?.email ?? null,
      client_address: client
        ? [client.address_line1, [client.postal_code, client.city].filter(Boolean).join(" ")]
            .filter(Boolean)
            .join(", ")
        : null,
      organization_name: org?.name ?? null,
      organization_vat: org?.tax_number ?? null,
      organization_address: org
        ? [org.address_line1, org.address_line2, [org.postal_code, org.city].filter(Boolean).join(" "), org.country]
            .filter(Boolean)
            .join(", ")
        : null,
      organization_email: org?.email ?? null,
      organization_kvk: org?.kvk_number ?? null,
      organization_iban: org?.iban ?? null,
      subtotal_cents: invoice.subtotal_cents,
      vat_cents: invoice.vat_cents,
      total_cents: invoice.total_cents,
      status: invoice.status,
      paid_at: invoice.paid_at ?? null,
      lines: [],
    };
    const doc = buildPaymentReceiptPdf(data, tpl, i18n.resolvedLanguage ?? "nl");
    doc.save(suggestReceiptFilename(invoice.invoice_number, invoice.client_name));
  }

  async function markUnpaid() {
    if (!invoice) return;
    if (!window.confirm("Deze factuur terugzetten op onbetaald? De betaal-datum en stempel worden verwijderd.")) return;
    // Kies status op basis van vervaldatum, zodat lijst-badge en KPI-tellingen
    // (die op vervaldatum kijken) consistent blijven.
    const today = new Date().toISOString().slice(0, 10);
    const nextStatus: InvoiceStatus =
      invoice.due_date && invoice.due_date < today ? "overdue" : "sent";
    const { error } = await supabase
      .from("invoices")
      .update({ status: nextStatus, paid_at: null })
      .eq("id", invoice.id);
    if (error) return toast.error(error.message);
    toast.success("Factuur teruggezet op onbetaald");
    void load();
  }

  const emailFn = useServerFn(emailInvoice);
  const deleteFn = useServerFn(deleteInvoice);
  const removeAttFn = useServerFn(removeInvoiceAttachment);
  const attUrlFn = useServerFn(getInvoiceAttachmentUrl);

  async function handleDelete() {
    if (!invoice) return;
    const isDraft = invoice.status === "draft";
    const msg = isDraft ? t("invoices.delete_confirm") : t("invoices.cancel_confirm");
    if (!window.confirm(msg)) return;
    try {
      const r = await deleteFn({ data: { invoice_id: invoice.id } });
      if (r.action === "deleted") {
        toast.success(t("invoices.deleted"));
        navigate({ to: "/invoices" });
      } else {
        toast.success(t("invoices.cancelled_ok"));
        void load();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fout");
    }
  }

  async function handleAttachmentUpload(file: File) {
    if (!invoice) return;
    const path = `${invoice.organization_id}/${invoice.id}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage
      .from("invoice-attachments")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) return toast.error(error.message);
    const { error: insErr } = await supabase.from("invoice_attachments").insert({
      organization_id: invoice.organization_id,
      invoice_id: invoice.id,
      storage_path: path,
      filename: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: user?.id ?? null,
    } as never);
    if (insErr) return toast.error(insErr.message);
    toast.success("Bijlage toegevoegd");
    void load();
  }

  async function openAttachment(a: AttachmentRow) {
    try {
      const r = await attUrlFn({ data: { storage_path: a.storage_path } });
      window.open(r.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fout");
    }
  }

  async function deleteAttachment(a: AttachmentRow) {
    if (!window.confirm(`Verwijder "${a.filename}"?`)) return;
    try {
      await removeAttFn({ data: { attachment_id: a.id } });
      toast.success("Bijlage verwijderd");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fout");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("common.loading")}
      </div>
    );
  }
  if (!invoice) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="mx-auto max-w-md text-center">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-xl font-semibold tracking-tight">
            {t("invoices.not_found")}
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            {t("invoices.not_found_description")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="outline" size="sm">
              <Link to={backTo}>
                <ArrowLeft className="mr-1 h-4 w-4" /> {backLabel}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/invoices">{t("invoices.title")}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isDraft = invoice.status === "draft";
  const suggestedFilename = invoice.pdf_filename || suggestInvoiceFilename(invoice.invoice_number, invoice.client_name);
  const invExt = invoice as unknown as {
    mollie_checkout_url?: string | null;
    payment_link_url?: string | null;
    mollie_payment_id?: string | null;
    preferred_payment_method?: MolliePaymentMethod | null;
  };
  const currentPaymentLink = invExt.payment_link_url ?? invExt.mollie_checkout_url ?? null;
  const preferredMethod = invExt.preferred_payment_method ?? null;

  const isUnpaid =
    invoice.status !== "paid" && invoice.status !== "cancelled" && invoice.status !== "draft";
  const daysOverdue = (() => {
    if (!isUnpaid || !invoice.due_date) return 0;
    const due = new Date(invoice.due_date);
    const now = new Date();
    const diff = Math.floor((now.getTime() - due.getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  })();
  const reminderDefaults = (() => {
    const eurFmt = new Intl.NumberFormat("nl-NL", { style: "currency", currency: invoice.currency ?? "EUR" });
    const dueFmt = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("nl-NL") : "";
    const subject =
      daysOverdue > 0
        ? `Betaalherinnering — factuur ${invoice.invoice_number} (${daysOverdue} dagen over vervaldatum)`
        : `Betaalherinnering — factuur ${invoice.invoice_number}`;
    const overdueLine =
      daysOverdue > 0
        ? `Volgens onze administratie is deze factuur ${daysOverdue} dagen over de vervaldatum (${dueFmt}) en nog niet betaald.`
        : `Deze factuur vervalt op ${dueFmt} en staat op dit moment nog open.`;
    const body =
      `Beste {{client_name}},\n\n` +
      `${overdueLine}\n\n` +
      `Het openstaande bedrag is ${eurFmt.format(invoice.total_cents / 100)}.\n` +
      `Wij verzoeken u vriendelijk de betaling zo spoedig mogelijk te voldoen. Heeft u de betaling inmiddels verricht, dan kunt u deze mail als niet verzonden beschouwen.\n\n` +
      `Bij vragen of onduidelijkheden kunt u ons gerust bereiken.\n\n` +
      `Met vriendelijke groet`;
    return { subject, body };
  })();

  // Laatste webhook-status uit events
  const latestWebhookStatus = paymentEvents.find(
    (e) => e.event_type === "webhook" || e.event_type === "polled",
  )?.status ?? null;
  const mollieBadgeStatus: string | null = invoice.status === "paid"
    ? "paid"
    : currentPaymentLink
      ? latestWebhookStatus ?? "open"
      : latestWebhookStatus === "revoked" || paymentEvents.some((e) => e.event_type === "revoked")
        ? null
        : null;

  async function handleRefreshMollie() {
    if (!invExt.mollie_payment_id || !invoice) return;
    setRefreshingMollie(true);
    try {
      const r = await refreshMollieFn({ data: { invoice_id: invoice.id } });
      toast.success(`Mollie status: ${r.status ?? "onbekend"}`);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kon status niet ophalen");
    } finally {
      setRefreshingMollie(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link to={backTo}>
              <ArrowLeft className="mr-1 h-4 w-4" /> {backLabel}
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {invoice.invoice_number}
            <Badge variant="outline" className={`ml-3 ${STATUS_COLOR[invoice.status]}`}>
              {t(`invoices.status.${invoice.status}`)}
            </Badge>
            {mollieBadgeStatus && (
              <Badge variant="outline" className={`ml-2 ${MOLLIE_BADGE_COLOR[mollieBadgeStatus] ?? "bg-muted"}`}>
                Mollie: {MOLLIE_BADGE_LABEL[mollieBadgeStatus] ?? mollieBadgeStatus}
              </Badge>
            )}
            {preferredMethod && (
              <Badge variant="secondary" className="ml-2 capitalize">
                {preferredMethod}
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {invoice.client_name ?? "—"} · {new Date(invoice.issue_date).toLocaleDateString(i18n.resolvedLanguage ?? "nl")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye className="mr-1 h-4 w-4" /> Voorbeeld
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDownloadOpen(true)}>
            <Download className="mr-1 h-4 w-4" /> {t("invoices.download_pdf")}
          </Button>
          {invoice.status === "paid" && (
            <>
              <Button variant="outline" size="sm" onClick={downloadReceipt}>
                <Download className="mr-1 h-4 w-4" /> Betaalbewijs
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={markUnpaid}
                className="border-amber-500/50 text-amber-700 dark:text-amber-300"
              >
                Terug op onbetaald
              </Button>
            </>
          )}
          <Button size="sm" onClick={() => { setEmailMode("normal"); setEmailOpen(true); }}>
            <Mail className="mr-1 h-4 w-4" /> {t("invoices.email")}
          </Button>
          {isUnpaid && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setEmailMode("reminder"); setEmailOpen(true); }}
              className={daysOverdue > 0 ? "border-red-500/50 text-red-700 dark:text-red-300" : ""}
            >
              <Send className="mr-1 h-4 w-4" />
              {daysOverdue > 0 ? `Herinnering (${daysOverdue}d over)` : "Herinnering"}
            </Button>
          )}
          {isDraft && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1 h-4 w-4" /> {t("invoices.edit")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-1 h-4 w-4" />
            {isDraft ? t("invoices.delete") : t("invoices.cancel_invoice")}
          </Button>
        </div>
      </div>

      <section className="rounded-lg border bg-card p-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Factuur</h2>
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Factuurnummer:</dt>
                <dd className="font-medium">{invoice.invoice_number}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Factuurdatum:</dt>
                <dd>{new Date(invoice.issue_date).toLocaleDateString(i18n.resolvedLanguage ?? "nl")}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Vervaldatum:</dt>
                <dd>{new Date(invoice.due_date).toLocaleDateString(i18n.resolvedLanguage ?? "nl")}</dd>
              </div>
            </dl>
          </div>
          <address className="not-italic text-right text-sm leading-relaxed">
            {invoice.client_name && (
              <div className="font-semibold">{invoice.client_name}</div>
            )}
            {client?.address_line1 && (
              <div className="text-foreground/90">{client.address_line1}</div>
            )}
            {(client?.postal_code || client?.city) && (
              <div className="text-foreground/90">
                {[client?.postal_code, client?.city].filter(Boolean).join(" ")}
              </div>
            )}
            {client?.email && (
              <div className="mt-2 text-muted-foreground">{client.email}</div>
            )}
          </address>
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t pt-4">
          <div className="space-y-2 text-xs text-muted-foreground">
            {invoice.last_emailed_at && (
              <div>Laatst gemaild: {new Date(invoice.last_emailed_at).toLocaleString(i18n.resolvedLanguage ?? "nl")}</div>
            )}
            <PaymentStatusEditor invoice={invoice} onChanged={load} />
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-muted-foreground">{t("invoices.total")}</div>
            <div className="text-xl font-semibold tabular-nums">{eur.format(invoice.total_cents / 100)}</div>
            <div className="text-xs text-muted-foreground">
              {t("acc.inv.subtotal")}: {eur.format(invoice.subtotal_cents / 100)} · BTW: {eur.format(invoice.vat_cents / 100)}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border">
        <div className="border-b px-4 py-2 text-sm font-semibold">{t("invoices.lines")}</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Omschrijving</TableHead>
              <TableHead className="w-20 text-right">Aantal</TableHead>
              <TableHead className="w-32 text-right">Prijs</TableHead>
              <TableHead className="w-20 text-right">BTW</TableHead>
              <TableHead className="w-32 text-right">Totaal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.description}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(l.quantity)}</TableCell>
                <TableCell className="text-right tabular-nums">{eur.format(l.unit_price_cents / 100)}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(l.vat_rate)}%</TableCell>
                <TableCell className="text-right tabular-nums">{eur.format(l.total_cents / 100)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="text-sm font-semibold">
            <Paperclip className="mr-1 inline h-4 w-4" /> {t("invoices.attachments")}
          </div>
          <div>
            <input
              type="file"
              ref={fileRef}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleAttachmentUpload(f);
                e.target.value = "";
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" /> {t("invoices.upload_attachment")}
            </Button>
          </div>
        </div>
        {attachments.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t("invoices.no_attachments")}
          </div>
        ) : (
          <ul className="divide-y">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <button className="text-left hover:underline" onClick={() => openAttachment(a)}>
                  {a.filename}
                  {a.size_bytes ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({Math.round(a.size_bytes / 1024)} KB)
                    </span>
                  ) : null}
                </button>
                <Button variant="ghost" size="icon" onClick={() => deleteAttachment(a)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ManualPaymentLinkPanel
        invoiceId={invoice.id}
        currentUrl={invExt.payment_link_url ?? null}
        onSaved={() => void load()}
      />



      <section className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="text-sm font-semibold">Mollie betaling</div>
          <div className="flex items-center gap-2">
            {currentPaymentLink && (
              <div className="rounded bg-white p-1" title="Scan om te betalen">
                <QRCodeSVG value={currentPaymentLink} size={56} level="M" />
              </div>
            )}
            {invExt.mollie_payment_id && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshMollie}
                disabled={refreshingMollie}
              >
                {refreshingMollie ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                Status verversen
              </Button>
            )}
          </div>
        </div>
        {paymentEvents.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nog geen betalings-events. Maak een betaallink aan via het factuurvoorbeeld.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Methode</TableHead>
                <TableHead className="text-right">Bedrag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentEvents.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString(i18n.resolvedLanguage ?? "nl")}
                  </TableCell>
                  <TableCell className="text-sm capitalize">{e.event_type}</TableCell>
                  <TableCell>
                    {e.status && (
                      <Badge
                        variant="outline"
                        className={MOLLIE_BADGE_COLOR[e.status] ?? "bg-muted"}
                      >
                        {MOLLIE_BADGE_LABEL[e.status] ?? e.status}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs capitalize text-muted-foreground">
                    {e.method ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {e.amount_cents != null ? eur.format(e.amount_cents / 100) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>


      <section className="rounded-lg border">
        <div className="border-b px-4 py-2 text-sm font-semibold">{t("invoices.email_log")}</div>
        {emailLog.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t("invoices.no_email_log")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Aan</TableHead>
                <TableHead>Onderwerp</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emailLog.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString(i18n.resolvedLanguage ?? "nl")}
                  </TableCell>
                  <TableCell className="text-sm">{r.to_email}</TableCell>
                  <TableCell className="text-sm">{r.subject}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        r.status === "sent"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : r.status === "failed"
                            ? "bg-red-500/15 text-red-700 dark:text-red-300"
                            : "bg-muted"
                      }
                    >
                      {r.status}
                    </Badge>
                    {r.error && <div className="mt-1 text-xs text-red-600">{r.error}</div>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* Download rename dialog */}
      <Dialog open={downloadOpen} onOpenChange={setDownloadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("invoices.download_pdf")}</DialogTitle>
            <DialogDescription>{t("invoices.rename_before_download")}</DialogDescription>
          </DialogHeader>
          <DownloadForm
            defaultName={suggestedFilename}
            onCancel={() => setDownloadOpen(false)}
            onConfirm={(name) => {
              downloadPdf(name);
              setDownloadOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Email dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {emailMode === "reminder" ? "Betaalherinnering versturen" : t("invoices.compose_email")}
            </DialogTitle>
            <DialogDescription>
              {invoice.invoice_number} — {invoice.client_name}
              {emailMode === "reminder" && daysOverdue > 0 ? ` · ${daysOverdue} dagen over vervaldatum` : ""}
            </DialogDescription>
          </DialogHeader>
          <EmailForm
            key={emailMode}
            invoice={invoice}
            defaultTo={client?.email ?? ""}
            defaultFilename={suggestedFilename}
            initialSubject={emailMode === "reminder" ? reminderDefaults.subject : undefined}
            initialBody={emailMode === "reminder" ? reminderDefaults.body : undefined}
            attachments={attachments}
            lines={lines}
            organizationName={org?.name ?? null}
            buildPdf={buildPdf}
            buildTemplatePdfBlob={buildTemplatePdfBlob}
            currentPaymentLink={currentPaymentLink}
            preferredMethod={preferredMethod}
            onSent={(to) => {
              setEmailOpen(false);
              setConfirmOpen({ to });
              void load();
            }}
            emailFn={emailFn}
          />
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog */}
      <Dialog open={!!confirmOpen} onOpenChange={(o) => !o && setConfirmOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("invoices.email_confirm_title")}</DialogTitle>
            <DialogDescription>
              {t("invoices.email_confirm_body", { to: confirmOpen?.to ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setConfirmOpen(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("invoices.edit")} — {invoice.invoice_number}</DialogTitle>
            <DialogDescription>{t("invoices.edit_disabled_note")}</DialogDescription>
          </DialogHeader>
          <EditInvoiceForm
            invoice={invoice}
            lines={lines}
            onCancel={() => setEditOpen(false)}
            onSaved={() => {
              setEditOpen(false);
              void load();
            }}
          />
        </DialogContent>
      </Dialog>

      <InvoicePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        invoiceId={invoice.id}
        invoiceStatus={invoice.status}
        defaultPreferredMethod={preferredMethod}
        onPaymentLinkChanged={() => void load()}
        data={{
          organization: {
            name: org?.name ?? null,
            street: [org?.address_line1, org?.address_line2].filter(Boolean).join(" "),
            postal_city: [org?.postal_code, org?.city].filter(Boolean).join(" "),
            country: org?.country ?? null,
            phone: org?.phone ?? null,
            website: org?.website ?? null,
            kvk: org?.kvk_number ?? null,
            vat: org?.tax_number ?? null,
            iban: org?.iban ?? null,
            account_holder: org?.account_holder ?? org?.name ?? null,
            logo_url: org?.brand_logo_url ?? org?.logo_url ?? null,
          },
          client: {
            customer_number: null,
            company_name: invoice.client_name,
            street: client?.address_line1 ?? null,
            postal_city: [client?.postal_code, client?.city].filter(Boolean).join(" "),
          },
          invoice_number: invoice.invoice_number,
          issue_date: invoice.issue_date,
          due_date: invoice.due_date,
          currency: invoice.currency ?? "EUR",
          language: i18n.resolvedLanguage ?? "nl",
          precomputed_subtotal_cents: invoice.subtotal_cents,
          precomputed_vat_cents: invoice.vat_cents,
          precomputed_total_cents: invoice.total_cents,
          payment_link_url:
            (invoice as unknown as { payment_link_url?: string | null; mollie_checkout_url?: string | null })
              .payment_link_url ??
            (invoice as unknown as { mollie_checkout_url?: string | null }).mollie_checkout_url ??
            null,
          lines: lines.map((l) => ({
            line_type:
              ((l as unknown as { line_type?: InvoiceTemplateLineKind }).line_type ??
                "item") as InvoiceTemplateLineKind,
            description: l.description,
            quantity: Number(l.quantity),
            unit_price_cents: l.unit_price_cents,
            vat_rate: Number(l.vat_rate),
            subtotal_cents: l.subtotal_cents,
            vat_cents: l.vat_cents,
            total_cents: l.total_cents,
          })),
        } satisfies InvoiceTemplateProps}
      />
    </div>
  );
}

function PaymentStatusEditor({ invoice, onChanged }: { invoice: Invoice; onChanged: () => void }) {
  const { i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(
    invoice.paid_at ? new Date(invoice.paid_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [saving, setSaving] = useState(false);

  async function save(nextStatus: InvoiceStatus, paidAt: string | null) {
    setSaving(true);
    const patch: { status: InvoiceStatus; paid_at: string | null } = {
      status: nextStatus,
      paid_at: paidAt,
    };
    const { error } = await supabase.from("invoices").update(patch).eq("id", invoice.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditing(false);
    toast.success("Betaalstatus bijgewerkt");
    onChanged();
  }

  const isPaid = invoice.status === "paid";

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-medium text-foreground">Betaalstatus:</span>
      <Badge variant="outline" className={STATUS_COLOR[invoice.status]}>
        {isPaid ? "Betaald" : invoice.status}
      </Badge>
      {isPaid && invoice.paid_at && !editing && (
        <span>op {new Date(invoice.paid_at).toLocaleDateString(i18n.resolvedLanguage ?? "nl")}</span>
      )}
      {editing ? (
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-7 w-[140px]"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={saving}
            onClick={() => save("paid", new Date(date).toISOString())}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(false)}>
            Annuleer
          </Button>
        </div>
      ) : (
        <>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(true)}>
            {isPaid ? "Datum wijzigen" : "Markeer als betaald"}
          </Button>
          {isPaid && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => save("sent", null)}
              disabled={saving}
            >
              Ongedaan maken
            </Button>
          )}
        </>
      )}
    </div>
  );
}


function EditInvoiceForm({
  invoice,
  lines: initialLines,
  onCancel,
  onSaved,
}: {
  invoice: Invoice;
  lines: InvoiceLine[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const updateFn = useServerFn(updateInvoice);
  const [clientName, setClientName] = useState(invoice.client_name ?? "");
  const [issueDate, setIssueDate] = useState(invoice.issue_date);
  const [dueDate, setDueDate] = useState(invoice.due_date);
  const [rows, setRows] = useState(
    initialLines.map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unit_price_cents: l.unit_price_cents,
      vat_rate: Number(l.vat_rate),
    })),
  );
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateFn({
        data: {
          invoice_id: invoice.id,
          client_id: invoice.client_id,
          client_name: clientName.trim(),
          issue_date: issueDate,
          due_date: dueDate,
          lines: rows,
        },
      });
      toast.success(t("invoices.updated"));
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fout");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-3">
          <Label>Klant</Label>
          <Input value={clientName} onChange={(e) => setClientName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>{t("invoices.issue_date")}</Label>
          <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>{t("invoices.due_date")}</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Omschrijving</TableHead>
              <TableHead className="w-20 text-right">Aantal</TableHead>
              <TableHead className="w-28 text-right">Prijs (€)</TableHead>
              <TableHead className="w-20 text-right">BTW %</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Input
                    value={r.description}
                    onChange={(e) => {
                      const n = [...rows];
                      n[i] = { ...r, description: e.target.value };
                      setRows(n);
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.001"
                    className="text-right"
                    value={r.quantity}
                    onChange={(e) => {
                      const n = [...rows];
                      n[i] = { ...r, quantity: Number(e.target.value) };
                      setRows(n);
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    className="text-right"
                    value={(r.unit_price_cents / 100).toString()}
                    onChange={(e) => {
                      const n = [...rows];
                      n[i] = { ...r, unit_price_cents: Math.round(Number(e.target.value) * 100) };
                      setRows(n);
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="1"
                    className="text-right"
                    value={r.vat_rate}
                    onChange={(e) => {
                      const n = [...rows];
                      n[i] = { ...r, vat_rate: Number(e.target.value) };
                      setRows(n);
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    disabled={rows.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRows([...rows, { description: "", quantity: 1, unit_price_cents: 0, vat_rate: 21 }])}
        >
          Regel toevoegen
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Annuleren</Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Opslaan
          </Button>
        </div>
      </div>
    </form>
  );
}

function DownloadForm({
  defaultName,
  onCancel,
  onConfirm,
}: {
  defaultName: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const clean = name.trim().endsWith(".pdf") ? name.trim() : `${name.trim()}.pdf`;
        onConfirm(clean);
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label>Bestandsnaam</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuleren
        </Button>
        <Button type="submit">
          <Download className="mr-1 h-4 w-4" /> Download
        </Button>
      </DialogFooter>
    </form>
  );
}

function EmailForm({
  invoice,
  defaultTo,
  defaultFilename,
  initialSubject,
  initialBody,
  attachments,
  lines: invoiceLines,
  organizationName,
  buildPdf,
  buildTemplatePdfBlob,
  emailFn,
  currentPaymentLink,
  preferredMethod,
  onSent,
}: {
  invoice: Invoice;
  defaultTo: string;
  defaultFilename: string;
  initialSubject?: string;
  initialBody?: string;
  attachments: AttachmentRow[];
  lines: InvoiceLine[];
  organizationName: string | null;
  buildPdf: () => ReturnType<typeof buildInvoicePdf> | null;
  buildTemplatePdfBlob?: () => Promise<Blob>;
  emailFn: ReturnType<typeof useServerFn<typeof emailInvoice>>;
  currentPaymentLink: string | null;
  preferredMethod: MolliePaymentMethod | null;
  onSent: (to: string) => void;
}) {
  const { t } = useTranslation();
  const createMollieFn = useServerFn(createMollieInvoicePayment);
  const suggestFn = useServerFn(suggestInvoiceEmail);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiHint, setAiHint] = useState("");
  const [aiTone, setAiTone] = useState<"vriendelijk" | "zakelijk" | "kort">("vriendelijk");
  const [aiLoading, setAiLoading] = useState(false);
  const canPay = invoice.status !== "paid" && invoice.status !== "cancelled" && (invoice.total_cents ?? 0) > 0;
  const [includePayLink, setIncludePayLink] = useState<boolean>(canPay);
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(initialSubject ?? `Factuur {{invoice_number}}`);
  const [body, setBody] = useState(
    initialBody ??
      `Beste {{client_name}},\n\nBijgevoegd vind je factuur {{invoice_number}} van {{total}}. De vervaldatum is {{due_date}}.\n\nMet vriendelijke groet`,
  );
  const [filename, setFilename] = useState(defaultFilename);
  const [extraChecked, setExtraChecked] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<
    | { type: "success"; to: string }
    | { type: "error"; message: string }
    | null
  >(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Email templates (gedeeld per organisatie via outreach_message_templates, channel='email')
  type EmailTpl = { id: string; name: string; subject: string; body: string };
  const [templates, setTemplates] = useState<EmailTpl[]>([]);
  const [selectedTplId, setSelectedTplId] = useState<string>("");
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [newTplName, setNewTplName] = useState("");
  const [tplLoading, setTplLoading] = useState(false);

  const reloadTemplates = useCallback(async () => {
    if (!invoice.organization_id) return;
    setTplLoading(true);
    const { data, error } = await supabase
      .from("outreach_message_templates")
      .select("id, name, subject, body")
      .eq("organization_id", invoice.organization_id)
      .eq("channel", "email")
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });
    setTplLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTemplates(
      (data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        subject: r.subject ?? "",
        body: r.body ?? "",
      })),
    );
  }, [invoice.organization_id]);

  useEffect(() => {
    reloadTemplates();
  }, [reloadTemplates]);

  const applyTemplate = (id: string) => {
    setSelectedTplId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      setSubject(tpl.subject);
      setBody(tpl.body);
    }
  };

  const saveTemplate = async () => {
    const name = newTplName.trim();
    if (!name) {
      toast.error("Geef de template een naam");
      return;
    }
    if (!invoice.organization_id) return;
    const existing = templates.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      const { error } = await supabase
        .from("outreach_message_templates")
        .update({ subject, body, name })
        .eq("id", existing.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setSelectedTplId(existing.id);
    } else {
      const { data, error } = await supabase
        .from("outreach_message_templates")
        .insert({
          organization_id: invoice.organization_id,
          name,
          channel: "email",
          subject,
          body,
          is_default: false,
        })
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      setSelectedTplId(data.id);
    }
    await reloadTemplates();
    setNewTplName("");
    setSaveTplOpen(false);
    toast.success(`Template "${name}" opgeslagen — beschikbaar voor het hele team`);
  };

  const deleteTemplate = async () => {
    if (!selectedTplId) return;
    const tpl = templates.find((t) => t.id === selectedTplId);
    if (!tpl) return;
    if (!confirm(`Template "${tpl.name}" verwijderen? Deze verdwijnt voor het hele team.`)) return;
    const { error } = await supabase
      .from("outreach_message_templates")
      .delete()
      .eq("id", selectedTplId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSelectedTplId("");
    await reloadTemplates();
    toast.success("Template verwijderd");
  };

  const previewPayLink = includePayLink && canPay
    ? (currentPaymentLink ?? "https://www.mollie.com/checkout/… (wordt aangemaakt bij verzenden)")
    : null;
  const previewVars: Record<string, string> = {
    client_name: invoice.client_name ?? "",
    invoice_number: invoice.invoice_number ?? "",
    total: formatCents(invoice.total_cents, "nl", invoice.currency ?? "EUR"),
    subtotal: formatCents(invoice.subtotal_cents, "nl", invoice.currency ?? "EUR"),
    vat: formatCents(invoice.vat_cents, "nl", invoice.currency ?? "EUR"),
    due_date: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("nl") : "",
    issue_date: invoice.issue_date ? new Date(invoice.issue_date).toLocaleDateString("nl") : "",
    payment_link: previewPayLink ?? "",
  };
  const applyPreviewVars = (s: string) =>
    s.replace(/\{\{?\s*(\w+)\s*\}?\}/g, (m, k: string) =>
      Object.prototype.hasOwnProperty.call(previewVars, k) ? previewVars[k] : m,
    );
  const previewSubjectBase = applyPreviewVars(subject);
  const previewBodyBase = applyPreviewVars(body);
  const previewSubject = previewPayLink && !previewSubjectBase.includes(previewPayLink)
    ? `${previewSubjectBase} — Betaal online: ${previewPayLink}`
    : previewSubjectBase;
  const previewBody = previewPayLink && !previewBodyBase.includes(previewPayLink)
    ? `${previewBodyBase}\n\nBetaal direct online via Mollie:\n${previewPayLink}`
    : previewBodyBase;

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      toast.success(`"${label}" gekopieerd naar klembord`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Kon niet kopiëren naar klembord");
    }
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSendStatus(null);
    // Prefer the same rendered-template PDF the user sees in the preview.
    // Fall back to the legacy jsPDF-drawn version only if no template
    // renderer is wired up.
    let pdfBlob: Blob | null = null;
    if (!buildTemplatePdfBlob) {
      const doc = buildPdf();
      if (!doc) {
        const msg = "PDF kon niet worden gebouwd";
        toast.error(msg);
        setSendStatus({ type: "error", message: msg });
        return;
      }
      pdfBlob = doc.output("blob") as Blob;
    }
    setSending(true);
    try {
      // Zorg eerst voor een Mollie betaallink indien gewenst
      let payLink: string | null = null;
      if (includePayLink && canPay) {
        try {
          if (currentPaymentLink) {
            payLink = currentPaymentLink;
          } else {
            const r = await createMollieFn({
              data: {
                invoice_id: invoice.id,
                preferred_method: preferredMethod ?? null,
                restrict: false,
              },
            });
            payLink = r.checkoutUrl;
          }
        } catch (err) {
          const msg = "Kon geen betaallink aanmaken: " + (err instanceof Error ? err.message : String(err));
          toast.error(msg);
          setSendStatus({ type: "error", message: msg });
          setSending(false);
          return;
        }
      }

      const vars: Record<string, string> = {
        client_name: invoice.client_name ?? "",
        invoice_number: invoice.invoice_number ?? "",
        total: formatCents(invoice.total_cents, "nl", invoice.currency ?? "EUR"),
        subtotal: formatCents(invoice.subtotal_cents, "nl", invoice.currency ?? "EUR"),
        vat: formatCents(invoice.vat_cents, "nl", invoice.currency ?? "EUR"),
        due_date: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("nl") : "",
        issue_date: invoice.issue_date ? new Date(invoice.issue_date).toLocaleDateString("nl") : "",
        payment_link: payLink ?? "",
      };
      const applyVars = (s: string) =>
        s.replace(/\{\{?\s*(\w+)\s*\}?\}/g, (m, k: string) =>
          Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m,
        );

      const subjectFilled = applyVars(subject.trim());
      const bodyFilled = applyVars(body.trim());
      const finalSubject = payLink && !subjectFilled.includes(payLink)
        ? `${subjectFilled} — Betaal online: ${payLink}`
        : subjectFilled;
      const finalBody = payLink && !bodyFilled.includes(payLink)
        ? `${bodyFilled}\n\nBetaal direct online via Mollie:\n${payLink}`
        : bodyFilled;

      // Upload PDF to mail-attachments bucket. When we have the template
      // renderer, generate the blob now so the emailed PDF matches the
      // on-screen preview exactly.
      if (!pdfBlob && buildTemplatePdfBlob) {
        pdfBlob = await buildTemplatePdfBlob();
      }
      if (!pdfBlob) throw new Error("PDF kon niet worden gebouwd");
      const uploadPath = `${invoice.organization_id}/invoice-${invoice.id}-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("mail-attachments")
        .upload(uploadPath, pdfBlob, { contentType: "application/pdf", upsert: false });
      if (upErr) throw new Error(upErr.message);

      const cleanName = filename.trim().endsWith(".pdf") ? filename.trim() : `${filename.trim()}.pdf`;
      const toList = to.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      const ccList = cc.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      const extraPaths = attachments.filter((a) => extraChecked[a.id]).map((a) => a.storage_path);

      await emailFn({
        data: {
          invoice_id: invoice.id,
          to: toList,
          cc: ccList,
          subject: finalSubject,
          body: finalBody,
          pdf_storage_path: uploadPath,
          pdf_filename: cleanName,
          extra_attachment_paths: extraPaths,
          mark_as_sent: true,
        },
      });
      const toJoined = toList.join(", ");
      toast.success(t("invoices.email_sent", { to: toJoined }));
      setSendStatus({ type: "success", to: toJoined });
      onSent(toJoined);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(t("invoices.email_failed", { msg }));
      setSendStatus({ type: "error", message: msg });
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            E-mailtemplate {tplLoading && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
          </Label>
          <Link
            to="/mail/templates"
            className="text-[11px] font-medium text-primary hover:underline"
          >
            Beheer templates →
          </Link>
        </div>
        {saveTplOpen ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              autoFocus
              value={newTplName}
              onChange={(e) => setNewTplName(e.target.value)}
              placeholder="Templatenaam"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveTemplate();
                }
              }}
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={saveTemplate}>
                <Save className="mr-1 h-3.5 w-3.5" /> Opslaan
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSaveTplOpen(false);
                  setNewTplName("");
                }}
              >
                Annuleer
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              value={selectedTplId || undefined}
              onValueChange={applyTemplate}
              disabled={templates.length === 0}
            >
              <SelectTrigger className="flex-1">
                <SelectValue
                  placeholder={templates.length === 0 ? "Nog geen templates opgeslagen" : "Kies een template…"}
                />
              </SelectTrigger>
              <SelectContent>
                {templates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setNewTplName(
                    templates.find((t) => t.id === selectedTplId)?.name ?? "",
                  );
                  setSaveTplOpen(true);
                }}
              >
                <Save className="mr-1 h-3.5 w-3.5" /> Opslaan als template
              </Button>
              {selectedTplId && (
                <Button type="button" size="sm" variant="ghost" onClick={deleteTemplate}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>{t("invoices.to")}</Label>
        <Input value={to} onChange={(e) => setTo(e.target.value)} required placeholder="klant@voorbeeld.nl" />
      </div>
      <div className="space-y-1.5">
        <Label>{t("invoices.cc")}</Label>
        <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="optioneel" />
      </div>
      <div className="space-y-1.5">
        <Label>{t("invoices.subject")}</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label>{t("invoices.message")}</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => setAiOpen((v) => !v)}
          >
            <Sparkles className="mr-1 h-3 w-3" />
            {aiOpen ? "AI verbergen" : "AI-hulp"}
          </Button>
        </div>
        {aiOpen && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              AI stelt een begeleidende tekst voor op basis van deze factuur (klant, bedrag,
              vervaldatum en regelomschrijvingen). Je kunt hieronder extra context meegeven —
              bijvoorbeeld waar de factuur voor is of een periode.
            </p>
            <Textarea
              rows={2}
              value={aiHint}
              onChange={(e) => setAiHint(e.target.value)}
              placeholder="Extra context (optioneel), bv. 'Maandelijkse hosting mei 2026' of 'Eenmalige installatie van servers'"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs">Toon</Label>
              <Select value={aiTone} onValueChange={(v) => setAiTone(v as typeof aiTone)}>
                <SelectTrigger className="h-8 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vriendelijk">Vriendelijk</SelectItem>
                  <SelectItem value="zakelijk">Zakelijk</SelectItem>
                  <SelectItem value="kort">Kort & bondig</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                onClick={async () => {
                  setAiLoading(true);
                  try {
                    const r = await suggestFn({
                      data: {
                        client_name: invoice.client_name ?? null,
                        invoice_number: invoice.invoice_number ?? null,
                        total: formatCents(
                          invoice.total_cents,
                          "nl",
                          invoice.currency ?? "EUR",
                        ),
                        due_date: invoice.due_date
                          ? new Date(invoice.due_date).toLocaleDateString("nl")
                          : null,
                        issue_date: invoice.issue_date
                          ? new Date(invoice.issue_date).toLocaleDateString("nl")
                          : null,
                        organization_name: organizationName,
                        line_descriptions: invoiceLines
                          .map((l) => l.description ?? "")
                          .filter((d) => d.trim().length > 0),
                        extra_context: aiHint.trim() || undefined,
                        tone: aiTone,
                      },
                    });
                    setSubject(r.subject);
                    setBody(r.body);
                    toast.success("AI-tekst ingevuld — pas naar wens aan");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "AI mislukt");
                  } finally {
                    setAiLoading(false);
                  }
                }}
                disabled={aiLoading}
              >
                {aiLoading ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-3 w-3" />
                )}
                Genereer tekst
              </Button>
            </div>
          </div>
        )}
        <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} required />
        <p className="text-xs text-muted-foreground">
          Variabelen in onderwerp en bericht:{" "}
          <code>{"{{client_name}}"}</code>, <code>{"{{invoice_number}}"}</code>,{" "}
          <code>{"{{total}}"}</code>, <code>{"{{subtotal}}"}</code>, <code>{"{{vat}}"}</code>,{" "}
          <code>{"{{due_date}}"}</code>, <code>{"{{issue_date}}"}</code>,{" "}
          <code>{"{{payment_link}}"}</code>.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Bijlage-naam</Label>
        <Input value={filename} onChange={(e) => setFilename(e.target.value)} />
      </div>
      {attachments.length > 0 && (
        <div className="space-y-1.5">
          <Label>{t("invoices.attach_extra")}</Label>
          <div className="space-y-1 rounded border p-2 text-sm">
            {attachments.map((a) => (
              <label key={a.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!extraChecked[a.id]}
                  onChange={(e) => setExtraChecked((s) => ({ ...s, [a.id]: e.target.checked }))}
                />
                {a.filename}
              </label>
            ))}
          </div>
        </div>
      )}
      {canPay && (
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <label className="flex items-start gap-2">
            <Checkbox
              checked={includePayLink}
              onCheckedChange={(c) => setIncludePayLink(c === true)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Mollie betaallink toevoegen</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {currentPaymentLink
                  ? "Bestaande betaallink wordt hergebruikt en toegevoegd aan onderwerp en bericht."
                  : "Er wordt automatisch een nieuwe betaallink aangemaakt en toegevoegd aan onderwerp en bericht."}
              </span>
            </span>
          </label>
        </div>
      )}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Voorbeeld</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => copyText(`Onderwerp: ${previewSubject}\n\n${previewBody}`, "Voorbeeld e-mail")}
          >
            {copiedField === "Voorbeeld e-mail" ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
            Kopieer voorbeeld
          </Button>
        </div>
        <div className="rounded-md border bg-background">
          <div className="flex items-start justify-between gap-2 border-b px-3 py-2 text-xs">
            <div className="min-w-0">
              <span className="text-muted-foreground">Onderwerp: </span>
              <span className="font-medium">{previewSubject || <em className="text-muted-foreground">(leeg)</em>}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 px-1.5"
              onClick={() => copyText(previewSubject, "Onderwerp")}
              title="Onderwerp kopiëren"
            >
              {copiedField === "Onderwerp" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
          <div className="relative">
            <div className="max-h-64 overflow-y-auto whitespace-pre-wrap px-3 py-2 pr-10 text-sm">
              {previewBody || <em className="text-muted-foreground">(leeg)</em>}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-2 top-2 h-6 px-1.5"
              onClick={() => copyText(previewBody, "Bericht")}
              title="Bericht kopiëren"
            >
              {copiedField === "Bericht" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
          {previewPayLink && (
            <div className="flex items-start justify-between gap-2 border-t bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
              <span className="min-w-0">
                Betaallink in voorbeeld: <span className="font-mono break-all">{previewPayLink}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 px-1.5"
                onClick={() => copyText(previewPayLink, "Betaallink")}
                title="Betaallink kopiëren"
              >
                {copiedField === "Betaallink" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          )}
        </div>
      </div>
      {sendStatus && (
        <div
          className={
            sendStatus.type === "success"
              ? "flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"
              : "flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          }
          role={sendStatus.type === "error" ? "alert" : "status"}
        >
          {sendStatus.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              {sendStatus.type === "success" ? "E-mail verzonden" : "Verzenden mislukt"}
            </div>
            <div className="mt-0.5 break-words text-xs opacity-90">
              {sendStatus.type === "success"
                ? `Verzonden naar ${sendStatus.to}`
                : sendStatus.message}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 px-1.5 text-xs"
            onClick={() => setSendStatus(null)}
          >
            Sluit
          </Button>
        </div>
      )}
      <DialogFooter>
        <Button type="submit" disabled={sending}>
          {sending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          <Mail className="mr-1 h-4 w-4" /> {t("invoices.send")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ManualPaymentLinkPanel({
  invoiceId,
  currentUrl,
  onSaved,
}: {
  invoiceId: string;
  currentUrl: string | null;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(!!currentUrl);
  const [url, setUrl] = useState(currentUrl ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(!!currentUrl);
    setUrl(currentUrl ?? "");
  }, [currentUrl]);

  const trimmedUrl = url.trim();
  const urlError: string | null = (() => {
    if (!enabled) return null;
    if (!trimmedUrl) return null;
    if (trimmedUrl.length > 500) return "URL mag maximaal 500 tekens zijn";
    try {
      const u = new URL(trimmedUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        return "URL moet beginnen met http:// of https://";
      }
      if (!u.hostname.includes(".")) return "Ongeldige hostnaam";
      return null;
    } catch {
      return "Ongeldige URL (bijv. https://www.mollie.com/…)";
    }
  })();
  const canSave = !enabled || (!!trimmedUrl && !urlError);

  async function save() {
    if (enabled) {
      if (!trimmedUrl) return toast.error("Vul een betaallink-URL in");
      if (urlError) return toast.error(urlError);
    }
    setSaving(true);
    const { error } = await supabase
      .from("invoices")
      .update({ payment_link_url: enabled ? trimmedUrl : null })
      .eq("id", invoiceId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(enabled ? "Betaallink opgeslagen" : "Betaallink verwijderd");
    onSaved();
  }

  return (
    <section className="rounded-lg border">
      <div className="border-b px-4 py-2 text-sm font-semibold flex items-center justify-between gap-3">
        <span>Handmatige betaallink (bijv. Mollie)</span>
        {enabled ? (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent text-xs">
            <Link2 className="mr-1 h-3 w-3" /> Actief
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground text-xs">
            <Link2Off className="mr-1 h-3 w-3" /> Inactief
          </Badge>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <Label className="text-xs">Betaallink actief</Label>
          <Select value={String(enabled)} onValueChange={(v) => setEnabled(v === "true")}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="false">Uit</SelectItem>
              <SelectItem value="true">Aan</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[11px] text-muted-foreground">
            {enabled
              ? "Deze link wordt op de factuur en in mails getoond."
              : "Er wordt geen betaallink op deze factuur getoond."}
          </span>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Betaallink-URL</Label>
          <Input
            type="url"
            placeholder="https://www.mollie.com/paymentscreen/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={!enabled}
            aria-invalid={!!urlError}
            className={urlError ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {urlError ? (
            <p className="text-[11px] text-destructive">{urlError}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Deze link verschijnt op de factuur en in verzendmails. Voor abonnementen kun je een vaste link instellen op het contract, dan gaat die automatisch mee met elke nieuwe factuur.
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving || !canSave}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Opslaan
          </Button>
        </div>
      </div>
    </section>
  );
}
