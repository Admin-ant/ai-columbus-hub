import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, PauseCircle, PlayCircle, Plus, Trash2, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  getContract, updateContract, addContractLine, deleteContractLine, generateInvoiceNow,
} from "@/lib/contracts.functions";

export const Route = createFileRoute("/_authenticated/contracten/$contractId")({
  head: () => ({ meta: [{ title: "Contract" }] }),
  component: ContractDetail,
});

function ContractDetail() {
  const { contractId } = useParams({ from: "/_authenticated/contracten/$contractId" });
  const navigate = useNavigate();
  const fnGet = useServerFn(getContract);
  const fnUpdate = useServerFn(updateContract);
  const fnAddLine = useServerFn(addContractLine);
  const fnDelLine = useServerFn(deleteContractLine);
  const fnGenerate = useServerFn(generateInvoiceNow);

  const [state, setState] = useState<Awaited<ReturnType<typeof fnGet>> | null>(null);
  const [busy, setBusy] = useState(false);

  const [newDesc, setNewDesc] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newPrice, setNewPrice] = useState("0");

  const load = async () => {
    try {
      const r = await fnGet({ data: { id: contractId } });
      setState(r);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [contractId]);

  const contract = state?.contract as any;
  const lines = state?.lines as any[] | undefined;
  const runs = state?.runs as any[] | undefined;
  const client = state?.client as any;

  const patch = async (p: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fnUpdate({ data: { id: contractId, patch: p as never } });
      await load();
      toast.success("Bijgewerkt");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addLine = async () => {
    if (!newDesc.trim()) return;
    setBusy(true);
    try {
      await fnAddLine({
        data: {
          contractId,
          description: newDesc.trim(),
          quantity: parseFloat(newQty || "1"),
          unitPriceCents: Math.round(parseFloat(newPrice || "0") * 100),
          vatRate: 21,
        },
      });
      setNewDesc(""); setNewQty("1"); setNewPrice("0");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const genNow = async () => {
    setBusy(true);
    try {
      const r = await fnGenerate({ data: { contractId } });
      if (r.invoiceId) {
        toast.success("Factuur aangemaakt");
        navigate({ to: "/invoices/$invoiceId", params: { invoiceId: r.invoiceId } });
      } else {
        toast.message("Geen factuur aangemaakt", { description: r.status });
      }
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!contract) {
    return <div className="p-6 text-muted-foreground">Laden…</div>;
  }

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-5xl space-y-6 p-1">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/contracten"><ArrowLeft className="mr-1 h-4 w-4" /> Terug</Link>
          </Button>
          <div className="ml-auto flex gap-2">
            {contract.status === "active" ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => patch({ status: "paused" })}>
                <PauseCircle className="mr-1 h-4 w-4" /> Pauzeer
              </Button>
            ) : contract.status === "paused" || contract.status === "draft" ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => patch({ status: "active" })}>
                <PlayCircle className="mr-1 h-4 w-4" /> Activeer
              </Button>
            ) : null}
            {contract.status !== "cancelled" && contract.status !== "ended" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => patch({ status: "cancelled" })}>
                <XCircle className="mr-1 h-4 w-4" /> Beëindig
              </Button>
            )}
            <Button size="sm" disabled={busy} onClick={genNow}>
              <Zap className="mr-1 h-4 w-4" /> Genereer factuur nu
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">{contract.title}</h1>
                <Badge variant="outline" className="text-xs">{contract.status}</Badge>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Klant: {client?.name ?? "—"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold font-mono">
                € {(contract.monthly_amount_cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-muted-foreground">per maand</div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t">
            <FieldDate label="Startdatum" value={contract.start_date} onChange={(v) => patch({ start_date: v })} />
            <FieldDate label="Einddatum" value={contract.end_date} onChange={(v) => patch({ end_date: v || null })} nullable />
            <FieldDate label="Volgende factuurdatum" value={contract.next_invoice_date} onChange={(v) => patch({ next_invoice_date: v || null })} nullable />
            <div>
              <Label className="text-xs">Frequentie</Label>
              <Select value={contract.billing_frequency} onValueChange={(v) => patch({ billing_frequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Maandelijks</SelectItem>
                  <SelectItem value="quarterly">Per kwartaal</SelectItem>
                  <SelectItem value="yearly">Jaarlijks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Auto-facturatie</Label>
              <Select value={String(contract.auto_invoice)} onValueChange={(v) => patch({ auto_invoice: v === "true" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Aan</SelectItem>
                  <SelectItem value="false">Uit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Betaaltermijn (dagen)</Label>
              <Input
                type="number"
                defaultValue={contract.payment_terms_days}
                onBlur={(e) => {
                  const v = parseInt(e.target.value || "14", 10);
                  if (v !== contract.payment_terms_days) void patch({ payment_terms_days: v });
                }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Laatst gefactureerd: {contract.last_invoiced_at ? new Date(contract.last_invoiced_at).toLocaleString("nl-NL") : "nog niet"}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-base font-semibold mb-3">Regels</h2>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left py-1">Omschrijving</th>
                <th className="text-right py-1">Aantal</th>
                <th className="text-right py-1">Prijs</th>
                <th className="text-right py-1">BTW</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(lines ?? []).map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="py-2">{l.description}</td>
                  <td className="py-2 text-right">{l.quantity}</td>
                  <td className="py-2 text-right font-mono">€ {(l.unit_price_cents / 100).toFixed(2)}</td>
                  <td className="py-2 text-right">{l.vat_rate}%</td>
                  <td className="py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        await fnDelLine({ data: { id: l.id } });
                        void load();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="py-2"><Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Omschrijving" /></td>
                <td className="py-2 text-right"><Input value={newQty} onChange={(e) => setNewQty(e.target.value)} className="text-right w-20 ml-auto" /></td>
                <td className="py-2 text-right"><Input value={newPrice} onChange={(e) => setNewPrice(e.target.value)} type="number" step="0.01" className="text-right w-28 ml-auto" /></td>
                <td className="py-2 text-right text-xs text-muted-foreground">21%</td>
                <td className="py-2 text-right">
                  <Button size="sm" variant="outline" onClick={addLine} disabled={busy}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-base font-semibold mb-3">Facturatie-historie</h2>
          {(runs ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">Nog geen automatische facturen gedraaid.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left py-1">Datum</th>
                  <th className="text-left py-1">Periode</th>
                  <th className="text-left py-1">Status</th>
                  <th className="text-left py-1">Factuur</th>
                </tr>
              </thead>
              <tbody>
                {(runs ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2 text-xs">{new Date(r.created_at).toLocaleString("nl-NL")}</td>
                    <td className="py-2 text-xs">{r.period_start} → {r.period_end}</td>
                    <td className="py-2">
                      {r.status === "ok" ? (
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">ok</Badge>
                      ) : (
                        <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-300" title={r.error ?? ""}>fout</Badge>
                      )}
                    </td>
                    <td className="py-2">
                      {r.invoice_id ? (
                        <Button asChild variant="ghost" size="sm">
                          <Link to="/invoices/$invoiceId" params={{ invoiceId: r.invoice_id }}>Open</Link>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{r.error ?? "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {busy && (
          <div className="fixed bottom-4 right-4 text-xs bg-card border rounded px-3 py-1.5 shadow-sm flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> bezig…
          </div>
        )}
      </div>
    </div>
  );
}

function FieldDate({
  label, value, onChange, nullable,
}: { label: string; value: string | null; onChange: (v: string) => void; nullable?: boolean }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="date"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v !== (value ?? "")) onChange(nullable ? v : v);
        }}
      />
    </div>
  );
}
