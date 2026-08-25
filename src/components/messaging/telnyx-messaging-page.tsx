import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Settings2, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getTelnyxSettings,
  saveTelnyxSettings,
  listTelnyxMessages,
  sendTelnyxMessage,
} from "@/lib/telnyx.functions";

type Channel = "sms" | "whatsapp";

type Message = {
  id: string;
  channel: string;
  direction: string;
  from_number: string | null;
  to_number: string;
  body: string;
  status: string;
  error: string | null;
  created_at: string;
};

type Settings = {
  messaging_profile_id: string | null;
  sms_from_number: string | null;
  whatsapp_from_number: string | null;
  enabled: boolean;
};

const emptySettings: Settings = {
  messaging_profile_id: "",
  sms_from_number: "",
  whatsapp_from_number: "",
  enabled: true,
};

export function TelnyxMessagingPage({
  channel,
  title,
  description,
  icon,
}: {
  channel: Channel;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  const { currentOrganizationId, currentOrganization } = useWorkspace();
  const fetchSettings = useServerFn(getTelnyxSettings);
  const persistSettings = useServerFn(saveTelnyxSettings);
  const fetchMessages = useServerFn(listTelnyxMessages);
  const send = useServerFn(sendTelnyxMessage);

  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [apiKeyOk, setApiKeyOk] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!currentOrganizationId) return;
    setLoading(true);
    try {
      const [s, m] = await Promise.all([
        fetchSettings({ data: { organization_id: currentOrganizationId } }),
        fetchMessages({ data: { organization_id: currentOrganizationId, channel } }),
      ]);
      setApiKeyOk(s.api_key_configured);
      setSettings(s.settings ? { ...emptySettings, ...(s.settings as Settings) } : emptySettings);
      setMessages(m as Message[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Laden mislukt");
    } finally {
      setLoading(false);
    }
  }, [currentOrganizationId, channel, fetchSettings, fetchMessages]);

  useEffect(() => {
    void load();
  }, [load]);

  const fromNumber = channel === "sms" ? settings.sms_from_number : settings.whatsapp_from_number;

  async function handleSend() {
    if (!currentOrganizationId) return;
    if (!to.trim() || !body.trim()) {
      toast.error("Vul een nummer en bericht in");
      return;
    }
    setSending(true);
    try {
      await send({
        data: { organization_id: currentOrganizationId, channel, to: to.trim(), body },
      });
      toast.success("Bericht verstuurd");
      setBody("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Versturen mislukt");
    } finally {
      setSending(false);
    }
  }

  async function handleSaveSettings() {
    if (!currentOrganizationId) return;
    setSaving(true);
    try {
      await persistSettings({
        data: {
          organization_id: currentOrganizationId,
          messaging_profile_id: settings.messaging_profile_id ?? null,
          sms_from_number: settings.sms_from_number ?? null,
          whatsapp_from_number: settings.whatsapp_from_number ?? null,
          enabled: settings.enabled,
        },
      });
      toast.success("Opgeslagen");
      setSettingsOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              {icon}
              {title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {currentOrganization?.name ? `${currentOrganization.name} — ` : ""}
              {description}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Vernieuwen
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Telnyx-instellingen
            </Button>
          </div>
        </div>

        {!apiKeyOk && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            De Telnyx API-sleutel ontbreekt. Voeg deze toe om berichten te kunnen versturen.
          </div>
        )}
        {apiKeyOk && !loading && !fromNumber && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Stel eerst een afzendernummer in via Telnyx-instellingen.
          </div>
        )}

        <div className="space-y-3 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider">Naar (telefoonnummer)</Label>
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="+316..."
                className="border-input bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider">Van</Label>
              <Input value={fromNumber ?? ""} readOnly className="border-input bg-muted/50" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider">Bericht</Label>
            <Textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="border-input bg-background"
              placeholder="Typ je bericht…"
            />
            <p className="text-[11px] text-muted-foreground">{body.length} tekens</p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void handleSend()} disabled={sending || !fromNumber}>
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Versturen
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Berichten</div>
          {loading ? (
            <div className="p-5">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">Nog geen berichten.</div>
          ) : (
            <ul className="divide-y divide-border">
              {messages.map((m) => (
                <li key={m.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <Badge variant={m.direction === "inbound" ? "secondary" : "outline"}>
                    {m.direction === "inbound" ? "Inkomend" : "Uitgaand"}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      {m.direction === "inbound" ? m.from_number : m.to_number} ·{" "}
                      {new Date(m.created_at).toLocaleString("nl-NL")}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                    {m.error && <p className="text-xs text-destructive">{m.error}</p>}
                  </div>
                  <Badge variant={m.status === "failed" ? "destructive" : "secondary"}>
                    {m.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="border-border bg-background text-foreground">
          <DialogHeader>
            <DialogTitle>Telnyx-instellingen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider">Messaging profile ID</Label>
              <Input
                value={settings.messaging_profile_id ?? ""}
                onChange={(e) => setSettings({ ...settings, messaging_profile_id: e.target.value })}
                placeholder="4001..."
                className="border-input bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider">SMS-afzendernummer</Label>
              <Input
                value={settings.sms_from_number ?? ""}
                onChange={(e) => setSettings({ ...settings, sms_from_number: e.target.value })}
                placeholder="+3197..."
                className="border-input bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider">
                WhatsApp-afzendernummer
              </Label>
              <Input
                value={settings.whatsapp_from_number ?? ""}
                onChange={(e) => setSettings({ ...settings, whatsapp_from_number: e.target.value })}
                placeholder="+316..."
                className="border-input bg-background"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Webhook-URL voor Telnyx: <code>/api/public/hooks/telnyx</code> met header
              <code> x-webhook-secret</code>.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSettingsOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={() => void handleSaveSettings()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
