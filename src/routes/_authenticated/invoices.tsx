import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({ meta: [{ title: "Facturen" }] }),
  component: InvoicesPage,
});

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

const STATUS: InvoiceStatus[] = ["draft", "sent", "paid", "overdue", "cancelled"];

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft: "bg-muted text-foreground",
  sent: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  overdue: "bg-red-500/15 text-red-700 dark:text-red-300",
  cancelled: "bg-muted text-muted-foreground",
};

function InvoicesPage() {
  const { t, i18n } = useTranslation();
  const { currentOrganizationId, currentOrganization, loading: wsLoading } = useWorkspace();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const eur = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en-IE" : "nl-NL", {
        style: "currency",
        currency: "EUR",
      }),
    [i18n.resolvedLanguage],
  );

  async function load() {
    if (!currentOrganizationId) {
      setInvoices([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("organization_id", currentOrganizationId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setInvoices((data ?? []) as Invoice[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!wsLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganizationId, wsLoading]);

  async function updateStatus(id: string, status: InvoiceStatus) {
    const prev = invoices;
    setInvoices((is) => is.map((i) => (i.id === id ? { ...i, status } : i)));
    const { error } = await supabase.from("invoices").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      setInvoices(prev);
    }
  }

  const totals = useMemo(() => {
    const t = { all: 0, paid: 0, open: 0 };
    invoices.forEach((i) => {
      const amt = Number(i.amount);
      t.all += amt;
      if (i.status === "paid") t.paid += amt;
      else if (i.status === "sent" || i.status === "overdue" || i.status === "draft") t.open += amt;
    });
    return t;
  }, [invoices]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {currentOrganization?.name ?? ""} — {t("invoices.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("invoices.subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label={t("invoices.total")} value={eur.format(totals.all)} />
        <SummaryCard label={t("invoices.paid")} value={eur.format(totals.paid)} />
        <SummaryCard label={t("invoices.open")} value={eur.format(totals.open)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          {t("invoices.empty")}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("invoices.number")}</TableHead>
                <TableHead>{t("invoices.issue_date")}</TableHead>
                <TableHead>{t("invoices.due_date")}</TableHead>
                <TableHead className="text-right">{t("invoices.amount")}</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(inv.issue_date).toLocaleDateString(i18n.resolvedLanguage ?? "nl")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(inv.due_date).toLocaleDateString(i18n.resolvedLanguage ?? "nl")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{eur.format(Number(inv.amount))}</TableCell>
                  <TableCell>
                    <Select value={inv.status} onValueChange={(v) => updateStatus(inv.id, v as InvoiceStatus)}>
                      <SelectTrigger className="h-7 w-[150px]">
                        <Badge variant="outline" className={STATUS_COLOR[inv.status]}>
                          {t(`invoices.status.${inv.status}`)}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {t(`invoices.status.${s}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
