import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Mail, Phone, Globe, Building2, MapPin, FileText, Briefcase, CreditCard, Users, Plus, Link2, Unlink, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/ai-columbus/klanten/$clientId")({
  head: () => ({ meta: [{ title: "Klant detail" }] }),
  component: ClientDetailPage,
});

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];

const EUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

function ClientDetailPage() {
  const { clientId } = Route.useParams();
  const [client, setClient] = useState<ClientRow | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: c, error } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
      if (error) toast.error(error.message);
      setClient(c as ClientRow | null);

      if (c) {
        const cli = c as ClientRow;
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
        const merged = [...((byId ?? []) as ProjectRow[]), ...((byName ?? []) as ProjectRow[])];
        const mergedInv = [...((invsById ?? []) as InvoiceRow[]), ...((invsByName ?? []) as InvoiceRow[])];
        setInvoices(mergedInv);
        setProjects(merged);
      }
      setLoading(false);
    })();
  }, [clientId]);

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

  async function linkInvoice(invoiceId: string) {
    const prev = invoices;
    setInvoices(list => list.map(i => i.id === invoiceId ? { ...i, client_id: clientId } : i));
    const { error } = await supabase.from("invoices").update({ client_id: clientId }).eq("id", invoiceId);
    if (error) { toast.error(error.message); setInvoices(prev); return; }
    toast.success("Factuur gekoppeld aan klant");
  }

  async function linkAllNameMatches() {
    const ids = invoices.filter(i => !i.client_id).map(i => i.id);
    if (ids.length === 0) return;
    const prev = invoices;
    setInvoices(list => list.map(i => ids.includes(i.id) ? { ...i, client_id: clientId } : i));
    const { error } = await supabase.from("invoices").update({ client_id: clientId }).in("id", ids);
    if (error) { toast.error(error.message); setInvoices(prev); return; }
    toast.success(`${ids.length} factuur/facturen gekoppeld`);
  }

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
        <div className="flex gap-2">
          {client.email && <Button variant="outline" size="sm" asChild><a href={`mailto:${client.email}`}><Mail className="mr-2 h-4 w-4" /> Mail</a></Button>}
          {client.phone && <Button variant="outline" size="sm" asChild><a href={`tel:${client.phone}`}><Phone className="mr-2 h-4 w-4" /> Bel</a></Button>}
        </div>
      </div>

      <Tabs defaultValue="overzicht" className="w-full">
        <TabsList>
          <TabsTrigger value="overzicht"><Building2 className="mr-2 h-4 w-4" /> Overzicht</TabsTrigger>
          <TabsTrigger value="contacten"><Users className="mr-2 h-4 w-4" /> Contactpersonen</TabsTrigger>
          <TabsTrigger value="projecten"><Briefcase className="mr-2 h-4 w-4" /> Projecten <Badge variant="secondary" className="ml-2">{projects.length}</Badge></TabsTrigger>
          <TabsTrigger value="betalingen"><CreditCard className="mr-2 h-4 w-4" /> Betalingen <Badge variant="secondary" className="ml-2">{invoices.length}</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value="overzicht" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Bedrijfsgegevens</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Field label="Bedrijfsnaam" value={client.name} />
                <Field label="KvK-nummer" value={client.kvk_number} />
                <Field label="BTW-nummer" value={client.vat_number} />
                <Field label="Maandbedrag" value={client.monthly_value != null ? EUR.format(Number(client.monthly_value)) : "—"} />
                {client.website && (
                  <div className="flex items-center gap-2 pt-1">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a className="text-primary hover:underline" href={client.website.startsWith("http") ? client.website : `https://${client.website}`} target="_blank" rel="noreferrer">{client.website}</a>
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
        </TabsContent>

        <TabsContent value="contacten" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contactpersonen</CardTitle>
              <CardDescription>Primaire contactpersoon van deze klant.</CardDescription>
            </CardHeader>
            <CardContent>
              {client.contact_person || client.email || client.phone ? (
                <div className="rounded-lg border p-4">
                  <div className="font-medium">{client.contact_person || "Contactpersoon"}</div>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {client.email && <a href={`mailto:${client.email}`} className="flex items-center gap-2 hover:text-foreground"><Mail className="h-3.5 w-3.5" /> {client.email}</a>}
                    {client.phone && <a href={`tel:${client.phone}`} className="flex items-center gap-2 hover:text-foreground"><Phone className="h-3.5 w-3.5" /> {client.phone}</a>}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nog geen contactpersoon ingevoerd.</p>
              )}
            </CardContent>
          </Card>
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

          {(() => {
            const linkedCount = invoices.filter(i => i.client_id === clientId).length;
            const nameOnlyCount = invoices.filter(i => !i.client_id).length;
            if (invoices.length === 0) return null;
            return (
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
                    <Link2 className="mr-2 h-3.5 w-3.5" /> Alles koppelen
                  </Button>
                )}
              </div>
            );
          })()}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Facturen</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {invoices.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Nog geen facturen voor deze klant.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-4 py-2 font-medium">Nummer</th>
                      <th className="px-4 py-2 font-medium">Koppeling</th>
                      <th className="px-4 py-2 font-medium">Datum</th>
                      <th className="px-4 py-2 font-medium">Vervalt</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 text-right font-medium">Totaal</th>
                      <th className="px-4 py-2 text-right font-medium">Acties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(i => {
                      const linked = i.client_id === clientId;
                      return (
                        <tr key={i.id} className="border-t">
                          <td className="px-4 py-2 font-medium">{i.invoice_number}</td>
                          <td className="px-4 py-2">
                            {linked ? (
                              <Badge variant="default" className="gap-1"><Link2 className="h-3 w-3" /> Auto-gekoppeld</Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1 border-orange-300 text-orange-700"><Unlink className="h-3 w-3" /> Naam-match</Badge>
                            )}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{i.issue_date ?? "—"}</td>
                          <td className="px-4 py-2 text-muted-foreground">{i.due_date ?? "—"}</td>
                          <td className="px-4 py-2"><Badge variant={i.status === "paid" ? "default" : "outline"}>{i.status}</Badge></td>
                          <td className="px-4 py-2 text-right">{EUR.format(Number(i.total_cents) / 100)}</td>
                          <td className="px-4 py-2 text-right">
                            {!linked && (
                              <Button variant="ghost" size="sm" title="Koppelen aan deze klant" onClick={() => linkInvoice(i.id)}>
                                <Link2 className="h-3.5 w-3.5" />
                              </Button>
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
