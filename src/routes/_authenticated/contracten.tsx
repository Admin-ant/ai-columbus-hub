import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileSignature, Loader2, PlayCircle, Plus } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  listContracts,
  createContract,
  runRecurringInvoices,
} from "@/lib/contracts.functions";

type ContractRow = {
  id: string;
  title: string;
  status: string;
  billing_frequency: string;
  start_date: string;
  end_date: string | null;
  monthly_amount_cents: number;
  next_invoice_date: string | null;
  last_invoiced_at: string | null;
  auto_invoice: boolean;
  client_id: string;
  client_name: string;
};

export const Route = createFileRoute("/_authenticated/contracten")({
  head: () => ({
    meta: [
      { title: "Contracten & abonnementen" },
      { name: "description", content: "Beheer abonnementen en maandelijkse facturatie." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    clientId: typeof search.clientId === "string" ? search.clientId : undefined,
    new: search.new === "1" || search.new === 1 || search.new === true ? true : undefined,
  }),
  component: ContractsShell,
});

function ContractsShell() {
  const matches = useMatches();
  const showDetail = matches.some((m) => m.routeId === "/_authenticated/contracten/$contractId");
  if (showDetail) return <Outlet />;
  return <ContractsPage />;
}

function ContractsPage() {
  const { currentOrganizationId } = useWorkspace();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [rows, setRows] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [openNew, setOpenNew] = useState(false);
  const [running, setRunning] = useState(false);
  const [initialClientId, setInitialClientId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (search.clientId || search.new) {
      setInitialClientId(search.clientId);
      setOpenNew(true);
    }
  }, [search.clientId, search.new]);

  const handleOpenChange = (v: boolean) => {
    setOpenNew(v);
    if (!v && (search.clientId || search.new)) {
      void navigate({ search: {}, replace: true });
      setInitialClientId(undefined);
    }
  };

  const fnList = useServerFn(listContracts);
  const fnRun = useServerFn(runRecurringInvoices);

  const load = async () => {
    if (!currentOrganizationId) return;
    setLoading(true);
    try {
      const data = await fnList({
        data: { organizationId: currentOrganizationId, status: statusFilter === "all" ? undefined : statusFilter },
      });
      setRows(data as ContractRow[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganizationId, statusFilter]);

  const runNow = async () => {
    setRunning(true);
    try {
      const r = await fnRun({});
      toast.success(`Gedraaid: ${r.generated} facturen aangemaakt, ${r.failed} fouten`);
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-7xl space-y-6 p-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileSignature className="h-6 w-6 text-brand" />
              Contracten & abonnementen
            </h1>
            <p className="text-sm text-muted-foreground">
              Actieve abonnementen leveren automatisch elke maand een concept-factuur op.
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statussen</SelectItem>
                <SelectItem value="draft">Concept</SelectItem>
                <SelectItem value="active">Actief</SelectItem>
                <SelectItem value="paused">Gepauzeerd</SelectItem>
                <SelectItem value="cancelled">Geannuleerd</SelectItem>
                <SelectItem value="ended">Beëindigd</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={runNow} disabled={running}>
              {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-1 h-4 w-4" />}
              Facturen nu draaien
            </Button>
            <Button size="sm" onClick={() => setOpenNew(true)}>
              <Plus className="mr-1 h-4 w-4" /> Nieuw contract
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Titel</th>
                <th className="px-3 py-2 text-left">Klant</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Frequentie</th>
                <th className="px-3 py-2 text-right">Maandbedrag</th>
                <th className="px-3 py-2 text-left">Start</th>
                <th className="px-3 py-2 text-left">Volgende factuur</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Laden…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nog geen contracten.</td></tr>
              ) : (
                rows.map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{c.title}</td>
                    <td className="px-3 py-2">{c.client_name}</td>
                    <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                    <td className="px-3 py-2 text-xs">{freqLabel(c.billing_frequency)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      € {(c.monthly_amount_cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-xs">{c.start_date}</td>
                    <td className="px-3 py-2 text-xs">{c.next_invoice_date ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/contracten/$contractId" params={{ contractId: c.id }}>Open</Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NewContractDialog open={openNew} onOpenChange={handleOpenChange} onCreated={load} initialClientId={initialClientId} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
    active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    paused: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    cancelled: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
    ended: "bg-muted text-muted-foreground",
  };
  return <Badge variant="outline" className={`text-xs ${map[status] ?? ""}`}>{status}</Badge>;
}

function freqLabel(f: string) {
  return f === "monthly" ? "Maandelijks" : f === "quarterly" ? "Per kwartaal" : "Jaarlijks";
}

function NewContractDialog({
  open,
  onOpenChange,
  onCreated,
  initialClientId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
  initialClientId?: string;
}) {
  const { currentOrganizationId } = useWorkspace();
  type ClientRow = {
    id: string;
    name: string;
    monthly_value: number | null;
    start_date: string | null;
    email: string | null;
    phone: string | null;
    contact_person: string | null;
    address_line1: string | null;
    address_line2: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
    kvk_number: string | null;
    vat_number: string | null;
    website: string | null;
  };
  type PrimaryContact = {
    first_name: string;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    job_title: string | null;
  } | null;
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [primaryContact, setPrimaryContact] = useState<PrimaryContact>(null);
  const [title, setTitle] = useState("");
  const [monthly, setMonthly] = useState("0");
  const [setup, setSetup] = useState("0");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [freq, setFreq] = useState<"monthly" | "quarterly" | "yearly">("monthly");
  const [paymentTerms, setPaymentTerms] = useState("14");
  const [saving, setSaving] = useState(false);
  const fnCreate = useServerFn(createContract);

  useEffect(() => {
    if (!open || !currentOrganizationId) return;
    void supabase
      .from("clients")
      .select("id, name, monthly_value, start_date, email, phone, contact_person, address_line1, address_line2, postal_code, city, country, kvk_number, vat_number, website")
      .eq("organization_id", currentOrganizationId)
      .order("name")
      .then(({ data }) => setClients((data as ClientRow[]) ?? []));
  }, [open, currentOrganizationId]);

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  // Load primary contact whenever a client is selected.
  useEffect(() => {
    if (!clientId) { setPrimaryContact(null); return; }
    void supabase
      .from("client_contacts")
      .select("first_name, last_name, email, phone, mobile, job_title, is_primary")
      .eq("client_id", clientId)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setPrimaryContact((data as PrimaryContact) ?? null));
  }, [clientId]);

  // Auto-fill fields when client selected (either via prefill or manual pick).
  const applyClientDefaults = (id: string) => {
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    if (!title.trim() || title.startsWith("Abonnement ")) setTitle(`Abonnement ${c.name}`);
    if (c.monthly_value && Number(c.monthly_value) > 0) setMonthly(String(c.monthly_value));
    if (c.start_date) setStartDate(c.start_date);
  };

  // Prefill client + suggested title/values when opened from a specific client card.
  useEffect(() => {
    if (!open) return;
    if (initialClientId && clients.length) {
      setClientId(initialClientId);
      applyClientDefaults(initialClientId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialClientId, clients]);



  const save = async (asDraft = false) => {
    if (!currentOrganizationId || !clientId || !title.trim()) {
      toast.error("Vul klant en titel in");
      return;
    }
    setSaving(true);
    try {
      await fnCreate({
        data: {
          organizationId: currentOrganizationId,
          clientId,
          title: title.trim(),
          monthlyCents: Math.round(parseFloat(monthly || "0") * 100),
          setupCents: Math.round(parseFloat(setup || "0") * 100),
          startDate,
          billingFrequency: freq,
          paymentTermsDays: parseInt(paymentTerms || "14", 10) || 14,
          autoInvoice: !asDraft,
          asDraft,
        },
      });
      toast.success(asDraft ? "Concept opgeslagen" : "Contract aangemaakt");
      onOpenChange(false);
      setTitle("");
      setMonthly("0");
      setSetup("0");
      onCreated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuw contract</DialogTitle>
          <DialogDescription>Maak een abonnement voor een bestaande klant.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Klant</Label>
            <Select value={clientId} onValueChange={(v) => { setClientId(v); applyClientDefaults(v); }}>
              <SelectTrigger><SelectValue placeholder="Kies klant…" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          {selectedClient && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-foreground">Klantgegevens</span>
                <span className="text-[10px] uppercase text-muted-foreground">automatisch overgenomen</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                <InfoRow label="Contactpersoon" value={
                  primaryContact
                    ? `${primaryContact.first_name}${primaryContact.last_name ? ` ${primaryContact.last_name}` : ""}${primaryContact.job_title ? ` — ${primaryContact.job_title}` : ""}`
                    : selectedClient.contact_person
                } />
                <InfoRow label="E-mail" value={primaryContact?.email ?? selectedClient.email} />
                <InfoRow label="Telefoon" value={primaryContact?.phone ?? selectedClient.phone} />
                <InfoRow label="Mobiel" value={primaryContact?.mobile} />
                <InfoRow label="Adres" value={[selectedClient.address_line1, selectedClient.address_line2].filter(Boolean).join(", ")} />
                <InfoRow label="Postcode / plaats" value={[selectedClient.postal_code, selectedClient.city].filter(Boolean).join(" ")} />
                <InfoRow label="Land" value={selectedClient.country} />
                <InfoRow label="KvK" value={selectedClient.kvk_number} />
                <InfoRow label="BTW-nr" value={selectedClient.vat_number} />
                <InfoRow label="Website" value={selectedClient.website} />
              </div>
              <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
                Facturatie- en contactgegevens komen uit de klantkaart en worden meegenomen op elke factuur van dit contract.
              </p>
            </div>
          )}

          <div>
            <Label>Titel</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="AI Telefonie abonnement" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Maandbedrag (€)</Label>
              <Input type="number" step="0.01" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
            </div>
            <div>
              <Label>Setup (€)</Label>
              <Input type="number" step="0.01" value={setup} onChange={(e) => setSetup(e.target.value)} />
            </div>
            <div>
              <Label>Startdatum</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Frequentie</Label>
              <Select value={freq} onValueChange={(v) => setFreq(v as typeof freq)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Maandelijks</SelectItem>
                  <SelectItem value="quarterly">Per kwartaal</SelectItem>
                  <SelectItem value="yearly">Jaarlijks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Betaaltermijn (dagen)</Label>
              <Input type="number" min="0" max="120" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleer</Button>
          <Button variant="secondary" onClick={() => save(true)} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Opslaan als concept
          </Button>
          <Button onClick={() => save(false)} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Aanmaken & activeren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  const v = value?.toString().trim();
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={v ? "text-foreground text-right truncate max-w-[60%]" : "text-muted-foreground/60"}>
        {v || "—"}
      </span>
    </div>
  );
}
