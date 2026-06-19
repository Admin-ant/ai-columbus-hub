import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  Trash2,
  Download,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Receipt,
  BookOpen,
  Activity,
  LayoutDashboard,
  FileText,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/boekhouding")({
  head: () => ({ meta: [{ title: "Boekhouding" }] }),
  component: BoekhoudingPage,
});

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense" | "vat";

interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  vat_rate: number | null;
  is_vat_account: boolean;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  client_name: string | null;
  issue_date: string;
  due_date: string;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  organization_id: string;
}

interface LineForm {
  description: string;
  quantity: number;
  unit_price_cents: number;
  vat_rate: number;
  product_id: string | null;
}

interface ProductOption {
  id: string;
  name: string;
  unit_price_cents: number;
  vat_rate: number;
  pricing_type: "one_time" | "monthly_recurring" | "per_credit";
  description: string | null;
}

interface JournalLine {
  id: string;
  account_id: string;
  debit_cents: number;
  credit_cents: number;
  description: string | null;
}

interface JournalEntry {
  id: string;
  entry_date: string;
  description: string;
  invoice_id: string | null;
  journal_lines: JournalLine[];
}

interface SyncEvent {
  id: string;
  target: string;
  status: "pending" | "success" | "failed";
  payload: unknown;
  response: unknown;
  created_at: string;
  invoice_id: string | null;
}

const STATUS_COLOR: Record<InvoiceRow["status"], string> = {
  draft: "bg-muted text-foreground",
  sent: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  overdue: "bg-red-500/15 text-red-700 dark:text-red-300",
  cancelled: "bg-muted text-muted-foreground",
};

const ACCOUNT_TYPE_LABELS: Record<AccountType, { nl: string; en: string }> = {
  asset: { nl: "Activa", en: "Asset" },
  liability: { nl: "Passiva", en: "Liability" },
  equity: { nl: "Eigen vermogen", en: "Equity" },
  revenue: { nl: "Omzet", en: "Revenue" },
  expense: { nl: "Kosten", en: "Expense" },
  vat: { nl: "BTW", en: "VAT" },
};

