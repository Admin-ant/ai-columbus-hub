import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Eye, Loader2, MoreHorizontal, Plus, Trash2 } from "lucide-react";

import { deleteInvoice } from "@/lib/invoice-actions.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useWorkspace } from "@/hooks/use-workspace";

type FilterKey = "all" | "paid" | "open" | "reminder" | "draft";
const VALID_FILTERS: FilterKey[] = ["all", "paid", "open", "reminder", "draft"];

export const Route = createFileRoute("/_authenticated/invoices/")({
  head: () => ({ meta: [{ title: "Facturen" }] }),
  validateSearch: (s: Record<string, unknown>): { filter?: FilterKey } => {
    const f = s.filter;
    if (typeof f === "string" && (VALID_FILTERS as string[]).includes(f)) {
      return { filter: f as FilterKey };
    }
    return {};
  },
  component: InvoicesPage,
});

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];
type ClientRow = { id: string; name: string; email: string | null };
type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  unit_price_cents: number;
  vat_rate: number;
};

const STATUS: InvoiceStatus[] = ["draft", "sent", "paid", "overdue", "cancelled"];

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft: "bg-muted text-foreground",
  sent: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  overdue: "bg-red-500/15 text-red-700 dark:text-red-300",
  cancelled: "bg-muted text-muted-foreground",
};

type LineForm = {
  description: string;
  quantity: number;
  unit_price_cents: number;
  vat_rate: number;
};

function emptyLine(): LineForm {
  return { description: "", quantity: 1, unit_price_cents: 0, vat_rate: 21 };
}

