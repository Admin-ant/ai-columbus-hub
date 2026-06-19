import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Package } from "lucide-react";

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

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrganizationId) return toast.error("Selecteer eerst een organisatie");
    if (!form.name.trim()) return toast.error("Naam is verplicht");
    const sku = form.sku.trim();
    if (!sku) return toast.error("Artikelnr. (SKU) is verplicht");
    if (!/^[A-Za-z0-9._-]{2,32}$/.test(sku))
      return toast.error("Artikelnr. mag alleen letters, cijfers, '.', '_' of '-' bevatten (2-32 tekens)");
    if (products.some((p) => (p.sku ?? "").toLowerCase() === sku.toLowerCase()))
      return toast.error("Dit artikelnummer bestaat al binnen deze organisatie");
    setSaving(true);
    const { error } = await supabase.from("products").insert({
      organization_id: currentOrganizationId,
      sku,
      name: form.name.trim(),
      description: form.description.trim() || null,
      unit_price_cents: Math.round(Number(form.unit_price) * 100),
      setup_fee_cents: Math.round(Number(form.setup_fee) * 100),
      pricing_type: form.pricing_type,
      vat_rate: Number(form.vat_rate) || 0,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      if (error.code === "23505") return toast.error("Dit artikelnummer bestaat al binnen deze organisatie");
      return toast.error(error.message);
    }
    toast.success("Product aangemaakt");
    setOpen(false);
    setForm({ sku: "", name: "", description: "", unit_price: "0", setup_fee: "0", pricing_type: "one_time", vat_rate: "21" });
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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nieuw product
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nieuw product</DialogTitle>
            </DialogHeader>
            <form onSubmit={createProduct} className="space-y-3">
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
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Opslaan
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
                  <TableCell>
                    <Button size="sm" variant={p.active ? "default" : "outline"} onClick={() => toggleActive(p.id, !p.active)}>
                      {p.active ? "Actief" : "Inactief"}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
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
    </div>
  );
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
