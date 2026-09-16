import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Switch } from "@/components/ui/switch";
import {
  deleteTicketCategory,
  getTicketMailSettings,
  saveTicketMailSettings,
  upsertTicketCategory,
} from "@/lib/tickets.functions";

export const Route = createFileRoute("/_authenticated/tickets/instellingen")({
  head: () => ({
    meta: [
      { title: "Ticket-categorieën instellen" },
      { name: "description", content: "Beheer de categorieën waarmee tickets worden ingedeeld." },
      { property: "og:title", content: "Ticket-categorieën instellen" },
      { property: "og:description", content: "Beheer de categorieën waarmee tickets worden ingedeeld." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TicketSettingsPage,
});

type Cat = { id: string; name: string; color: string | null; sort_order: number };

function TicketSettingsPage() {
  const { currentOrganizationId } = useWorkspace();
  const upsert = useServerFn(upsertTicketCategory);
  const del = useServerFn(deleteTicketCategory);

  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const loadMail = useServerFn(getTicketMailSettings);
  const saveMail = useServerFn(saveTicketMailSettings);
  const [mail, setMail] = useState({ reply: "", notify: "", statusNotify: true });
  const [mailHints, setMailHints] = useState({ reply: "", notify: "" });
  const [mailSaving, setMailSaving] = useState(false);

  useEffect(() => {
    if (!currentOrganizationId) return;
    void loadMail({ data: { organization_id: currentOrganizationId } })
      .then((d) => {
        setMail({
          reply: d.ticket_reply_to,
          notify: d.ticket_notify_email,
          statusNotify: d.ticket_status_notify,
        });
        setMailHints({ reply: d.fallback_reply_to, notify: d.fallback_notify });
      })
      .catch(() => undefined);
  }, [currentOrganizationId, loadMail]);

  async function saveMailSettings() {
    if (!currentOrganizationId) return;
    setMailSaving(true);
    try {
      await saveMail({
        data: {
          organization_id: currentOrganizationId,
          ticket_reply_to: mail.reply.trim() || null,
          ticket_notify_email: mail.notify.trim() || null,
          ticket_status_notify: mail.statusNotify,
        },
      });
      toast.success("E-mailinstellingen opgeslagen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    } finally {
      setMailSaving(false);
    }
  }


  const refresh = useCallback(async () => {
    if (!currentOrganizationId) return;
    setLoading(true);
    const { data } = await supabase
      .from("ticket_categories")
      .select("id, name, color, sort_order")
      .eq("organization_id", currentOrganizationId)
      .order("sort_order")
      .order("name");
    setCats((data ?? []) as Cat[]);
    setLoading(false);
  }, [currentOrganizationId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function add() {
    if (!currentOrganizationId || !name.trim()) return;
    setSaving(true);
    try {
      await upsert({ data: { organization_id: currentOrganizationId, name: name.trim(), sort_order: 100 } });
      setName("");
      toast.success("Categorie toegevoegd");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  async function rename(c: Cat, value: string) {
    if (!currentOrganizationId || !value.trim() || value === c.name) return;
    try {
      await upsert({ data: { id: c.id, organization_id: currentOrganizationId, name: value.trim(), sort_order: c.sort_order } });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  }

  async function remove(id: string) {
    if (!confirm("Categorie verwijderen? Tickets behouden hun inhoud.")) return;
    try {
      await del({ data: { id } });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <div>
        <Link to="/tickets" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Terug naar tickets
        </Link>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Ticketinstellingen</h1>
        <p className="text-sm text-muted-foreground">E-mailadressen, meldingen en categorieën voor je tickets.</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">E-mail</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Antwoordadres</Label>
            <Input
              type="email"
              value={mail.reply}
              onChange={(e) => setMail({ ...mail, reply: e.target.value })}
              placeholder={mailHints.reply || "support@jouwbedrijf.nl"}
            />
            <p className="text-xs text-muted-foreground">
              Hier komen antwoorden van melders binnen. Leeg = {mailHints.reply || "je algemene antwoordadres"}.
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Tickets naar mij sturen op</Label>
            <Input
              type="email"
              value={mail.notify}
              onChange={(e) => setMail({ ...mail, notify: e.target.value })}
              placeholder={mailHints.notify || "jij@jouwbedrijf.nl"}
            />
            <p className="text-xs text-muted-foreground">
              Naar dit adres gaan nieuwe meldingen, statuswijzigingen en de historiek. Leeg = {mailHints.notify || "je organisatie-e-mailadres"}.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">E-mail bij statuswijziging</p>
              <p className="text-xs text-muted-foreground">Bijvoorbeeld van nieuw naar in behandeling of gesloten.</p>
            </div>
            <Switch
              checked={mail.statusNotify}
              onCheckedChange={(v) => setMail({ ...mail, statusNotify: v })}
            />
          </div>
          <div>
            <Button onClick={saveMailSettings} disabled={mailSaving}>
              {mailSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Opslaan
            </Button>
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Nieuwe categorie</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-[220px] flex-1 gap-2">
            <Label>Naam</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="bv. Storing" />
          </div>
          <Button onClick={add} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Toevoegen
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Bestaande categorieën</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Laden...</div>
          ) : cats.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nog geen categorieën.</div>
          ) : (
            <ul className="divide-y">
              {cats.map((c) => (
                <li key={c.id} className="flex items-center gap-2 py-2">
                  <Input
                    defaultValue={c.name}
                    onBlur={(e) => void rename(c, e.target.value)}
                    className="max-w-sm"
                  />
                  <Save className="h-3 w-3 text-muted-foreground" />
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => remove(c.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
