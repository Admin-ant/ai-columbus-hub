import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Mail, Phone, Globe, Building2, MapPin, FileText, Briefcase, CreditCard, Users, Plus, Link2, Unlink, Pencil, Trash2, Search, History, ChevronDown, ChevronRight, Sparkles, CalendarDays, Send, Ban, FileSignature, FileCheck2, Inbox } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientContactsManager } from "@/components/clients/client-contacts-manager";
import { ClientContactsAuditLog } from "@/components/clients/client-contacts-audit-log";
import { ClientCompanyDetailsDialog } from "@/components/clients/client-company-details-dialog";
import { ClientAuditLog } from "@/components/clients/client-audit-log";
import { ClientActivityHistory } from "@/components/clients/client-activity-history";
import { ClientQuickActions } from "@/components/clients/client-quick-actions";

export const Route = createFileRoute("/_authenticated/ai-columbus/klanten/$clientId")({
  head: () => ({ meta: [{ title: "Klant detail" }] }),
  component: ClientDetailPage,
});

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type LogRow = Database["public"]["Tables"]["invoice_link_log"]["Row"];
type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
type ContractRow = Database["public"]["Tables"]["contracts"]["Row"];
type QuoteRow = Database["public"]["Tables"]["quotes"]["Row"];
type MailRow = Database["public"]["Tables"]["mail_messages"]["Row"];

const EUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

type LinkSource = "auto" | "name_match" | "manual" | "unlink" | "backfill";

