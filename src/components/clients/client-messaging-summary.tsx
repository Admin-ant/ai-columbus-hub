import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MessageSquare, Phone, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getClientMessagingSummary,
  listClientPhoneNumbers,
  addClientPhoneNumber,
  deleteClientPhoneNumber,
  listMessagingLinkAudit,
} from "@/lib/telnyx.functions";

type PhoneRow = { id: string; phone: string; label: string | null; is_primary: boolean };

type Conversation = {
  phone: string;
  channel: string;
  messages: number;
  inbound: number;
  outbound: number;
  last_at: string;
  last_body: string;
  state: "nieuw" | "gekoppeld" | "opgelost";
};

type AuditRow = {
  id: string;
  phone: string;
  action: string;
  old_client_name: string | null;
  new_client_name: string | null;
  actor_email: string | null;
  created_at: string;
};

const stateVariant: Record<Conversation["state"], "secondary" | "outline" | "destructive"> = {
  nieuw: "destructive",
  gekoppeld: "secondary",
  opgelost: "outline",
};

export function ClientMessagingSummary({
  clientId,
  organizationId,
}: {
  clientId: string;
  organizationId: string;
}) {
  const fetchSummary = useServerFn(getClientMessagingSummary);
  const fetchNumbers = useServerFn(listClientPhoneNumbers);
  const addNumber = useServerFn(addClientPhoneNumber);
  const removeNumber = useServerFn(deleteClientPhoneNumber);
  const fetchAudit = useServerFn(listMessagingLinkAudit);

  const [loading, setLoading] = useState(true);
  const [numbers, setNumbers] = useState<PhoneRow[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [newPhone, setNewPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [summary, phoneRows, auditRows] = await Promise.all([
        fetchSummary({ data: { organization_id: organizationId, client_id: clientId } }),
        fetchNumbers({ data: { organization_id: organizationId, client_id: clientId } }),
        fetchAudit({ data: { organization_id: organizationId, client_id: clientId } }),
      ]);
      setConversations(summary.conversations as Conversation[]);
      setNumbers(phoneRows as PhoneRow[]);
      setAudit(auditRows as AuditRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Laden mislukt");
    } finally {
      setLoading(false);
    }
  }, [organizationId, clientId, fetchSummary, fetchNumbers, fetchAudit]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!organizationId) return;
    const sub = supabase
      .channel(`client-messaging-${clientId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "telnyx_messages" }, () => {
        void load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "client_phone_numbers" }, () => {
        void load();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(sub);
    };
  }, [organizationId, clientId, load]);

  async function handleAdd() {
    if (!newPhone.trim()) return;
    setBusy(true);
    try {
      await addNumber({
        data: { organization_id: organizationId, client_id: clientId, phone: newPhone.trim() },
      });
      setNewPhone("");
      toast.success("Nummer toegevoegd");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toevoegen mislukt");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    setBusy(true);
    try {
      await removeNumber({ data: { organization_id: organizationId, id } });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4" /> Telefoonnummers
          </CardTitle>
          <CardDescription>
            Meerdere nummers per klant; inkomende WhatsApp/SMS matcht automatisch op al deze nummers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              value={newPhone}
              onChange={(event) => setNewPhone(event.target.value)}
              placeholder="+316…"
              className="w-56"
            />
            <Button size="sm" disabled={busy || !newPhone.trim()} onClick={() => void handleAdd()}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Toevoegen
            </Button>
          </div>
          {numbers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen nummers gekoppeld.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {numbers.map((row) => (
                <li key={row.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">{row.phone}</span>
                  {row.is_primary && <Badge variant="secondary">Hoofdnummer</Badge>}
                  {row.label && <span className="text-xs text-muted-foreground">{row.label}</span>}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-7 w-7"
                    disabled={busy}
                    onClick={() => void handleRemove(row.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" /> Laatste gesprekken
          </CardTitle>
          <CardDescription>Samenvatting van WhatsApp- en SMS-gesprekken met status.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen berichten met deze klant.</p>
          ) : (
            <ul className="divide-y divide-border">
              {conversations.map((c) => (
                <li key={`${c.channel}-${c.phone}`} className="flex flex-wrap items-start gap-2 py-2.5">
                  <Badge variant="outline">{c.channel === "whatsapp" ? "WhatsApp" : "SMS"}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.phone}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.last_body}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.messages} berichten ({c.inbound} in / {c.outbound} uit) ·{" "}
                      {new Date(c.last_at).toLocaleString("nl-NL")}
                    </p>
                  </div>
                  <Badge variant={stateVariant[c.state]}>{c.state}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Koppelhistorie</CardTitle>
          <CardDescription>Alle koppelingen en verplaatsingen van nummers bij deze klant.</CardDescription>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen wijzigingen.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {audit.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Badge variant="secondary">{row.action}</Badge>
                  <span className="font-medium">{row.phone}</span>
                  <span className="text-muted-foreground">
                    {row.old_client_name ? `${row.old_client_name} → ` : ""}
                    {row.new_client_name ?? "—"}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("nl-NL")}
                    {row.actor_email ? ` · ${row.actor_email}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