function InvoicesPage() {
  const { t, i18n } = useTranslation();
  const { currentOrganizationId, currentOrganization, loading: wsLoading } = useWorkspace();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const search = Route.useSearch();
  const [filter, setFilter] = useState<FilterKey>(search.filter ?? "all");
  useEffect(() => {
    if (search.filter && search.filter !== filter) setFilter(search.filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.filter]);

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
    setInvoices((is) =>
      is.map((i) =>
        i.id === id
          ? {
              ...i,
              status,
              paid_at: status === "paid" ? (i.paid_at ?? new Date().toISOString()) : null,
            }
          : i,
      ),
    );
    const patch: { status: InvoiceStatus; sent_at?: string; paid_at?: string | null } = { status };
    if (status === "sent") patch.sent_at = new Date().toISOString();
    if (status === "paid") patch.paid_at = new Date().toISOString();
    // Als de factuur van 'paid' terug gaat naar een andere status, wissen we
    // de betaal-datum zodat lijst, KPI's en PDF-stempel consistent blijven.
    if (status !== "paid") patch.paid_at = null;
    const { error } = await supabase.from("invoices").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      setInvoices(prev);
      return;
    }
    if (status === "sent" || status === "paid") {
      try {
        const { postInvoiceJournal } = await import("@/lib/bookkeeping.functions");
        await postInvoiceJournal({ data: { invoice_id: id } });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "RPC error");
      }
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

  const filteredInvoices = useMemo(() => {
    const now = Date.now();
    return invoices.filter((i) => {
      if (filter === "all") return true;
      if (filter === "paid") return i.status === "paid";
      if (filter === "draft") return i.status === "draft";
      if (filter === "open") return i.status === "sent" || i.status === "overdue";
      if (filter === "reminder") {
        if (i.status !== "sent" && i.status !== "overdue") return false;
        if (!i.due_date) return false;
        return new Date(i.due_date).getTime() < now;
      }
      return true;
    });
  }, [invoices, filter]);

  const counts = useMemo(() => {
    const now = Date.now();
    const c = { all: invoices.length, paid: 0, open: 0, reminder: 0, draft: 0 };
    invoices.forEach((i) => {
      if (i.status === "paid") c.paid++;
      else if (i.status === "draft") c.draft++;
      else if (i.status === "sent" || i.status === "overdue") {
        c.open++;
        if (i.due_date && new Date(i.due_date).getTime() < now) c.reminder++;
      }
    });
    return c;
  }, [invoices]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {currentOrganization?.name ?? ""} — {t("invoices.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("invoices.subtitle")}</p>
        </div>
        {currentOrganizationId && (
          <NewInvoiceDialog orgId={currentOrganizationId} onCreated={load} />
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label={t("invoices.total")} value={eur.format(totals.all)} />
        <SummaryCard label={t("invoices.paid")} value={eur.format(totals.paid)} />
        <SummaryCard label={t("invoices.open")} value={eur.format(totals.open)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([
          { k: "all", label: "Alle", n: counts.all },
          { k: "open", label: "Open", n: counts.open },
          { k: "reminder", label: "Herinnering", n: counts.reminder },
          { k: "paid", label: "Betaald", n: counts.paid },
          { k: "draft", label: "Concept", n: counts.draft },
        ] as const).map((f) => (
          <Button
            key={f.k}
            size="sm"
            variant={filter === f.k ? "default" : "outline"}
            onClick={() => setFilter(f.k)}
            className="h-7 text-xs"
          >
            {f.label}
            <span className="ml-1.5 rounded bg-background/40 px-1.5 text-[10px] font-mono">
              {f.n}
            </span>
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          {invoices.length === 0 ? t("invoices.empty") : "Geen facturen in dit filter"}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("invoices.number")}</TableHead>
                <TableHead>Klant</TableHead>
                <TableHead>{t("invoices.issue_date")}</TableHead>
                <TableHead>{t("invoices.due_date")}</TableHead>
                <TableHead>Betaald op</TableHead>
                <TableHead className="text-right">{t("invoices.amount")}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10 text-right">{t("invoices.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-sm">
                    <Link
                      to="/invoices/$invoiceId"
                      params={{ invoiceId: inv.id }}
                      className="text-brand hover:underline"
                    >
                      {inv.invoice_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {inv.client_id ? (
                      <Link to="/ai-columbus/klanten/$clientId" params={{ clientId: inv.client_id }} className="text-brand hover:underline">
                        {inv.client_name ?? "Klant"}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{inv.client_name ?? "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(inv.issue_date).toLocaleDateString(i18n.resolvedLanguage ?? "nl")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(inv.due_date).toLocaleDateString(i18n.resolvedLanguage ?? "nl")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {inv.paid_at
                      ? new Date(inv.paid_at).toLocaleDateString(i18n.resolvedLanguage ?? "nl")
                      : "—"}
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
                  <TableCell className="text-right">
                    <RowActions invoice={inv} onChanged={load} />
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

function NewInvoiceDialog({ orgId, onCreated }: { orgId: string; onCreated: () => void | Promise<void> }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);

  const eur = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en-IE" : "nl-NL", {
        style: "currency",
        currency: "EUR",
      }),
    [i18n.resolvedLanguage],
  );

  useEffect(() => {
    if (!open) return;
    void supabase
      .from("clients")
      .select("id,name,email")
      .eq("organization_id", orgId)
      .order("name")
      .then(({ data }) => setClients((data ?? []) as ClientRow[]));
  }, [open, orgId]);

  // Load products + subscribe to realtime changes so new/edited products
  // instantly appear in the description picker.
  useEffect(() => {
    if (!open) return;
    let active = true;
    const loadProducts = async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name,sku,unit_price_cents,vat_rate")
        .eq("organization_id", orgId)
        .eq("active", true)
        .order("name");
      if (!active) return;
      setProducts(
        ((data ?? []) as Array<{
          id: string;
          name: string;
          sku: string | null;
          unit_price_cents: number;
          vat_rate: number | string;
        }>).map((p) => ({ ...p, vat_rate: Number(p.vat_rate) })),
      );
    };
    void loadProducts();
    const channel = supabase
      .channel(`products-${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products", filter: `organization_id=eq.${orgId}` },
        () => { void loadProducts(); },
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [open, orgId]);

  const subtotalCents = lines.reduce((s, l) => s + Math.round(l.quantity * l.unit_price_cents), 0);
  const vatCents = lines.reduce(
    (s, l) => s + Math.round(l.quantity * l.unit_price_cents * (l.vat_rate / 100)),
    0,
  );
  const totalCents = subtotalCents + vatCents;

  function reset() {
    setClientId("");
    setClientName("");
    setLines([emptyLine()]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = clientName.trim() || clients.find((c) => c.id === clientId)?.name?.trim() || "";
    if (!name) return toast.error("Klantnaam is verplicht");
    if (lines.some((l) => !l.description.trim())) return toast.error("Vul alle regelomschrijvingen in");
    setSaving(true);

    // Autosave: nieuwe omschrijvingen (die nog niet als product bestaan) toevoegen
    // aan Producten & Prijzen zodat ze meteen herbruikbaar zijn.
    try {
      const existingNames = new Set(products.map((p) => p.name.trim().toLowerCase()));
      const seen = new Set<string>();
      const toCreate = lines
        .map((l) => ({
          name: l.description.trim(),
          unit_price_cents: Math.round(l.unit_price_cents),
          vat_rate: l.vat_rate,
        }))
        .filter((l) => {
          const key = l.name.toLowerCase();
          if (!l.name || existingNames.has(key) || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      if (toCreate.length) {
        const rnd = () =>
          `AUTO-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
        const rows = toCreate.map((l) => ({
          organization_id: orgId,
          sku: rnd(),
          name: l.name,
          unit_price_cents: l.unit_price_cents,
          setup_fee_cents: 0,
          pricing_type: "one_time" as const,
          vat_rate: l.vat_rate,
          discount_percent: 0,
          discount_type: "none" as const,
          active: true,
        }));
        await supabase.from("products").insert(rows);
      }
    } catch {
      // niet blokkerend
    }

    const { nextInvoiceNumber } = await import("@/lib/bookkeeping.functions");

    let inv: { id: string } | null = null;
    let number: string | null = null;
    let lastErr: { code?: string; message: string } | null = null;

    // Nummer wordt atomair uit de organisatie-sequence gehaald; bij een zeldzame
    // race (duplicate key 23505) proberen we tot 3x opnieuw met een vers nummer.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await nextInvoiceNumber({ data: { org_id: orgId } });
        number = res.number;
      } catch (err) {
        setSaving(false);
        return toast.error(err instanceof Error ? err.message : "Kon factuurnummer niet genereren");
      }
      if (!number) {
        setSaving(false);
        return toast.error("Kon factuurnummer niet genereren");
      }

      const { data, error } = await supabase
        .from("invoices")
        .insert({
          organization_id: orgId,
          invoice_number: number,
          client_id: clientId || null,
          client_name: name,
          issue_date: issueDate,
          due_date: dueDate,
          subtotal_cents: subtotalCents,
          vat_cents: vatCents,
          total_cents: totalCents,
          amount: totalCents / 100,
          status: "draft",
        })
        .select("id")
        .single();

      if (!error && data) {
        inv = data;
        break;
      }
      lastErr = error ? { code: error.code, message: error.message } : null;
      if (error?.code !== "23505") break; // alleen bij duplicate opnieuw proberen
      number = null;
    }

    if (!inv) {
      setSaving(false);
      if (lastErr?.code === "23505") {
        return toast.error(`Factuurnummer ${number ?? ""} bestaat al — probeer opnieuw`);
      }
      return toast.error(lastErr?.message ?? "Error");
    }

    const { error: linesErr } = await supabase.from("invoice_lines").insert(
      lines.map((l, i) => ({
        invoice_id: inv.id,
        position: i + 1,
        description: l.description.trim(),
        quantity: l.quantity,
        unit_price_cents: l.unit_price_cents,
        vat_rate: l.vat_rate,
        subtotal_cents: Math.round(l.quantity * l.unit_price_cents),
        vat_cents: Math.round(l.quantity * l.unit_price_cents * (l.vat_rate / 100)),
        total_cents: Math.round(l.quantity * l.unit_price_cents * (1 + l.vat_rate / 100)),
      })),
    );
    setSaving(false);
    if (linesErr) return toast.error(linesErr.message);
    toast.success(t("invoices.created", { number }));
    setOpen(false);
    reset();
    await onCreated();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
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
        <form onSubmit={submit} className="space-y-4">
          <datalist id="invoice-products">
            {products.map((p) => (
              <option
                key={p.id}
                value={p.name}
                label={`€ ${(p.unit_price_cents / 100).toFixed(2)} · ${p.vat_rate}% BTW${p.sku ? ` · ${p.sku}` : ""}`}
              />
            ))}
          </datalist>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Klant</Label>
              <Select
                value={clientId}
                onValueChange={(v) => {
                  setClientId(v);
                  const c = clients.find((cc) => cc.id === v);
                  if (c) setClientName(c.name);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={clients.length ? "— kies bestaande klant —" : "Geen klanten"} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="of typ een naam"
                value={clientName}
                onChange={(e) => {
                  setClientName(e.target.value);
                  if (clientId) setClientId("");
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="inv-issue">{t("invoices.issue_date")}</Label>
                <Input
                  id="inv-issue"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
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
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("quotes.description")}</TableHead>
                  <TableHead className="w-20 text-right">{t("quotes.qty")}</TableHead>
                  <TableHead className="w-32 text-right">Prijs (€)</TableHead>
                  <TableHead className="w-24 text-right">BTW %</TableHead>
                  <TableHead className="w-28 text-right">{t("quotes.total")}</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => {
                  const lineTot = Math.round(l.quantity * l.unit_price_cents * (1 + l.vat_rate / 100));
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <Input
                          list="invoice-products"
                          placeholder="Kies uit producten of typ nieuw…"
                          value={l.description}
                          onChange={(e) => {
                            const val = e.target.value;
                            const n = [...lines];
                            const match = products.find(
                              (p) => p.name.toLowerCase() === val.toLowerCase(),
                            );
                            n[i] = match
                              ? {
                                  ...l,
                                  description: match.name,
                                  unit_price_cents: match.unit_price_cents,
                                  vat_rate: match.vat_rate,
                                  quantity: l.quantity || 1,
                                }
                              : { ...l, description: val };
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
                            n[i] = {
                              ...l,
                              unit_price_cents: Math.round(Number(e.target.value) * 100),
                            };
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
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="21">21%</SelectItem>
                            <SelectItem value="9">9%</SelectItem>
                            <SelectItem value="0">0%</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {eur.format(lineTot / 100)}
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
              onClick={() => setLines([...lines, emptyLine()])}
            >
              <Plus className="mr-1 h-3 w-3" />
              {t("quotes.add_line")}
            </Button>
            <div className="space-y-1 text-right text-sm">
              <div>
                <span className="text-muted-foreground">Subtotaal: </span>
                <span className="tabular-nums">{eur.format(subtotalCents / 100)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">BTW: </span>
                <span className="tabular-nums">{eur.format(vatCents / 100)}</span>
              </div>
              <div className="text-base font-semibold">
                <span className="text-muted-foreground">{t("quotes.total")}: </span>
                <span className="tabular-nums">{eur.format(totalCents / 100)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RowActions({ invoice, onChanged }: { invoice: Invoice; onChanged: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const deleteFn = useServerFn(deleteInvoice);
  const isDraft = invoice.status === "draft";

  async function handleDelete() {
    const msg = isDraft ? t("invoices.delete_confirm") : t("invoices.cancel_confirm");
    if (!window.confirm(msg)) return;
    try {
      const r = await deleteFn({ data: { invoice_id: invoice.id } });
      toast.success(r.action === "deleted" ? t("invoices.deleted") : t("invoices.cancelled_ok"));
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fout");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => navigate({ to: "/invoices/$invoiceId", params: { invoiceId: invoice.id } })}
        >
          <Eye className="mr-2 h-4 w-4" /> {t("invoices.view")}
        </DropdownMenuItem>
        <DropdownMenuItem className="text-red-600" onClick={handleDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          {isDraft ? t("invoices.delete") : t("invoices.cancel_invoice")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