function ClientDetailPage() {
  const { clientId } = Route.useParams();
  const { user } = useAuth();
  const [client, setClient] = useState<ClientRow | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [logs, setLogs] = useState<Record<string, LogRow[]>>({});
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [mails, setMails] = useState<MailRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "name_match">("all");

  async function loadAll() {
    setLoading(true);
    const { data: c, error } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
    if (error) toast.error(error.message);
    const cli = c as ClientRow | null;
    setClient(cli);

    if (cli) {
      const orgId = cli.organization_id as string | null;
      const [{ data: invsById }, { data: invsByName }, { data: byId }, { data: byName }] = await Promise.all([
        supabase.from("invoices").select("*").eq("client_id", clientId).order("issue_date", { ascending: false }),
        orgId
          ? supabase.from("invoices").select("*")
              .eq("organization_id", orgId)
              .is("client_id", null)
              .ilike("client_name", `%${cli.name}%`)
              .order("issue_date", { ascending: false })
          : Promise.resolve({ data: [] as InvoiceRow[] }),
        supabase.from("projects").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
        orgId
          ? supabase.from("projects").select("*")
              .eq("organization_id", orgId)
              .is("client_id", null)
              .ilike("name", `%${cli.name}%`)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as ProjectRow[] }),
      ]);
      const mergedProjects = [...((byId ?? []) as ProjectRow[]), ...((byName ?? []) as ProjectRow[])];
      const mergedInv = [...((invsById ?? []) as InvoiceRow[]), ...((invsByName ?? []) as InvoiceRow[])];
      setInvoices(mergedInv);
      setProjects(mergedProjects);

      // Load logs for these invoices
      const invIds = mergedInv.map(i => i.id);
      if (invIds.length > 0) {
        const { data: logRows } = await supabase
          .from("invoice_link_log")
          .select("*")
          .in("invoice_id", invIds)
          .order("created_at", { ascending: false });
        const grouped: Record<string, LogRow[]> = {};
        ((logRows ?? []) as LogRow[]).forEach(r => {
          (grouped[r.invoice_id] ||= []).push(r);
        });
        setLogs(grouped);
      } else {
        setLogs({});
      }

      const { data: appts } = await supabase
        .from("appointments")
        .select("*")
        .eq("client_id", clientId)
        .order("starts_at", { ascending: false });
      setAppointments((appts ?? []) as AppointmentRow[]);
    }
    setLoading(false);
  }

  useEffect(() => { void loadAll(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  function actorLabel() {
    return user?.email ?? user?.id ?? "systeem";
  }

  async function writeLog(invoiceId: string, source: LinkSource, opts?: { projectId?: string | null; note?: string }) {
    if (!client?.organization_id) return;
    const row = {
      invoice_id: invoiceId,
      organization_id: client.organization_id,
      client_id: source === "unlink" ? null : clientId,
      project_id: opts?.projectId ?? null,
      source,
      actor_id: user?.id ?? null,
      actor_label: actorLabel(),
      note: opts?.note ?? null,
    };
    const { data, error } = await supabase.from("invoice_link_log").insert(row).select("*").single();
    if (error) return;
    setLogs(prev => ({ ...prev, [invoiceId]: [(data as LogRow), ...(prev[invoiceId] ?? [])] }));
  }

  // Try to auto-detect a project for an invoice by matching project name in client_name/invoice description
  function detectProjectId(inv: InvoiceRow): string | null {
    if (inv.project_id) return inv.project_id;
    const blob = `${inv.client_name ?? ""}`.toLowerCase();
    if (!blob) return null;
    const match = projects.find(p => blob.includes(p.name.toLowerCase()));
    return match?.id ?? null;
  }

  async function toggleLink(projectId: string, target: string | null) {
    const prev = projects;
    setProjects(p => p.map(x => x.id === projectId ? { ...x, client_id: target } : x).filter(x => x.client_id === clientId || (x.client_id === null && client && x.name.toLowerCase().includes(client.name.toLowerCase()))));
    const { error } = await supabase.from("projects").update({ client_id: target }).eq("id", projectId);
    if (error) { toast.error(error.message); setProjects(prev); return; }
    toast.success(target ? "Project gekoppeld" : "Project losgekoppeld");
  }

  async function deleteProject(projectId: string) {
    if (!confirm("Project verwijderen?")) return;
    const prev = projects;
    setProjects(p => p.filter(x => x.id !== projectId));
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) { toast.error(error.message); setProjects(prev); return; }
    toast.success("Project verwijderd");
  }

  async function linkInvoice(invoiceId: string, source: LinkSource = "manual") {
    const inv = invoices.find(x => x.id === invoiceId);
    if (!inv) return;
    const autoProjectId = detectProjectId(inv);
    const update: { client_id: string; project_id?: string | null } = { client_id: clientId };
    if (autoProjectId && !inv.project_id) update.project_id = autoProjectId;

    const prev = invoices;
    setInvoices(list => list.map(i => i.id === invoiceId ? { ...i, ...update } : i));
    const { error } = await supabase.from("invoices").update(update).eq("id", invoiceId);
    if (error) { toast.error(error.message); setInvoices(prev); return; }
    await writeLog(invoiceId, source, {
      projectId: autoProjectId,
      note: autoProjectId ? `Project ook automatisch gekoppeld op naam-match` : undefined,
    });
    toast.success(autoProjectId ? "Factuur + project gekoppeld" : "Factuur gekoppeld aan klant");

  }

  async function linkAllNameMatches() {
    const targets = invoices.filter(i => !i.client_id);
    if (targets.length === 0) return;
    const ids = targets.map(t => t.id);
    const prev = invoices;
    setInvoices(list => list.map(i => ids.includes(i.id) ? { ...i, client_id: clientId, project_id: i.project_id ?? detectProjectId(i) } : i));
    const { error } = await supabase.from("invoices").update({ client_id: clientId }).in("id", ids);
    if (error) { toast.error(error.message); setInvoices(prev); return; }
    // Per factuur: log + indien gevonden project ook koppelen
    for (const inv of targets) {
      const pid = detectProjectId(inv);
      if (pid && !inv.project_id) {
        await supabase.from("invoices").update({ project_id: pid }).eq("id", inv.id);
      }
      await writeLog(inv.id, "name_match", { projectId: pid });
    }
    toast.success(`${targets.length} factuur/facturen gekoppeld`);
  }

  function toggleExpand(id: string) {
    setExpanded(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const filteredInvoices = useMemo(() => {
    return invoices.filter(i => {
      const linked = i.client_id === clientId;
      if (linkFilter === "linked" && !linked) return false;
      if (linkFilter === "name_match" && linked) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!`${i.invoice_number} ${i.client_name ?? ""}`.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [invoices, linkFilter, search, clientId]);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…</div>;
  }
  if (!client) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <Button variant="ghost" asChild><Link to="/ai-columbus/klanten"><ArrowLeft className="mr-2 h-4 w-4" /> Terug</Link></Button>
        <p className="text-muted-foreground">Klant niet gevonden.</p>
      </div>
    );
  }

  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total_cents ?? 0), 0);
  const totalPaid = invoices.filter(i => i.status === "paid" || i.paid_at).reduce((s, i) => s + Number(i.total_cents ?? 0), 0);
  const totalOpen = totalInvoiced - totalPaid;
  const linkedCount = invoices.filter(i => i.client_id === clientId).length;
  const nameOnlyCount = invoices.filter(i => !i.client_id).length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/ai-columbus/klanten"><ArrowLeft className="mr-2 h-4 w-4" /> Klanten</Link>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Building2 className="h-6 w-6 text-muted-foreground" /> {client.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {client.kvk_number && <>KvK {client.kvk_number} · </>}
              {client.city || "—"}
            </p>
          </div>
        </div>
        <ClientQuickActions
          clientId={clientId}
          organizationId={client.organization_id ?? ""}

          companyName={client.name}
          companyEmail={client.email}
          companyPhone={client.phone}
        />

      </div>

      <Tabs defaultValue="overzicht" className="w-full">
        <TabsList>
          <TabsTrigger value="overzicht"><Building2 className="mr-2 h-4 w-4" /> Overzicht</TabsTrigger>
          <TabsTrigger value="contacten"><Users className="mr-2 h-4 w-4" /> Contactpersonen</TabsTrigger>
          <TabsTrigger value="projecten"><Briefcase className="mr-2 h-4 w-4" /> Projecten <Badge variant="secondary" className="ml-2">{projects.length}</Badge></TabsTrigger>
          <TabsTrigger value="betalingen"><CreditCard className="mr-2 h-4 w-4" /> Betalingen <Badge variant="secondary" className="ml-2">{invoices.length}</Badge></TabsTrigger>
          <TabsTrigger value="afspraken"><CalendarDays className="mr-2 h-4 w-4" /> Afspraken <Badge variant="secondary" className="ml-2">{appointments.length}</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value="overzicht" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Bedrijfsgegevens</CardTitle>
                <ClientCompanyDetailsDialog client={client} onSaved={loadAll} />
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Field label="Bedrijfsnaam" value={client.name} />
                <Field label="KvK-nummer" value={client.kvk_number} />
                <Field label="BTW-nummer" value={client.vat_number} />
                <Field label="Maandbedrag" value={client.monthly_value != null ? EUR.format(Number(client.monthly_value)) : "—"} />
                {client.website && (
                  <div className="flex items-center gap-2 pt-1">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a className="text-brand hover:underline" href={client.website.startsWith("http") ? client.website : `https://${client.website}`} target="_blank" rel="noreferrer">{client.website}</a>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4" /> Adres</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>{client.address_line1 || "—"}</div>
                {client.address_line2 && <div>{client.address_line2}</div>}
                <div>{[client.postal_code, client.city].filter(Boolean).join(" ") || "—"}</div>
                <div className="text-muted-foreground">{client.country || ""}</div>
              </CardContent>
            </Card>
            {client.notes && (
              <Card className="md:col-span-2">
                <CardHeader><CardTitle className="text-base">Notities</CardTitle></CardHeader>
                <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">{client.notes}</CardContent>
              </Card>
            )}
          </div>
          <div className="mt-4 space-y-4">
            <ClientActivityHistory clientId={clientId} />
            <ClientAuditLog clientId={clientId} />
          </div>
        </TabsContent>


        <TabsContent value="contacten" className="mt-4 space-y-4">
          <ClientContactsManager clientId={clientId} organizationId={client.organization_id} />
          <ClientContactsAuditLog clientId={clientId} />
        </TabsContent>


        <TabsContent value="projecten" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">Projecten</CardTitle>
                <CardDescription>Gekoppeld aan deze klant of voorgesteld op basis van naam.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link to="/ai-columbus/projecten"><Briefcase className="mr-2 h-4 w-4" /> Beheren</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/ai-columbus/projecten"><Plus className="mr-2 h-4 w-4" /> Nieuw project</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {projects.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Nog geen projecten voor deze klant. Maak er een aan via "Nieuw project".</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-4 py-2 font-medium">Project</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Doelmaand</th>
                      <th className="px-4 py-2 text-right font-medium">Waarde</th>
                      <th className="px-4 py-2 text-right font-medium">Acties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map(p => {
                      const linked = p.client_id === clientId;
                      return (
                        <tr key={p.id} className="border-t">
                          <td className="px-4 py-2 font-medium">
                            <div className="flex items-center gap-2">
                              {p.name}
                              {!linked && <Badge variant="secondary" className="text-[10px]">naam-match</Badge>}
                            </div>
                          </td>
                          <td className="px-4 py-2"><Badge variant="outline">{String(p.status).replace(/_/g, " ")}</Badge></td>
                          <td className="px-4 py-2 text-muted-foreground">{p.target_month ? String(p.target_month).slice(0, 7) : "—"}</td>
                          <td className="px-4 py-2 text-right">{EUR.format(Number(p.value_cents) / 100)}</td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              {linked ? (
                                <Button variant="ghost" size="sm" title="Loskoppelen" onClick={() => toggleLink(p.id, null)}>
                                  <Unlink className="h-3.5 w-3.5" />
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" title="Koppelen aan deze klant" onClick={() => toggleLink(p.id, clientId)}>
                                  <Link2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" asChild title="Openen / beheren">
                                <Link to="/ai-columbus/projecten/$projectId" params={{ projectId: p.id }}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Link>
                              </Button>
                              <Button variant="ghost" size="sm" title="Verwijderen" onClick={() => deleteProject(p.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="betalingen" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Totaal gefactureerd" value={EUR.format(totalInvoiced / 100)} />
            <Stat label="Betaald" value={EUR.format(totalPaid / 100)} accent="text-emerald-600" />
            <Stat label="Openstaand" value={EUR.format(totalOpen / 100)} accent={totalOpen > 0 ? "text-orange-600" : ""} />
          </div>

          {invoices.length > 0 && (
            <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm ${nameOnlyCount > 0 ? "border-orange-300 bg-orange-50 dark:bg-orange-950/20" : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20"}`}>
              <div className="flex items-center gap-2">
                {nameOnlyCount > 0 ? (
                  <>
                    <Unlink className="h-4 w-4 text-orange-600" />
                    <span><strong>{nameOnlyCount}</strong> factuur/facturen alleen via naam-match gevonden. <strong>{linkedCount}</strong> automatisch gekoppeld.</span>
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4 text-emerald-600" />
                    <span>Alle <strong>{linkedCount}</strong> factuur/facturen zijn automatisch gekoppeld via klant-ID.</span>
                  </>
                )}
              </div>
              {nameOnlyCount > 0 && (
                <Button size="sm" variant="outline" onClick={linkAllNameMatches}>
                  <Sparkles className="mr-2 h-3.5 w-3.5" /> Alles automatisch koppelen (incl. project)
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Zoek op factuurnr. of klantnaam…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={linkFilter} onValueChange={(v) => setLinkFilter(v as typeof linkFilter)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle facturen</SelectItem>
                <SelectItem value="linked">Auto-gekoppeld</SelectItem>
                <SelectItem value="name_match">Naam-match (mist koppeling)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Facturen <Badge variant="outline" className="ml-2">{filteredInvoices.length}/{invoices.length}</Badge></CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {filteredInvoices.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Geen facturen die aan deze filters voldoen.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="w-8 px-2 py-2"></th>
                      <th className="px-4 py-2 font-medium">Nummer</th>
                      <th className="px-4 py-2 font-medium">Koppeling</th>
                      <th className="px-4 py-2 font-medium">Project</th>
                      <th className="px-4 py-2 font-medium">Datum</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 text-right font-medium">Totaal</th>
                      <th className="px-4 py-2 text-right font-medium">Acties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map(i => {
                      const linked = i.client_id === clientId;
                      const project = projects.find(p => p.id === i.project_id);
                      const suggested = !i.project_id ? detectProjectId(i) : null;
                      const suggestedProject = suggested ? projects.find(p => p.id === suggested) : null;
                      const isOpen = expanded.has(i.id);
                      const invLogs = logs[i.id] ?? [];
                      return (
                        <FragmentRow key={i.id}>
                          <tr className="border-t">
                            <td className="px-2 py-2">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExpand(i.id)} title="Log tonen">
                                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </Button>
                            </td>
                            <td className="px-4 py-2 font-medium">{i.invoice_number}</td>
                            <td className="px-4 py-2">
                              {linked ? (
                                <Badge variant="default" className="gap-1"><Link2 className="h-3 w-3" /> Auto-gekoppeld</Badge>
                              ) : (
                                <Badge variant="secondary" className="gap-1 border-orange-300 text-orange-700"><Unlink className="h-3 w-3" /> Naam-match</Badge>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {project ? (
                                <Link to="/ai-columbus/projecten/$projectId" params={{ projectId: project.id }} className="text-brand hover:underline">{project.name}</Link>
                              ) : suggestedProject ? (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Sparkles className="h-3 w-3 text-orange-500" />
                                  <span className="italic">{suggestedProject.name}</span>
                                  <Badge variant="outline" className="text-[10px]">voorstel</Badge>
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">{i.issue_date ?? "—"}</td>
                            <td className="px-4 py-2"><Badge variant={i.status === "paid" ? "default" : "outline"}>{i.status}</Badge></td>
                            <td className="px-4 py-2 text-right">{EUR.format(Number(i.total_cents) / 100)}</td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                {!linked && (
                                  <Button variant="ghost" size="sm" title="Koppelen aan deze klant" onClick={() => linkInvoice(i.id, "manual")}>
                                    <Link2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-muted/30">
                              <td></td>
                              <td colSpan={7} className="px-4 py-3">
                                <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                                  <History className="h-3.5 w-3.5" /> Koppellog
                                </div>
                                {invLogs.length === 0 ? (
                                  <p className="mt-1 text-xs text-muted-foreground">Nog geen koppelacties geregistreerd.</p>
                                ) : (
                                  <ul className="mt-2 space-y-1.5 text-xs">
                                    {invLogs.map(l => (
                                      <li key={l.id} className="flex items-start gap-2">
                                        <SourceBadge source={l.source} />
                                        <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString("nl-NL")}</span>
                                        <span>door <strong>{l.actor_label ?? "—"}</strong></span>
                                        {l.note && <span className="text-muted-foreground">— {l.note}</span>}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          )}
                        </FragmentRow>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="afspraken" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4" /> Afspraken</CardTitle>
                <CardDescription>Alle afspraken en verzonden uitnodigingen voor deze klant.</CardDescription>
              </div>
              <Button size="sm" asChild>
                <Link to="/agenda"><Plus className="mr-2 h-4 w-4" /> Nieuwe afspraak</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {appointments.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Nog geen afspraken met deze klant. Maak er een aan via <Link to="/agenda" className="text-brand hover:underline">Agenda</Link>.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-4 py-2 font-medium">Wanneer</th>
                      <th className="px-4 py-2 font-medium">Titel</th>
                      <th className="px-4 py-2 font-medium">Locatie</th>
                      <th className="px-4 py-2 font-medium">Deelnemer</th>
                      <th className="px-4 py-2 font-medium">Uitnodiging</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map((a) => {
                      const start = new Date(a.starts_at);
                      const end = new Date(a.ends_at);
                      const cancelled = a.status === "cancelled";
                      return (
                        <tr key={a.id} className="border-t">
                          <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                            <div>{start.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>
                            <div className="text-xs">{start.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })} – {end.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}</div>
                          </td>
                          <td className={`px-4 py-2 font-medium ${cancelled ? "line-through text-muted-foreground" : ""}`}>{a.title}</td>
                          <td className="px-4 py-2 text-muted-foreground">{a.location || "—"}</td>
                          <td className="px-4 py-2 text-muted-foreground">{a.attendee_name || a.attendee_email || "—"}</td>
                          <td className="px-4 py-2">
                            {a.invite_sent_at ? (
                              <Badge variant="outline" className="gap-1"><Send className="h-3 w-3" /> {new Date(a.invite_sent_at).toLocaleDateString("nl-NL")}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {cancelled ? (
                              <Badge variant="outline" className="gap-1 border-red-300 bg-red-500/10 text-red-700 dark:text-red-300"><Ban className="h-3 w-3" /> Geannuleerd</Badge>
                            ) : (
                              <Badge variant="outline">{a.status}</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, { label: string; className: string }> = {
    auto: { label: "Auto", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
    name_match: { label: "Naam-match", className: "bg-orange-100 text-orange-800 border-orange-300" },
    manual: { label: "Handmatig", className: "bg-blue-100 text-blue-800 border-blue-300" },
    unlink: { label: "Ontkoppeld", className: "bg-red-100 text-red-800 border-red-300" },
    backfill: { label: "Backfill", className: "bg-gray-100 text-gray-800 border-gray-300" },
  };
  const m = map[source] ?? { label: source, className: "" };
  return <Badge variant="outline" className={m.className}>{m.label}</Badge>;
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}

function Stat({ label, value, accent = "" }: { label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${accent}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
