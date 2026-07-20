import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Package, Pencil, Printer, FileDown, Eye } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
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
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/_authenticated/producten")({
  head: () => ({ meta: [{ title: "Producten & Prijzen" }] }),
  component: ProductsPage,
});

type Product = Database["public"]["Tables"]["products"]["Row"];
type PricingType = Database["public"]["Enums"]["pricing_type"];

const PRICING_LABELS: Record<PricingType, string> = {
  one_time: "Eenmalig",
  monthly_recurring: "Maandelijks",
  per_credit: "Per credit",
};

const PRICING_COLOR: Record<PricingType, string> = {
  one_time: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  monthly_recurring: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  per_credit: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
};

const EUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

function ProductsPage() {
  const { user } = useAuth();
  const { currentOrganizationId, currentOrganization, loading: wsLoading } = useWorkspace();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = {
    sku: "",
    name: "",
    description: "",
    unit_price: "0",
    setup_fee: "0",
    pricing_type: "one_time" as PricingType,
    vat_rate: "21",
    discount_percent: "0",
    discount_type: "none" as "none" | "one_time" | "recurring",
    contract_months: "",
    use_contract: false,
  };
  const [form, setForm] = useState(emptyForm);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(p: Product) {
    setEditingId(p.id);
    setForm({
      sku: p.sku ?? "",
      name: p.name,
      description: p.description ?? "",
      unit_price: (Number(p.unit_price_cents ?? 0) / 100).toString(),
      setup_fee: (Number(p.setup_fee_cents ?? 0) / 100).toString(),
      pricing_type: p.pricing_type,
      vat_rate: String(p.vat_rate ?? 21),
      discount_percent: String(p.discount_percent ?? 0),
      discount_type: (p.discount_type ?? "none") as "none" | "one_time" | "recurring",
      contract_months: p.contract_months != null ? String(p.contract_months) : "",
      use_contract: p.contract_months != null,
    });
    setOpen(true);
  }

  async function load() {
    if (!currentOrganizationId) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("organization_id", currentOrganizationId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setProducts((data ?? []) as Product[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!wsLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganizationId, wsLoading]);

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrganizationId) return toast.error("Selecteer eerst een organisatie");
    if (!form.name.trim()) return toast.error("Naam is verplicht");
    const sku = form.sku.trim();
    if (!sku) return toast.error("Artikelnr. (SKU) is verplicht");
    if (!/^[A-Za-z0-9._-]{2,32}$/.test(sku))
      return toast.error("Artikelnr. mag alleen letters, cijfers, '.', '_' of '-' bevatten (2-32 tekens)");
    if (products.some((p) => p.id !== editingId && (p.sku ?? "").toLowerCase() === sku.toLowerCase()))
      return toast.error("Dit artikelnummer bestaat al binnen deze organisatie");
    const discountPercent = Math.max(0, Math.min(100, Number(form.discount_percent) || 0));
    const discountType: "none" | "one_time" | "recurring" =
      discountPercent > 0 ? (form.discount_type === "none" ? "one_time" : form.discount_type) : "none";
    const contractMonths = form.use_contract && form.contract_months.trim()
      ? Math.max(1, Number(form.contract_months))
      : null;

    setSaving(true);
    const payload = {
      organization_id: currentOrganizationId,
      sku,
      name: form.name.trim(),
      description: form.description.trim() || null,
      unit_price_cents: Math.round(Number(form.unit_price) * 100),
      setup_fee_cents: Math.round(Number(form.setup_fee) * 100),
      pricing_type: form.pricing_type,
      vat_rate: Number(form.vat_rate) || 0,
      discount_percent: discountPercent,
      discount_type: discountType,
      contract_months: contractMonths,
    };
    const { error } = editingId
      ? await supabase.from("products").update(payload).eq("id", editingId)
      : await supabase.from("products").insert({ ...payload, created_by: user?.id ?? null });
    setSaving(false);
    if (error) {
      if (error.code === "23505") return toast.error("Dit artikelnummer bestaat al binnen deze organisatie");
      return toast.error(error.message);
    }
    toast.success(editingId ? "Product bijgewerkt" : "Product aangemaakt");
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    load();
  }

  const [search, setSearch] = useState("");
  const [pricingFilter, setPricingFilter] = useState<"all" | PricingType>("all");

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (pricingFilter !== "all" && p.pricing_type !== pricingFilter) return false;
      if (!q) return true;
      return (
        (p.sku ?? "").toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, search, pricingFilter]);

  async function toggleActive(id: string, active: boolean) {
    const prev = products;
    setProducts((ps) => ps.map((p) => (p.id === id ? { ...p, active } : p)));
    const { error } = await supabase.from("products").update({ active }).eq("id", id);
    if (error) {
      toast.error(error.message);
      setProducts(prev);
    }
  }

  async function removeProduct(id: string) {
    if (!confirm("Product verwijderen?")) return;
    const prev = products;
    setProducts((ps) => ps.filter((p) => p.id !== id));
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      setProducts(prev);
    }
  }

  const totals = useMemo(() => {
    const t = { mrr: 0, oneTime: 0, perCredit: 0 };
    products.filter((p) => p.active).forEach((p) => {
      const cents = Number(p.unit_price_cents ?? 0);
      if (p.pricing_type === "monthly_recurring") t.mrr += cents;
      else if (p.pricing_type === "one_time") t.oneTime += cents;
      else if (p.pricing_type === "per_credit") t.perCredit += cents;
    });
    return t;
  }, [products]);

  async function exportPdf(list: Product[] = filteredProducts, opts: LayoutOpts = { marginMm: 12, scale: 1 }) {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const orgName = currentOrganization?.name ?? "";
    const now = new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });
    const m = Math.max(5, Math.min(30, opts.marginMm));
    const s = Math.max(0.6, Math.min(1.4, opts.scale));

    doc.setFontSize(16 * s);
    doc.text("Prijslijst", m, m + 3);
    doc.setFontSize(10 * s);
    doc.setTextColor(120);
    doc.text(`${orgName}${orgName ? " — " : ""}${now}`, m, m + 9);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: m + 14,
      margin: { left: m, right: m, top: m, bottom: m },
      head: [["Artikelnr.", "Naam", "Type", "Prijs", "Opstart", "BTW", "Korting", "Status"]],
      body: list.map((p) => [
        p.sku ?? "—",
        p.description ? `${p.name}\n${p.description}` : p.name,
        PRICING_LABELS[p.pricing_type],
        EUR.format(Number(p.unit_price_cents ?? 0) / 100),
        EUR.format(Number(p.setup_fee_cents ?? 0) / 100),
        `${Number(p.vat_rate)}%`,
        Number(p.discount_percent ?? 0) > 0
          ? `${Number(p.discount_percent)}% ${p.discount_type === "recurring" ? `/mnd${p.contract_months ? ` · ${p.contract_months}m` : ""}` : "eenmalig"}`
          : "—",
        p.active ? "Actief" : "Inactief",
      ]),
      styles: { fontSize: 9 * s, cellPadding: 2 * s },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 22 * s },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
      },
      didDrawPage: () => {
        const pageCount = doc.getNumberOfPages();
        const pageSize = doc.internal.pageSize;
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          `Pagina ${doc.getCurrentPageInfo().pageNumber} / ${pageCount}`,
          pageSize.getWidth() - m,
          pageSize.getHeight() - Math.max(4, m / 2),
          { align: "right" },
        );
      },
    });

    doc.save(`prijslijst-${new Date().toISOString().slice(0, 10)}.pdf`);
  }



  function printList() {
    window.print();
  }

  const [previewOpen, setPreviewOpen] = useState(false);



  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {currentOrganization?.name ?? ""} — Producten & Prijzen
          </h1>
          <p className="text-sm text-muted-foreground">
            Beheer diensten, maandtarieven en credittarieven voor de actieve organisatie.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={loading || filteredProducts.length === 0}>
          <Eye className="mr-2 h-4 w-4" /> Voorbeeld
        </Button>

        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Nieuw product
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Product bewerken" : "Nieuw product"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={saveProduct} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="p-sku">Artikelnr. *</Label>
                  <Input id="p-sku" placeholder="bv. ART-001" required maxLength={32} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="p-name">Naam *</Label>
                  <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-desc">Omschrijving</Label>
                <Textarea id="p-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="p-price">Prijs (€)</Label>
                  <Input id="p-price" type="number" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-setup">Eenmalige opstartkosten (€)</Label>
                  <Input id="p-setup" type="number" step="0.01" value={form.setup_fee} onChange={(e) => setForm({ ...form, setup_fee: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-vat">BTW %</Label>
                  <Input id="p-vat" type="number" step="0.01" value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Prijstype</Label>
                  <Select value={form.pricing_type} onValueChange={(v) => setForm({ ...form, pricing_type: v as PricingType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PRICING_LABELS) as PricingType[]).map((k) => (
                        <SelectItem key={k} value={k}>{PRICING_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-md border border-dashed p-3 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Korting</div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="p-disc">Korting %</Label>
                    <Input id="p-disc" type="number" min={0} max={100} step="0.01" value={form.discount_percent}
                      onChange={(e) => setForm({ ...form, discount_percent: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Type korting</Label>
                    <Select
                      value={form.discount_type}
                      onValueChange={(v) => setForm({ ...form, discount_type: v as "none" | "one_time" | "recurring" })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Geen</SelectItem>
                        <SelectItem value="one_time">Eenmalig</SelectItem>
                        <SelectItem value="recurring">Per maand</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="p-months">Contractduur (mnd)</Label>
                    <div className="flex items-center gap-2">
                      <input
                        id="p-use-contract"
                        type="checkbox"
                        className="h-4 w-4"
                        checked={form.use_contract}
                        onChange={(e) => setForm({
                          ...form,
                          use_contract: e.target.checked,
                          contract_months: e.target.checked ? form.contract_months : "",
                        })}
                      />
                      <Label htmlFor="p-use-contract" className="text-xs font-normal text-muted-foreground">
                        Contract gebruiken
                      </Label>
                    </div>
                    {form.use_contract && (
                      <Input id="p-months" type="number" min={1} placeholder="bv. 12"
                        value={form.contract_months}
                        onChange={(e) => setForm({ ...form, contract_months: e.target.value })} />
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? "Bijwerken" : "Opslaan"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="MRR-aanbod" value={EUR.format(totals.mrr / 100)} sub="Som actieve maandelijkse producten" />
        <SummaryCard label="Eenmalig" value={EUR.format(totals.oneTime / 100)} sub="Som actieve eenmalige producten" />
        <SummaryCard label="Per credit" value={EUR.format(totals.perCredit / 100)} sub="Som actieve credittarieven" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Zoek op artikelnr., naam of omschrijving…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={pricingFilter} onValueChange={(v) => setPricingFilter(v as "all" | PricingType)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle prijstypes</SelectItem>
            {(Object.keys(PRICING_LABELS) as PricingType[]).map((k) => (
              <SelectItem key={k} value={k}>{PRICING_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground">
          {filteredProducts.length} / {products.length}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          <Package className="mx-auto mb-2 h-6 w-6 opacity-60" />
          Nog geen producten. Voeg er één toe om te starten.
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Geen resultaten voor deze filters.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Artikelnr.</TableHead>
                <TableHead>Naam</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Prijs</TableHead>
                <TableHead className="text-right">Opstart</TableHead>
                <TableHead className="text-right">BTW</TableHead>
                <TableHead className="text-right">Korting</TableHead>
                <TableHead>Actief</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((p) => (
                <TableRow key={p.id} className={!p.active ? "opacity-50" : ""}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.sku ?? "—"}</TableCell>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={PRICING_COLOR[p.pricing_type]}>
                      {PRICING_LABELS[p.pricing_type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{EUR.format(Number(p.unit_price_cents ?? 0) / 100)}</TableCell>
                  <TableCell className="text-right tabular-nums">{EUR.format(Number(p.setup_fee_cents ?? 0) / 100)}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(p.vat_rate)}%</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(p.discount_percent ?? 0) > 0 ? (
                      <span>
                        {Number(p.discount_percent)}%
                        <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                          {p.discount_type === "recurring"
                            ? `/mnd${p.contract_months ? ` · ${p.contract_months}m` : ""}`
                            : "eenmalig"}
                        </span>
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant={p.active ? "default" : "outline"} onClick={() => toggleActive(p.id, !p.active)}>
                      {p.active ? "Actief" : "Inactief"}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removeProduct(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PrintPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        orgName={currentOrganization?.name ?? ""}
        products={products}
        initialSelection={filteredProducts.map((p) => p.id)}
        onPrint={printFromPreview}
        onPdf={exportPdf}
      />
    </div>
  );

  function printFromPreview(list: Product[], opts: LayoutOpts = { marginMm: 12, scale: 1 }) {
    const html = buildPrintableHtml(currentOrganization?.name ?? "", list, opts);
    const w = window.open("", "_blank", "width=1100,height=800");
    if (!w) return toast.error("Sta pop-ups toe om te printen");
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  }
}

type LayoutOpts = { marginMm: number; scale: number };
type SortKey = "sku" | "name" | "price" | "type";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "active" | "inactive";


function PrintPreviewDialog({
  open,
  onOpenChange,
  orgName,
  products,
  initialSelection,
  onPrint,
  onPdf,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgName: string;
  products: Product[];
  initialSelection: string[];
  onPrint: (list: Product[]) => void;
  onPdf: (list: Product[]) => void;
}) {
  const now = new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelection));
  const [status, setStatus] = useState<StatusFilter>("all");
  const [pricing, setPricing] = useState<"all" | PricingType>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    if (open) setSelected(new Set(initialSelection));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const visible = useMemo(() => {
    const list = products.filter((p) => {
      if (status === "active" && !p.active) return false;
      if (status === "inactive" && p.active) return false;
      if (pricing !== "all" && p.pricing_type !== pricing) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let av: string | number = "", bv: string | number = "";
      if (sortKey === "sku") { av = (a.sku ?? "").toLowerCase(); bv = (b.sku ?? "").toLowerCase(); }
      else if (sortKey === "name") { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (sortKey === "type") { av = PRICING_LABELS[a.pricing_type]; bv = PRICING_LABELS[b.pricing_type]; }
      else if (sortKey === "price") { av = Number(a.unit_price_cents ?? 0); bv = Number(b.unit_price_cents ?? 0); }
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
    return list;
  }, [products, status, pricing, sortKey, sortDir]);

  const finalList = useMemo(() => visible.filter((p) => selected.has(p.id)), [visible, selected]);

  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((p) => next.delete(p.id));
      else visible.forEach((p) => next.add(p.id));
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Voorbeeld — Prijslijst</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2 text-sm">
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle statussen</SelectItem>
              <SelectItem value="active">Alleen actief</SelectItem>
              <SelectItem value="inactive">Alleen inactief</SelectItem>
            </SelectContent>
          </Select>
          <Select value={pricing} onValueChange={(v) => setPricing(v as "all" | PricingType)}>
            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle prijstypes</SelectItem>
              {(Object.keys(PRICING_LABELS) as PricingType[]).map((k) => (
                <SelectItem key={k} value={k}>{PRICING_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mx-1 h-6 w-px bg-border" />
          <span className="text-xs text-muted-foreground">Sorteer:</span>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sku">Artikelnr.</SelectItem>
              <SelectItem value="name">Naam</SelectItem>
              <SelectItem value="type">Type</SelectItem>
              <SelectItem value="price">Prijs</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortDir} onValueChange={(v) => setSortDir(v as SortDir)}>
            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Oplopend</SelectItem>
              <SelectItem value="desc">Aflopend</SelectItem>
            </SelectContent>
          </Select>
          <div className="mx-1 h-6 w-px bg-border" />
          <Button size="sm" variant="ghost" className="h-8" onClick={toggleAll}>
            {allVisibleSelected ? "Deselecteer zichtbaar" : "Selecteer zichtbaar"}
          </Button>
          <div className="ml-auto text-xs text-muted-foreground">
            {finalList.length} geselecteerd · {visible.length} zichtbaar · {products.length} totaal
          </div>
        </div>

        <div className="max-h-[60vh] overflow-auto rounded-md border bg-muted/30 p-4">
          <div
            className="mx-auto bg-white text-black shadow-sm"
            style={{ width: "1123px", minHeight: "794px", padding: "40px 48px", transform: "scale(0.75)", transformOrigin: "top center" }}
          >
            <div className="flex items-end justify-between border-b pb-3">
              <div>
                <div className="text-2xl font-bold">Prijslijst</div>
                <div className="text-xs text-neutral-500">{orgName}{orgName ? " — " : ""}{now}</div>
              </div>
              <div className="text-xs text-neutral-400">{finalList.length} artikelen</div>
            </div>
            <table className="mt-4 w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="w-8 px-2 py-1.5"></th>
                  {["Artikelnr.","Naam","Type","Prijs","Opstart","BTW","Korting","Status"].map((h, i) => (
                    <th key={h} className={`px-2 py-1.5 text-left font-medium ${[3,4,5].includes(i) ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((p, idx) => {
                  const isSel = selected.has(p.id);
                  return (
                    <tr key={p.id} className={`${idx % 2 ? "bg-neutral-50" : ""} ${!isSel ? "opacity-40" : ""}`}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={isSel} onChange={() => toggleOne(p.id)} className="h-3.5 w-3.5" />
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[11px]">{p.sku ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        <div className="font-medium">{p.name}</div>
                        {p.description && <div className="text-[11px] text-neutral-500">{p.description}</div>}
                      </td>
                      <td className="px-2 py-1.5">{PRICING_LABELS[p.pricing_type]}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{EUR.format(Number(p.unit_price_cents ?? 0) / 100)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{EUR.format(Number(p.setup_fee_cents ?? 0) / 100)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{Number(p.vat_rate)}%</td>
                      <td className="px-2 py-1.5">
                        {Number(p.discount_percent ?? 0) > 0
                          ? `${Number(p.discount_percent)}% ${p.discount_type === "recurring" ? `/mnd${p.contract_months ? ` · ${p.contract_months}m` : ""}` : "eenmalig"}`
                          : "—"}
                      </td>
                      <td className="px-2 py-1.5">{p.active ? "Actief" : "Inactief"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-6 text-right text-[10px] text-neutral-400">Alleen geselecteerde rijen worden geëxporteerd</div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="text-xs text-muted-foreground">Layout: A4 liggend · marges 12 mm</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Sluiten</Button>
            <Button variant="outline" disabled={finalList.length === 0} onClick={() => onPrint(finalList)}>
              <Printer className="mr-2 h-4 w-4" /> Printen
            </Button>
            <Button disabled={finalList.length === 0} onClick={() => onPdf(finalList)}>
              <FileDown className="mr-2 h-4 w-4" /> Download PDF
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function buildPrintableHtml(orgName: string, products: Product[]) {
  const now = new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });
  const rows = products.map((p, idx) => `
    <tr style="background:${idx % 2 ? "#fafafa" : "white"}">
      <td style="padding:6px 8px;font-family:monospace;font-size:11px">${escapeHtml(p.sku ?? "—")}</td>
      <td style="padding:6px 8px"><div style="font-weight:600">${escapeHtml(p.name)}</div>${p.description ? `<div style="font-size:11px;color:#666">${escapeHtml(p.description)}</div>` : ""}</td>
      <td style="padding:6px 8px">${PRICING_LABELS[p.pricing_type]}</td>
      <td style="padding:6px 8px;text-align:right">${EUR.format(Number(p.unit_price_cents ?? 0) / 100)}</td>
      <td style="padding:6px 8px;text-align:right">${EUR.format(Number(p.setup_fee_cents ?? 0) / 100)}</td>
      <td style="padding:6px 8px;text-align:right">${Number(p.vat_rate)}%</td>
      <td style="padding:6px 8px">${Number(p.discount_percent ?? 0) > 0 ? `${Number(p.discount_percent)}% ${p.discount_type === "recurring" ? `/mnd${p.contract_months ? ` · ${p.contract_months}m` : ""}` : "eenmalig"}` : "—"}</td>
      <td style="padding:6px 8px">${p.active ? "Actief" : "Inactief"}</td>
    </tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Prijslijst</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color:#111; margin:0; }
      h1 { margin:0; font-size: 22px; }
      table { width:100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
      thead th { background:#1e293b; color:white; padding:6px 8px; text-align:left; font-weight:500; }
      thead th.r { text-align:right; }
      tbody td { border-bottom: 1px solid #eee; vertical-align: top; }
    </style></head><body>
    <div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid #ddd;padding-bottom:8px">
      <div><h1>Prijslijst</h1><div style="font-size:11px;color:#666">${escapeHtml(orgName)}${orgName ? " — " : ""}${now}</div></div>
      <div style="font-size:11px;color:#999">${products.length} artikelen</div>
    </div>
    <table>
      <thead><tr><th>Artikelnr.</th><th>Naam</th><th>Type</th><th class="r">Prijs</th><th class="r">Opstart</th><th class="r">BTW</th><th>Korting</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </body></html>`;
}


function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
