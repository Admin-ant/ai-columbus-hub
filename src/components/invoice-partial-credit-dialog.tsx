import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { creditInvoicePartial, getInvoiceCreditInfo } from "@/lib/invoice-actions.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Info = Awaited<ReturnType<typeof getInvoiceCreditInfo>>;

const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

export function InvoicePartialCreditDialog({
  invoiceId,
  open,
  onOpenChange,
  onDone,
}: {
  invoiceId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void | Promise<void>;
}) {
  const loadInfo = useServerFn(getInvoiceCreditInfo);
  const creditFn = useServerFn(creditInvoicePartial);

  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"lines" | "amount">("lines");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [amount, setAmount] = useState("");
  const [vatRate, setVatRate] = useState("21");
  const [description, setDescription] = useState("");
  const [sendEmail, setSendEmail] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected({});
    setAmount("");
    setDescription("");
    loadInfo({ data: { invoice_id: invoiceId } })
      .then((r) => setInfo(r))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Laden mislukt"))
      .finally(() => setLoading(false));
  }, [open, invoiceId, loadInfo]);

  const selectedTotal = (info?.lines ?? []).reduce((s, l) => {
    const q = selected[l.id];
    if (!q) return s;
    const sub = Math.round(q * l.unit_price_cents);
    return s + sub + Math.round((sub * l.vat_rate) / 100);
  }, 0);

  async function submit() {
    if (!info) return;
    setSaving(true);
    try {
      const payload =
        tab === "lines"
          ? {
              invoice_id: invoiceId,
              mode: "lines" as const,
              lines: Object.entries(selected)
                .filter(([, q]) => q > 0)
                .map(([line_id, quantity]) => ({ line_id, quantity })),
              send_email: sendEmail,
            }
          : {
              invoice_id: invoiceId,
              mode: "amount" as const,
              amount_cents: Math.round(parseFloat(amount.replace(",", ".") || "0") * 100),
              vat_rate: parseFloat(vatRate.replace(",", ".") || "21"),
              description: description || undefined,
              send_email: sendEmail,
            };
      if (tab === "lines" && payload.mode === "lines" && payload.lines.length === 0) {
        toast.error("Selecteer minimaal één regel");
        setSaving(false);
        return;
      }
      const r = await creditFn({ data: payload });
      toast.success(
        `Creditnota ${r.credit_note_number} aangemaakt voor ${eur.format(r.credited_cents / 100)}`,
      );
      if (r.fully_credited) toast.success("Factuur is nu volledig gecrediteerd en geannuleerd");
      if (r.credit_emailed) toast.success("Creditnota per e-mail naar de klant verstuurd");
      onOpenChange(false);
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Crediteren mislukt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Gedeeltelijk crediteren</DialogTitle>
          <DialogDescription>
            Crediteer alleen het geannuleerde deel. Er wordt een aparte creditnota aangemaakt.
          </DialogDescription>
        </DialogHeader>

        {loading || !info ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 rounded-md border p-3 text-sm">
              <div>
                <div className="text-muted-foreground">Factuurtotaal</div>
                <div className="tabular-nums font-medium">
                  {eur.format(info.invoice.total_cents / 100)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Al gecrediteerd</div>
                <div className="tabular-nums font-medium">
                  {eur.format(info.credited_cents / 100)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Nog te crediteren</div>
                <div className="tabular-nums font-semibold">
                  {eur.format(info.remaining_cents / 100)}
                </div>
              </div>
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as "lines" | "amount")}>
              <TabsList>
                <TabsTrigger value="lines">Per regel</TabsTrigger>
                <TabsTrigger value="amount">Vast bedrag</TabsTrigger>
              </TabsList>

              <TabsContent value="lines" className="mt-3">
                <div className="max-h-[320px] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Omschrijving</TableHead>
                        <TableHead className="w-28 text-right">Aantal</TableHead>
                        <TableHead className="w-28 text-right">Stukprijs</TableHead>
                        <TableHead className="w-32 text-right">Crediteren</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {info.lines.map((l) => {
                        const checked = selected[l.id] !== undefined;
                        return (
                          <TableRow key={l.id}>
                            <TableCell>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) =>
                                  setSelected((s) => {
                                    const next = { ...s };
                                    if (v) next[l.id] = l.quantity;
                                    else delete next[l.id];
                                    return next;
                                  })
                                }
                              />
                            </TableCell>
                            <TableCell className="text-sm">{l.description}</TableCell>
                            <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {eur.format(l.unit_price_cents / 100)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min={0}
                                max={l.quantity}
                                step="0.01"
                                disabled={!checked}
                                value={checked ? String(selected[l.id]) : ""}
                                onChange={(e) =>
                                  setSelected((s) => ({
                                    ...s,
                                    [l.id]: Math.min(
                                      l.quantity,
                                      Math.max(0, Number(e.target.value) || 0),
                                    ),
                                  }))
                                }
                                className="h-8 text-right"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-2 text-right text-sm">
                  Te crediteren:{" "}
                  <span className="font-semibold tabular-nums">
                    {eur.format(selectedTotal / 100)}
                  </span>
                </div>
              </TabsContent>

              <TabsContent value="amount" className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="pc-amount">Bedrag incl. btw (€)</Label>
                    <Input
                      id="pc-amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pc-vat">Btw-tarief (%)</Label>
                    <Input
                      id="pc-vat"
                      inputMode="decimal"
                      value={vatRate}
                      onChange={(e) => setVatRate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pc-desc">Omschrijving</Label>
                  <Input
                    id="pc-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={`Gedeeltelijke creditering factuur ${info.invoice.invoice_number ?? ""}`}
                  />
                </div>
              </TabsContent>
            </Tabs>

            {info.credits.length > 0 && (
              <div className="rounded-md border p-3 text-sm">
                <div className="mb-1 font-medium">Eerdere creditnota's</div>
                <ul className="space-y-0.5 text-muted-foreground">
                  {info.credits.map((c) => (
                    <li key={c.id} className="flex justify-between">
                      <span>
                        {c.invoice_number} · {c.issue_date}
                      </span>
                      <span className="tabular-nums">
                        {eur.format(Math.abs(c.total_cents) / 100)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(!!v)} />
              Creditnota per e-mail naar de klant sturen (volgens klantvoorkeur)
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuleren
          </Button>
          <Button onClick={submit} disabled={saving || loading || !info}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Creditnota aanmaken
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