const centsFmt = (cents: number, lang: string) =>
  new Intl.NumberFormat(lang === "en" ? "en-IE" : "nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format((cents ?? 0) / 100);

function BoekhoudingPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "nl";
  const { user } = useAuth();
  const { currentOrganizationId, currentOrganization, loading: wsLoading } = useWorkspace();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (!currentOrganizationId) {
      setAccounts([]);
      setInvoices([]);
      setEntries([]);
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [accRes, invRes, jeRes, syncRes] = await Promise.all([
      supabase
        .from("chart_of_accounts")
        .select("id,code,name,type,vat_rate,is_vat_account")
        .eq("organization_id", currentOrganizationId)
        .eq("active", true)
        .order("code"),
      supabase
        .from("invoices")
        .select(
          "id,invoice_number,client_name,issue_date,due_date,subtotal_cents,vat_cents,total_cents,status,organization_id",
        )
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("journal_entries")
        .select(
          "id,entry_date,description,invoice_id,journal_lines(id,account_id,debit_cents,credit_cents,description)",
        )
        .eq("organization_id", currentOrganizationId)
        .order("entry_date", { ascending: false })
        .limit(50),
      supabase
        .from("accountant_sync_events")
        .select("id,target,status,payload,response,created_at,invoice_id")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (accRes.error) toast.error(accRes.error.message);
    if (invRes.error) toast.error(invRes.error.message);
    if (jeRes.error) toast.error(jeRes.error.message);
    if (syncRes.error) toast.error(syncRes.error.message);
    setAccounts((accRes.data ?? []) as Account[]);
    setInvoices((invRes.data ?? []) as InvoiceRow[]);
    setEntries((jeRes.data ?? []) as JournalEntry[]);
    setEvents((syncRes.data ?? []) as SyncEvent[]);
    setLoading(false);
  }, [currentOrganizationId]);

  useEffect(() => {
    if (!wsLoading) loadAll();
  }, [wsLoading, loadAll]);

  const totals = useMemo(() => {
    const r = { revenue: 0, outstanding: 0, paid: 0, count: invoices.length };
    invoices.forEach((i) => {
      if (i.status === "paid") {
        r.paid += i.total_cents;
        r.revenue += i.subtotal_cents;
      } else if (i.status === "sent" || i.status === "overdue") {
        r.outstanding += i.total_cents;
        r.revenue += i.subtotal_cents;
      }
    });
    return r;
  }, [invoices]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {currentOrganization?.name ?? ""} — {t("acc.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("acc.subtitle")}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : (
        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList>
            <TabsTrigger value="dashboard" className="gap-1.5">
              <LayoutDashboard className="h-3.5 w-3.5" /> {t("acc.tabs.dashboard")}
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-1.5">
              <Receipt className="h-3.5 w-3.5" /> {t("acc.tabs.invoices")}
            </TabsTrigger>
            <TabsTrigger value="ledger" className="gap-1.5">
              <BookOpen className="h-3.5 w-3.5" /> {t("acc.tabs.ledger")}
            </TabsTrigger>
            <TabsTrigger value="journal" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> {t("acc.tabs.journal")}
            </TabsTrigger>
            <TabsTrigger value="sync" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" /> {t("acc.tabs.sync")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardTab totals={totals} invoices={invoices} events={events} lang={lang} />
          </TabsContent>

          <TabsContent value="invoices">
            <InvoicesTab
              accounts={accounts}
              invoices={invoices}
              lang={lang}
              orgId={currentOrganizationId!}
              userId={user?.id ?? null}
              reload={loadAll}
            />
          </TabsContent>

          <TabsContent value="ledger">
            <LedgerTab accounts={accounts} lang={lang} />
          </TabsContent>

          <TabsContent value="journal">
            <JournalTab entries={entries} accounts={accounts} lang={lang} />
          </TabsContent>

          <TabsContent value="sync">
            <SyncTab
              invoices={invoices}
              entries={entries}
              events={events}
              accounts={accounts}
              orgId={currentOrganizationId!}
              orgName={currentOrganization?.name ?? ""}
              userId={user?.id ?? null}
              lang={lang}
              reload={loadAll}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ============= DASHBOARD =============

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function DashboardTab({
  totals,
  invoices,
  events,
  lang,
}: {
  totals: { revenue: number; outstanding: number; paid: number; count: number };
  invoices: InvoiceRow[];
  events: SyncEvent[];
  lang: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("acc.dash.revenue")} value={centsFmt(totals.revenue, lang)} hint={t("acc.dash.revenue_hint")} />
        <StatCard label={t("acc.dash.outstanding")} value={centsFmt(totals.outstanding, lang)} />
        <StatCard label={t("acc.dash.paid")} value={centsFmt(totals.paid, lang)} />
        <StatCard label={t("acc.dash.invoice_count")} value={String(totals.count)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-sm font-semibold">{t("acc.dash.recent_invoices")}</div>
          <div className="divide-y">
            {invoices.slice(0, 6).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <div className="font-mono text-xs text-muted-foreground">{inv.invoice_number}</div>
                  <div className="font-medium">{inv.client_name ?? "—"}</div>
                </div>
                <div className="text-right">
                  <div className="tabular-nums">{centsFmt(inv.total_cents, lang)}</div>
                  <Badge variant="outline" className={STATUS_COLOR[inv.status]}>
                    {t(`invoices.status.${inv.status}`)}
                  </Badge>
                </div>
              </div>
            ))}
            {invoices.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">{t("invoices.empty")}</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-sm font-semibold">{t("acc.dash.recent_sync")}</div>
          <div className="divide-y">
            {events.slice(0, 6).map((e) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  {e.status === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {e.status === "failed" && <XCircle className="h-4 w-4 text-red-600" />}
                  {e.status === "pending" && <Clock className="h-4 w-4 text-amber-600" />}
                  <div>
                    <div className="font-medium">{e.target}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString(lang)}
                    </div>
                  </div>
                </div>
                <Badge variant="outline">{e.status}</Badge>
              </div>
            ))}
            {events.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">{t("acc.sync.empty")}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============= LEDGER =============

function LedgerTab({ accounts, lang }: { accounts: Account[]; lang: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">{t("acc.ledger.code")}</TableHead>
            <TableHead>{t("acc.ledger.name")}</TableHead>
            <TableHead>{t("acc.ledger.type")}</TableHead>
            <TableHead className="text-right">{t("acc.ledger.vat")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-mono">{a.code}</TableCell>
              <TableCell className="font-medium">{a.name}</TableCell>
              <TableCell>
                <Badge variant="outline">
                  {ACCOUNT_TYPE_LABELS[a.type][lang === "en" ? "en" : "nl"]}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {a.vat_rate != null ? `${a.vat_rate}%` : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ============= INVOICES =============

function InvoicesTab({
  accounts,
  invoices,
  lang,
  orgId,
  userId,
  reload,
}: {
  accounts: Account[];
  invoices: InvoiceRow[];
  lang: string;
  orgId: string;
  userId: string | null;
  reload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientName, setClientName] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const emptyLine = (): LineForm => ({
    description: "",
    quantity: 1,
    unit_price_cents: 0,
    vat_rate: 21,
    product_id: null,
  });
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  useEffect(() => {
    if (!orgId) return;
    void supabase
      .from("products")
      .select("id, name, unit_price_cents, vat_rate, pricing_type, description")
      .eq("organization_id", orgId)
      .eq("active", true)
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          toast.error(error.message);
          return;
        }
        setProducts((data ?? []) as ProductOption[]);
      });
  }, [orgId]);

  function applyProduct(i: number, productId: string) {
    const p = products.find((pp) => pp.id === productId);
    if (!p) return;
    const n = [...lines];
    n[i] = {
      ...n[i],
      product_id: p.id,
      description: n[i].description.trim() ? n[i].description : p.description || p.name,
      unit_price_cents: p.unit_price_cents,
      vat_rate: Number(p.vat_rate ?? 21),
    };
    setLines(n);
  }

  const revenueAccount = accounts.find((a) => a.code === "8000");

  const subtotalCents = lines.reduce(
    (s, l) => s + Math.round(l.quantity * l.unit_price_cents),
    0,
  );
  const vatCents = lines.reduce(
    (s, l) => s + Math.round(l.quantity * l.unit_price_cents * (l.vat_rate / 100)),
    0,
  );
  const totalCents = subtotalCents + vatCents;

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim()) return toast.error(t("acc.inv.client_required"));
    if (lines.some((l) => !l.description.trim())) return toast.error(t("acc.inv.line_required"));
    setSaving(true);

    const { data: numData, error: numErr } = await (
      supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: string | null; error: { message: string } | null }>
    )("next_invoice_number", { org_id: orgId });
    if (numErr || !numData) {
      setSaving(false);
      return toast.error(numErr?.message ?? "RPC error");
    }

    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .insert({
        organization_id: orgId,
        invoice_number: String(numData),
        client_name: clientName.trim(),
        due_date: dueDate,
        subtotal_cents: subtotalCents,
        vat_cents: vatCents,
        total_cents: totalCents,
        amount: totalCents / 100,
        status: "draft",
      })
      .select("id")
      .single();

    if (invErr || !inv) {
      setSaving(false);
      return toast.error(invErr?.message ?? "Error");
    }

    const { error: linesErr } = await supabase.from("invoice_lines").insert(
      lines.map((l, i) => ({
        invoice_id: inv.id,
        position: i,
        description: l.description.trim(),
        quantity: l.quantity,
        unit_price_cents: l.unit_price_cents,
        vat_rate: l.vat_rate,
        subtotal_cents: Math.round(l.quantity * l.unit_price_cents),
        vat_cents: Math.round(l.quantity * l.unit_price_cents * (l.vat_rate / 100)),
        total_cents: Math.round(l.quantity * l.unit_price_cents * (1 + l.vat_rate / 100)),
        revenue_account_id: revenueAccount?.id ?? null,
        product_id: l.product_id,
      })),
    );
    setSaving(false);
    if (linesErr) return toast.error(linesErr.message);
    toast.success(t("invoices.created", { number: String(numData) }));
    setOpen(false);
    setClientName("");
    setLines([emptyLine()]);
    void reload();
    void userId;
  }

  async function changeStatus(id: string, status: InvoiceRow["status"]) {
    const patch: { status: InvoiceRow["status"]; sent_at?: string; paid_at?: string } = { status };
    if (status === "sent") patch.sent_at = new Date().toISOString();
    if (status === "paid") patch.paid_at = new Date().toISOString();
    const { error } = await supabase.from("invoices").update(patch).eq("id", id);
    if (error) return toast.error(error.message);

    if (status === "sent" || status === "paid") {
      const { error: rpcErr } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>
      )("post_invoice_journal", { _invoice_id: id });
      if (rpcErr) toast.error(rpcErr.message);
      else toast.success(t("acc.inv.posted"));
    }
    void reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t("invoices.new_invoice")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t("invoices.new_invoice")}</DialogTitle>
              <DialogDescription>{t("acc.inv.dialog_desc")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={createInvoice} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="inv-client">{t("acc.inv.client")}</Label>
                  <Input
                    id="inv-client"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-due">{t("invoices.due_date")}</Label>
                  <Input
                    id="inv-due"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("quotes.description")}</TableHead>
                      <TableHead className="w-20 text-right">{t("quotes.qty")}</TableHead>
                      <TableHead className="w-32 text-right">{t("acc.inv.unit_eur")}</TableHead>
                      <TableHead className="w-24 text-right">BTW %</TableHead>
                      <TableHead className="w-28 text-right">{t("quotes.total")}</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l, i) => {
                      const lineSub = Math.round(l.quantity * l.unit_price_cents);
                      const lineTot = Math.round(lineSub * (1 + l.vat_rate / 100));
                      return (
                        <TableRow key={i}>
                          <TableCell>
                            <Input
                              value={l.description}
                              onChange={(e) => {
                                const n = [...lines];
                                n[i] = { ...l, description: e.target.value };
                                setLines(n);
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step="0.001"
                              className="text-right"
                              value={l.quantity}
                              onChange={(e) => {
                                const n = [...lines];
                                n[i] = { ...l, quantity: Number(e.target.value) };
                                setLines(n);
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              className="text-right"
                              value={(l.unit_price_cents / 100).toString()}
                              onChange={(e) => {
                                const n = [...lines];
                                n[i] = { ...l, unit_price_cents: Math.round(Number(e.target.value) * 100) };
                                setLines(n);
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={String(l.vat_rate)}
                              onValueChange={(v) => {
                                const n = [...lines];
                                n[i] = { ...l, vat_rate: Number(v) };
                                setLines(n);
                              }}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="21">21%</SelectItem>
                                <SelectItem value="9">9%</SelectItem>
                                <SelectItem value="0">0%</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {centsFmt(lineTot, lang)}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setLines(lines.filter((_, j) => j !== i))}
                              disabled={lines.length === 1}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-end justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setLines([...lines, emptyLine()])
                  }
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {t("quotes.add_line")}
                </Button>
                <div className="space-y-1 text-right text-sm">
                  <div>
                    <span className="text-muted-foreground">{t("acc.inv.subtotal")}: </span>
                    <span className="tabular-nums">{centsFmt(subtotalCents, lang)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">BTW: </span>
                    <span className="tabular-nums">{centsFmt(vatCents, lang)}</span>
                  </div>
                  <div className="text-base font-semibold">
                    <span className="text-muted-foreground">{t("quotes.total")}: </span>
                    <span className="tabular-nums">{centsFmt(totalCents, lang)}</span>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          {t("invoices.empty")}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("invoices.number")}</TableHead>
                <TableHead>{t("acc.inv.client")}</TableHead>
                <TableHead>{t("invoices.due_date")}</TableHead>
                <TableHead className="text-right">{t("acc.inv.subtotal")}</TableHead>
                <TableHead className="text-right">BTW</TableHead>
                <TableHead className="text-right">{t("quotes.total")}</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                  <TableCell className="font-medium">{inv.client_name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(inv.due_date).toLocaleDateString(lang)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{centsFmt(inv.subtotal_cents, lang)}</TableCell>
                  <TableCell className="text-right tabular-nums">{centsFmt(inv.vat_cents, lang)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{centsFmt(inv.total_cents, lang)}</TableCell>
                  <TableCell>
                    <Select value={inv.status} onValueChange={(v) => changeStatus(inv.id, v as InvoiceRow["status"])}>
                      <SelectTrigger className="h-7 w-[140px]">
                        <Badge variant="outline" className={STATUS_COLOR[inv.status]}>
                          {t(`invoices.status.${inv.status}`)}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {(["draft", "sent", "paid", "overdue", "cancelled"] as const).map((s) => (
                          <SelectItem key={s} value={s}>{t(`invoices.status.${s}`)}</SelectItem>
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

// ============= JOURNAL =============

function JournalTab({
  entries,
  accounts,
  lang,
}: {
  entries: JournalEntry[];
  accounts: Account[];
  lang: string;
}) {
  const { t } = useTranslation();
  const accMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
        {t("acc.journal.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map((e) => {
        const totalDebit = e.journal_lines.reduce((s, l) => s + l.debit_cents, 0);
        const totalCredit = e.journal_lines.reduce((s, l) => s + l.credit_cents, 0);
        const balanced = totalDebit === totalCredit;
        return (
          <div key={e.id} className="rounded-lg border bg-card transition-colors hover:border-primary/40">
            <Link
              to="/boekhouding/journal/$entryId"
              params={{ entryId: e.id }}
              className="flex items-center justify-between border-b px-4 py-2.5 hover:bg-muted/40"
            >
              <div>
                <div className="text-sm font-medium">{e.description}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(e.entry_date).toLocaleDateString(lang)}
                </div>
              </div>
              <Badge variant={balanced ? "outline" : "destructive"} className={balanced ? "bg-emerald-500/10 text-emerald-700" : ""}>
                {balanced ? t("acc.journal.balanced") : t("acc.journal.unbalanced")}
              </Badge>
            </Link>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("acc.ledger.code")}</TableHead>
                  <TableHead>{t("acc.ledger.name")}</TableHead>
                  <TableHead className="text-right">{t("acc.journal.debit")}</TableHead>
                  <TableHead className="text-right">{t("acc.journal.credit")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {e.journal_lines.map((l) => {
                  const acc = accMap.get(l.account_id);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-sm">{acc?.code ?? "—"}</TableCell>
                      <TableCell>{acc?.name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.debit_cents > 0 ? centsFmt(l.debit_cents, lang) : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.credit_cents > 0 ? centsFmt(l.credit_cents, lang) : ""}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell colSpan={2}>{t("quotes.total")}</TableCell>
                  <TableCell className="text-right tabular-nums">{centsFmt(totalDebit, lang)}</TableCell>
                  <TableCell className="text-right tabular-nums">{centsFmt(totalCredit, lang)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        );
      })}
    </div>
  );
}

// ============= SYNC =============

function SyncTab({
  invoices,
  entries,
  events,
  accounts,
  orgId,
  orgName,
  userId,
  lang,
  reload,
}: {
  invoices: InvoiceRow[];
  entries: JournalEntry[];
  events: SyncEvent[];
  accounts: Account[];
  orgId: string;
  orgName: string;
  userId: string | null;
  lang: string;
  reload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState("yuki");
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const accMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  function buildPayload(inv: InvoiceRow): Record<string, unknown> {
    const entry = entries.find((e) => e.invoice_id === inv.id);
    return {
      meta: {
        organization: orgName,
        organization_id: orgId,
        target,
        generated_at: new Date().toISOString(),
      },
      invoice: {
        id: inv.id,
        number: inv.invoice_number,
        client: inv.client_name,
        issue_date: inv.issue_date,
        due_date: inv.due_date,
        currency: "EUR",
        subtotal_cents: inv.subtotal_cents,
        vat_cents: inv.vat_cents,
        total_cents: inv.total_cents,
        status: inv.status,
      },
      journal_entry: entry
        ? {
            id: entry.id,
            date: entry.entry_date,
            description: entry.description,
            lines: entry.journal_lines.map((l) => {
              const acc = accMap.get(l.account_id);
              return {
                account_code: acc?.code ?? null,
                account_name: acc?.name ?? null,
                debit_cents: l.debit_cents,
                credit_cents: l.credit_cents,
                description: l.description,
              };
            }),
          }
        : null,
    };
  }

  const previewPayload = useMemo(() => {
    const inv = invoices.find((i) => i.id === selectedInvoice) ?? invoices[0];
    return inv ? buildPayload(inv) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoice, invoices, entries, accounts, target, orgName, orgId]);

  async function pushInvoice(inv: InvoiceRow) {
    setBusy(true);
    const payload = buildPayload(inv);
    // Simulate API call
    await new Promise((r) => setTimeout(r, 600));
    const ok = Math.random() > 0.05;
    const response = ok
      ? { accepted: true, remote_id: `mock_${Math.random().toString(36).slice(2, 10)}` }
      : { accepted: false, error: "Mock provider rejected payload" };
    const { error } = await supabase.from("accountant_sync_events").insert({
      organization_id: orgId,
      invoice_id: inv.id,
      target,
      status: ok ? "success" : "failed",
      payload: payload as never,
      response: response as never,
      created_by: userId,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success(ok ? t("acc.sync.pushed") : t("acc.sync.failed"));
    void reload();
  }

  function exportAll() {
    const data = invoices
      .filter((i) => i.status === "sent" || i.status === "paid")
      .map(buildPayload);
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), invoices: data }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accountant-export-${orgName.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="space-y-1.5">
          <Label>{t("acc.sync.target")}</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yuki">Yuki</SelectItem>
              <SelectItem value="exact_online">Exact Online</SelectItem>
              <SelectItem value="make">Make.com webhook</SelectItem>
              <SelectItem value="mock">Mock endpoint</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={exportAll} disabled={invoices.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          {t("acc.sync.export_all")}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-sm font-semibold">{t("acc.sync.ready_to_push")}</div>
          <div className="divide-y">
            {invoices
              .filter((i) => i.status === "sent" || i.status === "paid")
              .map((inv) => (
                <div key={inv.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <button
                    type="button"
                    onClick={() => setSelectedInvoice(inv.id)}
                    className="text-left"
                  >
                    <div className="font-mono text-xs text-muted-foreground">{inv.invoice_number}</div>
                    <div className="font-medium">{inv.client_name ?? "—"}</div>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-sm">{centsFmt(inv.total_cents, lang)}</span>
                    <Button size="sm" onClick={() => pushInvoice(inv)} disabled={busy}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              ))}
            {invoices.filter((i) => i.status === "sent" || i.status === "paid").length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">{t("acc.sync.no_ready")}</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-sm font-semibold">{t("acc.sync.payload_preview")}</div>
          <pre className="max-h-96 overflow-auto bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
{previewPayload ? JSON.stringify(previewPayload, null, 2) : t("acc.sync.select_invoice")}
          </pre>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3 text-sm font-semibold">{t("acc.sync.event_log")}</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("acc.sync.when")}</TableHead>
              <TableHead>{t("acc.sync.target")}</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>{t("acc.sync.response")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(e.created_at).toLocaleString(lang)}
                </TableCell>
                <TableCell>{e.target}</TableCell>
                <TableCell>
                  <Badge variant="outline">{e.status}</Badge>
                </TableCell>
                <TableCell className="max-w-md truncate font-mono text-xs text-muted-foreground">
                  {e.response ? JSON.stringify(e.response) : "—"}
                </TableCell>
              </TableRow>
            ))}
            {events.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                  {t("acc.sync.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
