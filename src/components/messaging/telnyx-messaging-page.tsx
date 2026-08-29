import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, FlaskConical, Loader2, Plus, RefreshCw, Save, Send, Settings2, Trash2, UserPlus, Users } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getTelnyxSettings,
  getTelnyxMessageStatus,
  saveTelnyxSettings,
  saveMessagingWebhookSecret,
  listTelnyxMessages,
  listMessageTemplates,
  saveMessageTemplate,
  deleteMessageTemplate,
  sendTelnyxMessage,
  listMessagingClients,
  linkMessagesToClient,
  createClientFromNumber,
} from "@/lib/telnyx.functions";

type Channel = "sms" | "whatsapp";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  city: string | null;
};

function normalizePhone(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/[\s().-]/g, "");
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("00")) return `+${trimmed.slice(2)}`;
  if (trimmed.startsWith("0")) return `+31${trimmed.slice(1)}`;
  return `+${trimmed}`;
}

type Message = {
  id: string;
  client_id?: string | null;
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
  webhook_secret_configured_at?: string | null;
};

type MessageTemplate = { id: string; name: string; body: string; channel: string };

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
  const fetchStatus = useServerFn(getTelnyxMessageStatus);
  const persistWebhookSecret = useServerFn(saveMessagingWebhookSecret);
  const fetchTemplates = useServerFn(listMessageTemplates);
  const fetchClients = useServerFn(listMessagingClients);
  const linkClient = useServerFn(linkMessagesToClient);
  const createClient = useServerFn(createClientFromNumber);
  const persistTemplate = useServerFn(saveMessageTemplate);
  const removeTemplate = useServerFn(deleteMessageTemplate);

  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [apiKeyOk, setApiKeyOk] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [linkPhone, setLinkPhone] = useState<string | null>(null);
  const [linkClientId, setLinkClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkConflicts, setLinkConflicts] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    if (!currentOrganizationId) return;
    setLoading(true);
    try {
      const [s, m, t, c] = await Promise.all([
        fetchSettings({ data: { organization_id: currentOrganizationId } }),
        fetchMessages({ data: { organization_id: currentOrganizationId, channel } }),
        fetchTemplates({ data: { organization_id: currentOrganizationId, channel } }),
        fetchClients({ data: { organization_id: currentOrganizationId } }),
      ]);
      setClients(c as Client[]);
      setApiKeyOk(s.api_key_configured);
      setSettings(s.settings ? { ...emptySettings, ...(s.settings as Settings) } : emptySettings);
      setMessages(m as Message[]);
      setTemplates(t as MessageTemplate[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Laden mislukt");
    } finally {
      setLoading(false);
    }
  }, [currentOrganizationId, channel, fetchSettings, fetchMessages, fetchTemplates, fetchClients]);

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

  function renderTemplate(value: string) {
    return value
      .replaceAll("{{name}}", "Naam")
      .replaceAll("{{company}}", currentOrganization?.name ?? "Bedrijf")
      .replaceAll("{{phone}}", to.trim() || "+316…");
  }

  async function handleTestSend() {
    if (!currentOrganizationId || !to.trim() || !body.trim()) {
      toast.error("Vul een nummer en bericht in");
      return;
    }
    setSending(true);
    setTestStatus("queued");
    try {
      const sent = await send({
        data: { organization_id: currentOrganizationId, channel, to: to.trim(), body: renderTemplate(body) },
      });
      setTestStatus(sent.status);
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const latest = await fetchStatus({ data: { organization_id: currentOrganizationId, id: sent.id } });
        setTestStatus(latest.status);
        if (["delivered", "failed", "undelivered"].includes(latest.status)) break;
      }
      await load();
    } catch (e) {
      setTestStatus("failed");
      toast.error(e instanceof Error ? e.message : "Testbericht mislukt");
    } finally {
      setSending(false);
    }
  }

  async function handleSaveSecret() {
    if (!currentOrganizationId) return;
    setSaving(true);
    try {
      await persistWebhookSecret({ data: { organization_id: currentOrganizationId, secret: webhookSecret } });
      setWebhookSecret("");
      toast.success("Webhook-secret veilig opgeslagen");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTemplate() {
    if (!currentOrganizationId) return;
    try {
      await persistTemplate({
        data: { organization_id: currentOrganizationId, channel, name: templateName, body: templateBody },
      });
      setTemplateOpen(false);
      setTemplateName("");
      setTemplateBody("");
      toast.success("Template opgeslagen");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Template opslaan mislukt");
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!currentOrganizationId) return;
    try {
      await removeTemplate({ data: { organization_id: currentOrganizationId, id } });
      setSelectedTemplate("");
      toast.success("Template verwijderd");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
  }

  const clientById = new Map(clients.map((client) => [client.id, client]));
  const clientByPhone = new Map(
    clients.filter((client) => client.phone).map((client) => [normalizePhone(client.phone), client]),
  );

  function messageClient(message: Message): Client | undefined {
    if (message.client_id) return clientById.get(message.client_id);
    const counterpart = message.direction === "inbound" ? message.from_number : message.to_number;
    return clientByPhone.get(normalizePhone(counterpart));
  }

  const activeClient = clientByPhone.get(normalizePhone(to));

  function openLinkDialog(message: Message) {
    const counterpart = message.direction === "inbound" ? message.from_number : message.to_number;
    setLinkPhone(normalizePhone(counterpart));
    setLinkClientId("");
    setNewClientName("");
    setNewClientEmail("");
    setLinkConflicts([]);
  }

  async function handleLinkExisting(force = false) {
    if (!currentOrganizationId || !linkPhone || !linkClientId) return;
    setLinking(true);
    try {
      const result = (await linkClient({
        data: {
          organization_id: currentOrganizationId,
          client_id: linkClientId,
          phone: linkPhone,
          name: newClientName.trim() ? newClientName.trim() : undefined,
          force,
        },
      })) as { conflict?: boolean; conflicts?: { id: string; name: string }[] };
      if (result?.conflict) {
        setLinkConflicts(result.conflicts ?? []);
        toast.warning("Dit nummer staat al bij een andere klant");
        return;
      }
      setLinkConflicts([]);
      toast.success("Nummer gekoppeld en klantkaart bijgewerkt");
      setLinkPhone(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Koppelen mislukt");
    } finally {
      setLinking(false);
    }
  }

  async function handleCreateClient() {
    if (!currentOrganizationId || !linkPhone || !newClientName.trim()) {
      toast.error("Vul een klantnaam in");
      return;
    }
    setLinking(true);
    try {
      await createClient({
        data: {
          organization_id: currentOrganizationId,
          name: newClientName.trim(),
          phone: linkPhone,
          email: newClientEmail.trim(),
        },
      });
      toast.success("Nieuwe klant aangemaakt en gekoppeld");
      setLinkPhone(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Klant aanmaken mislukt");
    } finally {
      setLinking(false);
    }
  }

  const filteredMessages = messages.filter((message) => {
    if (statusFilter !== "all" && message.status !== statusFilter) return false;
    const created = new Date(message.created_at).getTime();
    if (dateFrom && created < new Date(`${dateFrom}T00:00:00`).getTime()) return false;
    if (dateTo && created > new Date(`${dateTo}T23:59:59`).getTime()) return false;
    return true;
  });

  function exportCsv() {
    const escape = (value: string | null) => `"${(value ?? "").replaceAll('"', '""')}"`;
    const rows = filteredMessages.map((message) =>
      [message.created_at, message.direction, message.status, message.from_number, message.to_number, message.body, message.error]
        .map(escape)
        .join(","),
    );
    const csv = ["datum,richting,status,van,naar,bericht,fout", ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${channel}-berichten-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
              <Settings2 className="mr-1.5 h-3.5 w-3.5" /> AI van Columbus-instellingen
            </Button>
          </div>
        </div>

        {!apiKeyOk && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            De API-sleutel voor AI van Columbus ontbreekt. Voeg deze toe om berichten te kunnen versturen.
          </div>
        )}
        {apiKeyOk && !loading && !fromNumber && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Stel eerst een afzendernummer in via AI van Columbus-instellingen.
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
              <Label className="text-[11px] uppercase tracking-wider">Klant kiezen</Label>
              <Select
                value={activeClient?.id ?? ""}
                onValueChange={(id) => {
                  const client = clients.find((item) => item.id === id);
                  if (client?.phone) setTo(normalizePhone(client.phone));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Kies een klant met telefoonnummer" /></SelectTrigger>
                <SelectContent>
                  {clients.filter((client) => client.phone).map((client) => (
                    <SelectItem key={client.id} value={client.id}>{client.name} — {client.phone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider">Van</Label>
              <Input value={fromNumber ?? ""} readOnly className="border-input bg-muted/50" />
            </div>
          </div>
          {to.trim() && (
            activeClient ? (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
                <Users className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{activeClient.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[activeClient.contact_person, activeClient.email, activeClient.city].filter(Boolean).join(" · ") || "Geen extra gegevens"}
                  </p>
                </div>
                <a className="text-xs underline" href={`/ai-columbus/klanten/${activeClient.id}`}>Klantenkaart openen</a>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                <span className="min-w-0 flex-1">Dit nummer hoort nog niet bij een klant.</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLinkPhone(normalizePhone(to));
                    setLinkClientId("");
                    setNewClientName("");
                    setNewClientEmail("");
                  }}
                >
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Koppelen
                </Button>
              </div>
            )
          )}
          <div className="space-y-1.5">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider">Berichttemplate</Label>
                <Select value={selectedTemplate} onValueChange={(id) => {
                  setSelectedTemplate(id);
                  const template = templates.find((item) => item.id === id);
                  if (template) setBody(template.body);
                }}>
                  <SelectTrigger><SelectValue placeholder="Kies een template" /></SelectTrigger>
                  <SelectContent>{templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="icon" title="Nieuwe template" onClick={() => setTemplateOpen(true)}><Plus className="h-4 w-4" /></Button>
              {selectedTemplate && <Button variant="ghost" size="icon" title="Template verwijderen" onClick={() => void handleDeleteTemplate(selectedTemplate)}><Trash2 className="h-4 w-4" /></Button>}
            </div>
            <p className="text-[11px] text-muted-foreground">Variabelen: {"{{name}}"}, {"{{company}}"}, {"{{phone}}"}</p>
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            {testStatus && <Badge variant={testStatus === "failed" ? "destructive" : "secondary"}>Teststatus: {testStatus}</Badge>}
            <Button variant="outline" onClick={() => void handleTestSend()} disabled={sending || !fromNumber}>
              <FlaskConical className="mr-2 h-4 w-4" /> Test versturen
            </Button>
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
          <div className="flex flex-wrap items-end gap-2 border-b border-border px-4 py-3">
            <div className="mr-auto text-sm font-semibold">Berichten</div>
            <Input type="date" aria-label="Vanaf datum" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-auto" />
            <Input type="date" aria-label="Tot datum" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-auto" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statussen</SelectItem>
                <SelectItem value="queued">In wachtrij</SelectItem>
                <SelectItem value="sent">Verstuurd</SelectItem>
                <SelectItem value="delivered">Afgeleverd</SelectItem>
                <SelectItem value="failed">Mislukt</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={filteredMessages.length === 0}><Download className="mr-1.5 h-3.5 w-3.5" /> CSV</Button>
          </div>
          {loading ? (
            <div className="p-5">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">Nog geen berichten.</div>
          ) : (
            <ul className="divide-y divide-border">
              {filteredMessages.map((m) => {
                const linked = messageClient(m);
                return (
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
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {linked ? (
                        <a className="text-xs underline" href={`/ai-columbus/klanten/${linked.id}`}>
                          Klant: {linked.name}
                        </a>
                      ) : (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openLinkDialog(m)}>
                          <UserPlus className="mr-1.5 h-3 w-3" /> Koppelen aan klant
                        </Button>
                      )}
                    </div>
                  </div>
                  <Badge variant={m.status === "failed" ? "destructive" : "secondary"}>
                    {m.status}
                  </Badge>
                </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <Dialog open={linkPhone !== null} onOpenChange={(open) => !open && setLinkPhone(null)}>
        <DialogContent className="border-border bg-background text-foreground">
          <DialogHeader>
            <DialogTitle>Nummer koppelen aan klant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Nummer: {linkPhone}</p>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider">Bestaande klant</Label>
              <Select value={linkClientId} onValueChange={setLinkClientId}>
                <SelectTrigger><SelectValue placeholder="Kies een klant" /></SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => void handleLinkExisting()} disabled={linking || !linkClientId}>
                Koppelen aan bestaande klant
              </Button>
            </div>
            <div className="space-y-2 border-t border-border pt-3">
              <Label className="text-[11px] uppercase tracking-wider">Nieuwe klant aanmaken</Label>
              <Input
                value={newClientName}
                onChange={(event) => setNewClientName(event.target.value)}
                placeholder="Bedrijfsnaam"
                className="border-input bg-background"
              />
              <Input
                value={newClientEmail}
                onChange={(event) => setNewClientEmail(event.target.value)}
                placeholder="E-mailadres (optioneel)"
                className="border-input bg-background"
              />
              <Button size="sm" variant="outline" onClick={() => void handleCreateClient()} disabled={linking}>
                <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Aanmaken en koppelen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="border-border bg-background text-foreground">
          <DialogHeader>
            <DialogTitle>AI van Columbus-instellingen</DialogTitle>
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
            <div className="space-y-1.5 border-t border-border pt-3">
              <Label className="text-[11px] uppercase tracking-wider">Webhook-secret</Label>
              <Input type="password" value={webhookSecret} onChange={(event) => setWebhookSecret(event.target.value)} placeholder="Minimaal 16 tekens" autoComplete="new-password" />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{settings.webhook_secret_configured_at ? `Ingesteld op ${new Date(settings.webhook_secret_configured_at).toLocaleDateString("nl-NL")}` : "Nog niet ingesteld"}</span>
                <Button type="button" variant="outline" size="sm" disabled={saving || webhookSecret.length < 16} onClick={() => void handleSaveSecret()}><Save className="mr-1.5 h-3.5 w-3.5" /> Secret opslaan</Button>
              </div>
              <p className="text-xs text-muted-foreground">Webhook-URL: {typeof window === "undefined" ? "/api/public/hooks/telnyx" : `${window.location.origin}/api/public/hooks/telnyx`}</p>
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

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nieuw berichttemplate</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Naam</Label><Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} /></div>
            <div className="space-y-1.5"><Label>Bericht</Label><Textarea rows={7} value={templateBody} onChange={(event) => setTemplateBody(event.target.value)} placeholder="Hallo {{name}}, …" /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setTemplateOpen(false)}>Annuleren</Button><Button disabled={!templateName.trim() || !templateBody.trim()} onClick={() => void handleSaveTemplate()}>Opslaan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
