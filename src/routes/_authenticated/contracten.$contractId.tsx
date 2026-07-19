import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Check, CloudOff, Download, Link2, Link2Off, Loader2, PauseCircle, PlayCircle, Plus, Trash2, XCircle, Zap } from "lucide-react";
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
  const [autosave, setAutosave] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [newDesc, setNewDesc] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newPrice, setNewPrice] = useState("0");
  const [newVat, setNewVat] = useState("21");

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

  // Persist in-progress "add line" input across reloads so it never gets lost.
  const draftKey = `contract-line-draft:${contractId}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.desc) setNewDesc(d.desc);
        if (d.qty) setNewQty(d.qty);
        if (d.price) setNewPrice(d.price);
        if (d.vat) setNewVat(d.vat);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);
  useEffect(() => {
    try {
      if (newDesc || newQty !== "1" || newPrice !== "0" || newVat !== "21") {
        localStorage.setItem(draftKey, JSON.stringify({ desc: newDesc, qty: newQty, price: newPrice, vat: newVat }));
      } else {
        localStorage.removeItem(draftKey);
      }
    } catch { /* ignore */ }
  }, [newDesc, newQty, newPrice, newVat, draftKey]);

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

  // Silent autosave: no toast, no full reload — just push the patch and update status.
  const autosavePatch = async (p: Record<string, unknown>) => {
    setAutosave("saving");
    try {
      await fnUpdate({ data: { id: contractId, patch: p as never } });
      setState((prev) => prev ? { ...prev, contract: { ...(prev as any).contract, ...p } } as any : prev);
      setAutosave("saved");
    } catch (e) {
      setAutosave("error");
      toast.error("Automatisch opslaan mislukt: " + (e as Error).message);
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
          vatRate: parseFloat(newVat || "21"),
        },
      });
      setNewDesc(""); setNewQty("1"); setNewPrice("0"); setNewVat("21");
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

  const exportPdf = async () => {
    setBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const M = 15;
      let y = M;

      doc.setFontSize(18).setFont("helvetica", "bold");
      doc.text(contract.title || "Contract", M, y);
      y += 8;
      doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(90);
      doc.text(`Status: ${contract.status}`, M, y);
      doc.text(`Aangemaakt: ${new Date().toLocaleDateString("nl-NL")}`, 210 - M, y, { align: "right" });
      y += 8;
      doc.setTextColor(0);

      doc.setFont("helvetica", "bold").text("Klant", M, y);
      doc.setFont("helvetica", "normal");
      y += 5;
      doc.text(client?.name ?? "—", M, y); y += 5;
      if (client?.email) { doc.text(String(client.email), M, y); y += 5; }

      y += 3;
      doc.setFont("helvetica", "bold").text("Contract", M, y);
      doc.setFont("helvetica", "normal");
      y += 5;
      const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("nl-NL") : "—");
      const freq = contract.billing_frequency === "monthly" ? "Maandelijks"
        : contract.billing_frequency === "quarterly" ? "Per kwartaal" : "Jaarlijks";
      const info: [string, string][] = [
        ["Startdatum", fmtDate(contract.start_date)],
        ["Einddatum", fmtDate(contract.end_date)],
        ["Frequentie", freq],
        ["Betaaltermijn", `${contract.payment_terms_days} dagen`],
        ["Auto-facturatie", contract.auto_invoice ? "Aan" : "Uit"],
        ["Volgende factuur", fmtDate(contract.next_invoice_date)],
      ];
      info.forEach(([k, v]) => { doc.text(`${k}: ${v}`, M, y); y += 5; });

      y += 3;
      const rows = (lines ?? []).map((l: any) => {
        const excl = (Number(l.quantity) || 0) * (Number(l.unit_price_cents) || 0);
        return [
          l.description,
          String(l.quantity),
          `€ ${(l.unit_price_cents / 100).toFixed(2)}`,
          `${l.vat_rate}%`,
          `€ ${(excl / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}`,
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [["Omschrijving", "Aantal", "Prijs", "BTW", "Totaal excl."]],
        body: rows.length ? rows : [["Geen regels", "", "", "", ""]],
        theme: "striped",
        headStyles: { fillColor: [30, 41, 59] },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
        margin: { left: M, right: M },
      });

      let subtotal = 0, vatTotal = 0;
      const byRate = new Map<number, { excl: number; vat: number }>();
      for (const l of lines ?? []) {
        const excl = Math.round((Number(l.quantity) || 0) * (Number(l.unit_price_cents) || 0));
        const vat = Math.round((excl * (Number(l.vat_rate) || 0)) / 100);
        subtotal += excl; vatTotal += vat;
        const cur = byRate.get(Number(l.vat_rate) || 0) ?? { excl: 0, vat: 0 };
        cur.excl += excl; cur.vat += vat; byRate.set(Number(l.vat_rate) || 0, cur);
      }
      const fmtC = (c: number) => `€ ${(c / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}`;
      const finalY = (doc as any).lastAutoTable?.finalY ?? y;
      let ty = finalY + 8;
      const right = 210 - M;
      const label = (t: string, v: string, bold = false) => {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.text(t, right - 55, ty);
        doc.text(v, right, ty, { align: "right" });
        ty += 6;
      };
      label("Subtotaal (excl. btw)", fmtC(subtotal));
      Array.from(byRate.entries()).sort((a, b) => a[0] - b[0]).forEach(([rate, v]) => {
        label(`Btw ${rate}%`, fmtC(v.vat));
      });
      label("Totaal incl. btw", fmtC(subtotal + vatTotal), true);

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8).setTextColor(120);
        doc.text(`Pagina ${i} van ${pageCount}`, 210 - M, 297 - 8, { align: "right" });
        doc.text(contract.title || "Contract", M, 297 - 8);
      }

      const safe = (contract.title || "contract").replace(/[^\w\-]+/g, "_").slice(0, 60);
      doc.save(`${safe}.pdf`);
      toast.success("PDF gedownload");
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
            <Button size="sm" variant="outline" disabled={busy} onClick={exportPdf}>
              <Download className="mr-1 h-4 w-4" /> PDF
            </Button>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t mt-3">
            <div>
              <Label className="text-xs">Betaallink op factuur</Label>
              <Select
                value={String(!!contract.payment_link_enabled)}
                onValueChange={(v) => patch({ payment_link_enabled: v === "true" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Uit</SelectItem>
                  <SelectItem value="true">Aan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <PaymentLinkUrlField
                enabled={!!contract.payment_link_enabled}
                value={contract.payment_link_url ?? ""}
                onSave={(v) => patch({ payment_link_url: v })}
              />
              <div className="flex items-center gap-2 mt-2">
                {contract.payment_link_enabled ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent text-xs">
                    <Link2 className="mr-1 h-3 w-3" /> Betaallink actief
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-xs">
                    <Link2Off className="mr-1 h-3 w-3" /> Betaallink inactief
                  </Badge>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {contract.payment_link_enabled
                    ? "De link wordt automatisch toegevoegd aan elke nieuwe factuur."
                    : "Er wordt geen betaallink op nieuwe facturen geplaatst."}
                </span>
              </div>
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
                <th className="text-right py-1">Totaal excl.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(lines ?? []).map((l) => {
                const lineExcl = (Number(l.quantity) || 0) * (Number(l.unit_price_cents) || 0);
                return (
                  <tr key={l.id} className="border-t border-border">
                    <td className="py-2">{l.description}</td>
                    <td className="py-2 text-right">{l.quantity}</td>
                    <td className="py-2 text-right font-mono">€ {(l.unit_price_cents / 100).toFixed(2)}</td>
                    <td className="py-2 text-right">{l.vat_rate}%</td>
                    <td className="py-2 text-right font-mono">€ {(lineExcl / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}</td>
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
                );
              })}
              <tr className="border-t border-border">
                <td className="py-2"><Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Omschrijving" /></td>
                <td className="py-2 text-right"><Input value={newQty} onChange={(e) => setNewQty(e.target.value)} className="text-right w-20 ml-auto" /></td>
                <td className="py-2 text-right"><Input value={newPrice} onChange={(e) => setNewPrice(e.target.value)} type="number" step="0.01" className="text-right w-28 ml-auto" /></td>
                <td className="py-2 text-right">
                  <Select value={newVat} onValueChange={setNewVat}>
                    <SelectTrigger className="w-20 ml-auto"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="9">9%</SelectItem>
                      <SelectItem value="21">21%</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-2 text-right font-mono text-xs text-muted-foreground">
                  € {(((parseFloat(newQty || "0") || 0) * (parseFloat(newPrice || "0") || 0))).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2 text-right">
                  <Button size="sm" variant="outline" onClick={addLine} disabled={busy}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>

          <ContractTotals lines={lines ?? []} />
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

function ContractTotals({ lines }: { lines: any[] }) {
  const fmt = (cents: number) =>
    `€ ${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const byRate = new Map<number, { excl: number; vat: number }>();
  let subtotal = 0;
  let vatTotal = 0;
  for (const l of lines) {
    const qty = Number(l.quantity) || 0;
    const unit = Number(l.unit_price_cents) || 0;
    const rate = Number(l.vat_rate) || 0;
    const excl = Math.round(qty * unit);
    const vat = Math.round((excl * rate) / 100);
    subtotal += excl;
    vatTotal += vat;
    const cur = byRate.get(rate) ?? { excl: 0, vat: 0 };
    cur.excl += excl;
    cur.vat += vat;
    byRate.set(rate, cur);
  }
  const total = subtotal + vatTotal;

  if (lines.length === 0) return null;

  return (
    <div className="mt-4 flex justify-end">
      <div className="w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotaal (excl. btw)</span>
          <span className="font-mono">{fmt(subtotal)}</span>
        </div>
        {Array.from(byRate.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([rate, v]) => (
            <div key={rate} className="flex justify-between text-xs text-muted-foreground">
              <span>btw {rate}% over {fmt(v.excl)}</span>
              <span className="font-mono">{fmt(v.vat)}</span>
            </div>
          ))}
        <div className="flex justify-between border-t border-border pt-1">
          <span className="text-muted-foreground">Btw totaal</span>
          <span className="font-mono">{fmt(vatTotal)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
          <span>Totaal (incl. btw)</span>
          <span className="font-mono">{fmt(total)}</span>
        </div>
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

function validatePaymentLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 500) return "URL mag maximaal 500 tekens zijn";
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return "URL moet beginnen met http:// of https://";
    }
    if (!u.hostname.includes(".")) return "Ongeldige hostnaam";
    return null;
  } catch {
    return "Ongeldige URL (bijv. https://www.mollie.com/…)";
  }
}

function PaymentLinkUrlField({
  enabled,
  value,
  onSave,
}: {
  enabled: boolean;
  value: string;
  onSave: (v: string | null) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const err = enabled ? validatePaymentLinkUrl(v) : null;
  return (
    <>
      <Label className="text-xs">Betaallink-URL (bijv. Mollie)</Label>
      <Input
        type="url"
        placeholder="https://www.mollie.com/paymentscreen/..."
        value={v}
        disabled={!enabled}
        aria-invalid={!!err}
        className={err ? "border-destructive focus-visible:ring-destructive" : ""}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const trimmed = v.trim();
          if (enabled && trimmed && validatePaymentLinkUrl(trimmed)) return;
          if (trimmed !== (value ?? "")) onSave(trimmed || null);
        }}
      />
      {err && <p className="text-[11px] text-destructive mt-1">{err}</p>}
    </>
  );
}
