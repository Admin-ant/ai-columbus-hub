import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Inbox, RefreshCw, UserPlus, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Lead = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  stage: string;
  notes: string | null;
  created_at: string;
};

const STAGES = [
  "nieuwe",
  "contact_opgenomen",
  "in_contact",
  "op_afspraak",
  "offerte_verzonden",
  "in_afwachting",
  "even_on_hold",
  "klant",
  "gewonnen",
  "verloren",
] as const;

const SOURCES = ["webhook", "campagne", "ai-recruiter", "contact"] as const;

export function IncomingLeadsTab({
  organizationId,
  campaigns,
}: {
  organizationId: string | null;
  campaigns: Array<{ id: string; name: string }>;
}) {
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [assignLead, setAssignLead] = useState<Lead | null>(null);
  const [assignCampaign, setAssignCampaign] = useState<string>("");
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("id,name,company,email,phone,source,stage,notes,created_at")
      .eq("organization_id", organizationId)
      .in("source", SOURCES as unknown as string[])
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast.error(error.message);
    setRows((data ?? []) as Lead[]);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStage(lead: Lead, stage: string) {
    setRows((cur) => cur.map((r) => (r.id === lead.id ? { ...r, stage } : r)));
    const { error } = await supabase.from("leads").update({ stage: stage as never }).eq("id", lead.id);
    if (error) {
      toast.error(error.message);
      load();
    } else {
      toast.success("Status bijgewerkt");
    }
  }

  async function assignToCampaign() {
    if (!assignLead || !organizationId) return;
    if (!assignCampaign) return toast.error("Kies een campagne");
    setAssigning(true);
    const { error } = await supabase.from("outreach_targets").insert({
      organization_id: organizationId,
      campaign_id: assignCampaign,
      company: assignLead.company || assignLead.name,
      contact_name: assignLead.name,
      email: assignLead.email,
      phone: assignLead.phone,
      stage: "nieuw",
      notes: assignLead.notes,
    } as never);
    setAssigning(false);
    if (error) return toast.error(error.message);
    toast.success("Toegevoegd aan campagne als prospect");
    setAssignLead(null);
    setAssignCampaign("");
  }

  if (!organizationId) {
    return <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Selecteer een organisatie.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Inbox className="h-5 w-5" /> Inkomende leads
          </h2>
          <p className="text-xs text-muted-foreground">
            Laatste 50 leads uit webhooks, campagnes, AI-Recruiter en contactformulieren.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
          Vernieuwen
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Datum</th>
              <th className="px-3 py-2 text-left">Naam</th>
              <th className="px-3 py-2 text-left">Bedrijf</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Bron</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Acties</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Laden…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nog geen inkomende leads.</td></tr>
            ) : (
              rows.map((l) => (
                <tr key={l.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(l.created_at).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-3 py-2 font-medium">{l.name}</td>
                  <td className="px-3 py-2">{l.company ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{l.email ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-xs">{l.source ?? "—"}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Select value={l.stage} onValueChange={(v) => changeStage(l, v)}>
                      <SelectTrigger className="h-8 w-[170px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.map((s) => (
                          <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setOpenLead(l)}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setAssignLead(l); setAssignCampaign(""); }}>
                      <UserPlus className="h-3.5 w-3.5 mr-1" /> Campagne
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Open / detail */}
      <Dialog open={!!openLead} onOpenChange={(o) => !o && setOpenLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{openLead?.name}</DialogTitle>
            <DialogDescription>{openLead?.company ?? ""}</DialogDescription>
          </DialogHeader>
          {openLead && (
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Email:</span> {openLead.email ?? "—"}</div>
              <div><span className="text-muted-foreground">Telefoon:</span> {openLead.phone ?? "—"}</div>
              <div><span className="text-muted-foreground">Bron:</span> {openLead.source ?? "—"}</div>
              <div><span className="text-muted-foreground">Status:</span> {openLead.stage}</div>
              <div><span className="text-muted-foreground">Binnengekomen:</span> {new Date(openLead.created_at).toLocaleString("nl-NL")}</div>
              {openLead.notes && (
                <div>
                  <div className="text-muted-foreground mb-1">Notities / bericht:</div>
                  <pre className="whitespace-pre-wrap rounded bg-muted/50 p-3 text-xs">{openLead.notes}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign to campaign */}
      <Dialog open={!!assignLead} onOpenChange={(o) => !o && setAssignLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Toewijzen aan campagne</DialogTitle>
            <DialogDescription>
              Maakt een prospect aan in de gekozen outreach-campagne op basis van deze lead.
            </DialogDescription>
          </DialogHeader>
          <Select value={assignCampaign} onValueChange={setAssignCampaign}>
            <SelectTrigger><SelectValue placeholder="Kies campagne…" /></SelectTrigger>
            <SelectContent>
              {campaigns.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">Geen campagnes beschikbaar.</div>
              ) : campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignLead(null)}>Annuleren</Button>
            <Button onClick={assignToCampaign} disabled={assigning || !assignCampaign}>
              {assigning ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1 h-4 w-4" />}
              Toevoegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
