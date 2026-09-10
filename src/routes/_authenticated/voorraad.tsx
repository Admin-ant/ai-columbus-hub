import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Loader2,
  Package,
  Plus,
  Search,
  History,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { listStockMovements, getLowStockProducts } from "@/lib/inventory.functions";
import { ManualMovementDialog, ProductMovementsList } from "@/components/inventory/stock-movement-dialog";

export const Route = createFileRoute("/_authenticated/voorraad")({
  head: () => ({
    meta: [
      { title: "Voorraad" },
      { name: "description", content: "Voorraadoverzicht, mutaties en lage-voorraadmeldingen." },
      { property: "og:title", content: "Voorraad" },
      { property: "og:description", content: "Voorraadoverzicht, mutaties en lage-voorraadmeldingen." },
    ],
  }),
  component: VoorraadPage,
});

type Product = Database["public"]["Tables"]["products"]["Row"];
type Movement = Database["public"]["Tables"]["product_stock_movements"]["Row"] & {
  products: { name: string; sku: string | null } | null;
};

const REFERENCE_LABEL: Record<string, string> = {
  invoice: "Factuur",
  invoice_cancel: "Creditnota / annulatie",
  manual: "Handmatig",
  correction: "Correctie",
};

function VoorraadPage() {
  const { currentOrganizationId, currentOrganization, loading: wsLoading } = useWorkspace();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const fnListMovements = useServerFn(listStockMovements);
  const fnLowStock = useServerFn(getLowStockProducts);

  async function load() {
    if (!currentOrganizationId) {
      setProducts([]);
      setMovements([]);
      setLowStock([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: prodData, error: prodErr }, movementsData, lowData] = await Promise.all([
      supabase.from("products").select("*").eq("organization_id", currentOrganizationId).order("name"),
      fnListMovements({ data: { organization_id: currentOrganizationId } }),
      fnLowStock({ data: { organization_id: currentOrganizationId } }),
    ]);
    if (prodErr) toast.error(prodErr.message);
    setProducts((prodData ?? []) as Product[]);
    setMovements(movementsData as Movement[]);
    setLowStock(lowData as Product[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!wsLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganizationId, wsLoading]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (!p.track_stock) return false;
      if (!q) return true;
      return (
        (p.sku ?? "").toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q)
      );
    });
  }, [products, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {currentOrganization?.name ?? ""} — Voorraad
        </h1>
        <p className="text-sm text-muted-foreground">
          Overzicht van voorraad, mutaties en lage-voorraadmeldingen.
        </p>
      </div>

      <Tabs defaultValue="overzicht">
        <TabsList>
          <TabsTrigger value="overzicht">Overzicht</TabsTrigger>
          <TabsTrigger value="mutaties">
            Mutaties
            {movements.length > 0 && (
              <span className="ml-1.5 rounded bg-background/40 px-1.5 text-[10px] font-mono">
                {movements.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overzicht" className="mt-6 space-y-6">
          {lowStock.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/30 dark:bg-amber-400/10">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-5 w-5" />
                <h2 className="font-semibold">Lage voorraad</h2>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lowStock.map((p) => (
                  <div key={p.id} className="rounded-md border bg-card p-3">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.sku ?? "—"}</div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="outline" className="text-amber-700 dark:text-amber-300">
                        {Number(p.stock_quantity).toFixed(0)} op voorraad
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        drempel: {Number(p.low_stock_threshold).toFixed(0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zoek op artikelnr. of naam…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <ManualMovementDialog products={products} onDone={load} />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
              <Package className="mx-auto mb-2 h-6 w-6 opacity-60" />
              Geen producten met voorraadbeheer gevonden.
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Artikelnr.</TableHead>
                    <TableHead>Naam</TableHead>
                    <TableHead className="text-right">Voorraad</TableHead>
                    <TableHead className="text-right">Drempel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((p) => (
                    <ProductRow key={p.id} product={p} products={products} onChanged={load} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="mutaties" className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
            </div>
          ) : movements.length === 0 ? (
            <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
              <History className="mx-auto mb-2 h-6 w-6 opacity-60" />
              Nog geen voorraadmutaties.
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Hoeveelheid</TableHead>
                    <TableHead>Reden</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(m.created_at).toLocaleString("nl-NL")}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{m.products?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{m.products?.sku ?? "—"}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={movementColor(m.movement_type)}>
                          {movementLabel(m.movement_type)}
                        </Badge>
                        {m.reference_type && (
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {REFERENCE_LABEL[m.reference_type] ?? m.reference_type}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(m.quantity).toFixed(m.quantity % 1 === 0 ? 0 : 3)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                        {m.note ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProductRow({
  product,
  products,
  onChanged,
}: {
  product: Product;
  products: Product[];
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const isLow = Number(product.stock_quantity) <= Number(product.low_stock_threshold);
  return (
    <>
      <TableRow>
        <TableCell className="font-mono text-xs text-muted-foreground">{product.sku ?? "—"}</TableCell>
        <TableCell>
          <div className="font-medium">{product.name}</div>
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {Number(product.stock_quantity).toFixed(product.stock_quantity % 1 === 0 ? 0 : 3)}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {Number(product.low_stock_threshold).toFixed(product.low_stock_threshold % 1 === 0 ? 0 : 3)}
        </TableCell>
        <TableCell>
          {isLow ? (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
              <AlertTriangle className="mr-1 h-3 w-3" /> Laag
            </Badge>
          ) : (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
              OK
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-right">
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            <History className="mr-1 h-4 w-4" /> Mutaties
          </Button>
          <ManualMovementDialog products={products} productId={product.id} onDone={onChanged} />
        </TableCell>
      </TableRow>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Mutaties: {product.name}</DialogTitle>
          </DialogHeader>
          <ProductMovementsList organizationId={product.organization_id} productId={product.id} />
        </DialogContent>
      </Dialog>
    </>
  );
}


function movementLabel(type: string) {
  if (type === "in") return "In";
  if (type === "out") return "Uit";
  return "Correctie";
}

function movementColor(type: string) {
  if (type === "in") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200";
  if (type === "out") return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200";
  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200";
}
