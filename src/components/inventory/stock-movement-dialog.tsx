import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { History, Loader2, Plus } from "lucide-react";

import type { Database } from "@/integrations/supabase/types";
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
import { listStockMovements, recordStockMovement } from "@/lib/inventory.functions";

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

export function ProductMovementsList({
  organizationId,
  productId,
}: {
  organizationId: string;
  productId: string;
}) {
  const fn = useServerFn(listStockMovements);
  const [rows, setRows] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fn({ data: { organization_id: organizationId, product_id: productId } })
      .then((data) => active && setRows(data as Movement[]))
      .catch((e) => active && toast.error(e instanceof Error ? e.message : "Fout"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [fn, organizationId, productId]);

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Laden…
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Geen mutaties voor dit product.</p>;
  }

  return (
    <div className="max-h-[60vh] overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Datum</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Hoeveelheid</TableHead>
            <TableHead>Reden</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(m.created_at).toLocaleString("nl-NL")}
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
              <TableCell className="text-sm text-muted-foreground">{m.note ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ManualMovementDialog({
  products,
  productId,
  onDone,
  trigger,
}: {
  products: Product[];
  productId?: string;
  onDone: () => void | Promise<void>;
  trigger?: React.ReactNode;
}) {
  const fn = useServerFn(recordStockMovement);
  const [open, setOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string>(productId ?? "");
  const [type, setType] = useState<"in" | "out" | "correction">("in");
  const [qty, setQty] = useState<string>("1");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const stockProducts = useMemo(() => products.filter((p) => p.track_stock), [products]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProduct) return toast.error("Kies een product");
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity <= 0) return toast.error("Vul een positieve hoeveelheid in");
    setSaving(true);
    try {
      await fn({ data: { product_id: selectedProduct, movement_type: type, quantity, note } });
      toast.success("Mutatie opgeslagen");
      setOpen(false);
      setQty("1");
      setNote("");
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fout");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          productId ? (
            <Button size="sm" variant="outline" className="ml-2">
              <Plus className="mr-1 h-4 w-4" /> Correctie
            </Button>
          ) : (
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" /> Handmatige mutatie
            </Button>
          )
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Handmatige voorraadmutatie</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <Select value={selectedProduct} onValueChange={setSelectedProduct} disabled={!!productId}>
              <SelectTrigger>
                <SelectValue placeholder="Kies een product" />
              </SelectTrigger>
              <SelectContent>
                {stockProducts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({Number(p.stock_quantity).toFixed(p.stock_quantity % 1 === 0 ? 0 : 3)} op voorraad)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Inkoop / in</SelectItem>
                  <SelectItem value="out">Verkoop / uit</SelectItem>
                  <SelectItem value="correction">Correctie (+)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qty">Hoeveelheid</Label>
              <Input id="qty" type="number" min={0.001} step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Reden / notitie</Label>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="bv. jaartelling of retour" />
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
  );
}

export function MutationsButton({
  product,
  products,
  onDone,
}: {
  product: Product;
  products: Product[];
  onDone: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <History className="mr-1 h-4 w-4" /> Mutaties
      </Button>
      <ManualMovementDialog
        products={products}
        productId={product.id}
        onDone={onDone}
        trigger={
          <Button size="sm" variant="outline" className="ml-2">
            <Plus className="mr-1 h-4 w-4" /> Correctie
          </Button>
        }
      />
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
