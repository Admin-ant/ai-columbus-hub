import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Save,
  Star,
  Mail,
  Linkedin,
  MessageCircle,
  Eye,
  History,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  type OutreachTemplate,
  type TemplateChannel,
  TEMPLATE_TOKENS,
  renderTokens,
} from "@/lib/outreach-templates";

const CHANNEL_ICON: Record<TemplateChannel, typeof Mail> = {
  email: Mail,
  linkedin: Linkedin,
  whatsapp: MessageCircle,
};

const CHANNEL_LABEL: Record<TemplateChannel, string> = {
  email: "E-mail",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
};

const SAMPLE = {
  contact_name: "Sanne",
  company: "Voorbeeld BV",
  province: "Noord-Holland",
  sender_name: "Jouw Naam",
};

type TemplateVersion = {
  id: string;
  template_id: string;
  version: number;
  name: string;
  description: string | null;
  subject: string | null;
  body: string;
  created_at: string;
  created_by: string | null;
};

export function TemplatesManager({ organizationId }: { organizationId: string | null }) {
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<OutreachTemplate | null>(null);
  const [channel, setChannel] = useState<TemplateChannel>("email");
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [previewVersion, setPreviewVersion] = useState<TemplateVersion | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    if (!organizationId) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("outreach_message_templates")
      .select("*")
      .eq("organization_id", organizationId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setTemplates((data ?? []) as OutreachTemplate[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  async function loadVersions(templateId: string) {
    const { data, error } = await supabase
      .from("outreach_template_versions")
      .select("*")
      .eq("template_id", templateId)
      .order("version", { ascending: false });
    if (error) {
      toast.error(error.message);
      setVersions([]);
      return;
    }
    setVersions((data ?? []) as TemplateVersion[]);
  }

  useEffect(() => {
    setPreviewVersion(null);
    if (editing) loadVersions(editing.id);
    else setVersions([]);
  }, [editing?.id]);

  async function createNew(ch: TemplateChannel) {
    if (!organizationId) return;
    const row = {
      organization_id: organizationId,
      name: `Nieuw ${CHANNEL_LABEL[ch]} sjabloon`,
      description: "",
      channel: ch,
      subject: ch === "email" ? "Onderwerp {{company}}" : null,
      body: `Hi {{contact_name}},\n\n`,
      is_default: false,
    };
    const { data, error } = await supabase
      .from("outreach_message_templates")
      .insert(row)
      .select("*")
      .single();
    if (error) return toast.error(error.message);
    await load();
    setEditing(data as OutreachTemplate);
  }

  async function save() {
    if (!editing) return;
    const { error } = await supabase
      .from("outreach_message_templates")
      .update({
        name: editing.name,
        description: editing.description,
        subject: editing.subject,
        body: editing.body,
      })
      .eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Opgeslagen — nieuwe versie aangemaakt");
    await load();
    await loadVersions(editing.id);
  }

  async function remove(id: string) {
    if (!confirm("Sjabloon verwijderen?")) return;
    const { error } = await supabase.from("outreach_message_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (editing?.id === id) setEditing(null);
    load();
  }

  async function setDefault(t: OutreachTemplate) {
    if (!organizationId) return;
    await supabase
      .from("outreach_message_templates")
      .update({ is_default: false })
      .eq("organization_id", organizationId)
      .eq("channel", t.channel);
    const { error } = await supabase
      .from("outreach_message_templates")
      .update({ is_default: true })
      .eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Ingesteld als standaard");
    load();
  }

  function insertToken(token: string) {
    if (!editing) return;
    setEditing({ ...editing, body: editing.body + token });
  }

  function restoreVersion(v: TemplateVersion) {
    if (!editing) return;
    setEditing({
      ...editing,
      name: v.name,
      description: v.description,
      subject: v.subject,
      body: v.body,
    });
    setPreviewVersion(null);
    toast.message(`Versie ${v.version} geladen — klik op Opslaan om te bevestigen`);
  }

  const q = search.trim().toLowerCase();
  const visible = templates.filter(
    (t) =>
      t.channel === channel &&
      (q === "" ||
        t.name.toLowerCase().includes(q) ||
        (t.subject ?? "").toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        (t.body ?? "").toLowerCase().includes(q)),
  );
  const preview = previewVersion ?? editing;

  return (
    <div className="grid gap-4 xl:grid-cols-[240px_1fr_280px_240px] lg:grid-cols-[240px_1fr_280px]">
      {/* List */}
      <div className="space-y-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek in sjablonen…"
          className="border-input bg-background text-xs text-foreground placeholder:text-muted-foreground shadow-sm"
        />
        <Tabs value={channel} onValueChange={(v) => setChannel(v as TemplateChannel)}>
          <TabsList className="grid w-full grid-cols-3 border border-border bg-card text-card-foreground">
            <TabsTrigger value="email"><Mail className="h-3.5 w-3.5" /></TabsTrigger>
            <TabsTrigger value="linkedin"><Linkedin className="h-3.5 w-3.5" /></TabsTrigger>
            <TabsTrigger value="whatsapp"><MessageCircle className="h-3.5 w-3.5" /></TabsTrigger>
          </TabsList>
          {(["email", "linkedin", "whatsapp"] as const).map((c) => (
            <TabsContent key={c} value={c} className="mt-3 space-y-2">
              {loading ? (
                <div className="text-xs text-muted-foreground p-3">Laden…</div>
              ) : visible.length === 0 ? (
                <div className="rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                  Geen sjablonen
                </div>
              ) : (
                visible.map((t) => {
                  const Icon = CHANNEL_ICON[t.channel];
                  const active = editing?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setEditing(t)}
                      className={`group rounded-md border p-2.5 cursor-pointer transition ${
                        active
                          ? "border-primary/50 bg-accent text-accent-foreground"
                          : "border-border bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium text-foreground truncate">{t.name}</span>
                        </div>
                        {t.is_default && (
                          <Badge variant="outline" className="border-primary/40 bg-primary/10 px-1.5 text-[9px] text-primary">
                            standaard
                          </Badge>
                        )}
                      </div>
                      {t.description && (
                        <div className="mt-1 truncate text-[11px] text-muted-foreground italic">{t.description}</div>
                      )}
                      {t.subject && (
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{t.subject}</div>
                      )}
                    </div>
                  );
                })
              )}
              <Button
                size="sm"
                variant="outline"
                    className="w-full border-border text-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => createNew(c)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Nieuw {CHANNEL_LABEL[c]}-sjabloon
              </Button>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Editor */}
      <div className="space-y-3">
        {!editing ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            Selecteer of maak een sjabloon
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="border-input bg-background font-semibold text-foreground placeholder:text-muted-foreground shadow-sm"
              />
              <div className="flex gap-1">
                {!editing.is_default && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDefault(editing)}
                    className="text-primary hover:bg-accent hover:text-accent-foreground"
                    title="Markeer als standaard voor dit kanaal"
                  >
                    <Star className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(editing.id)}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-foreground">Beschrijving</Label>
              <Input
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="Korte omschrijving — wanneer gebruik je dit sjabloon?"
                className="border-input bg-background text-foreground placeholder:text-muted-foreground shadow-sm"
              />
            </div>
            {editing.channel === "email" && (
              <div>
                <Label className="text-[11px] font-medium text-foreground">Onderwerp</Label>
                <Input
                  value={editing.subject ?? ""}
                  onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                  className="border-input bg-background text-foreground placeholder:text-muted-foreground shadow-sm"
                />
              </div>
            )}
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium text-foreground">Inhoud</Label>
                <div className="flex gap-1 flex-wrap">
                  {TEMPLATE_TOKENS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => insertToken(t)}
                      className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
                      title={`Variabele ${t} invoegen`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                rows={14}
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                className="border-input bg-background font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground shadow-sm"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={save} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Save className="mr-2 h-4 w-4" /> Opslaan
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            Preview
          </span>
          {previewVersion && (
            <Badge variant="outline" className="border-primary/40 bg-primary/10 text-[9px] text-primary">
              v{previewVersion.version}
            </Badge>
          )}
        </div>
        {preview ? (
          <div className="rounded-lg border border-border bg-card p-3 text-sm text-card-foreground shadow-sm">
            {preview.subject && (
              <>
                <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Onderwerp</div>
                <div className="mb-3 font-medium text-foreground">
                  {renderTokens(preview.subject, SAMPLE)}
                </div>
              </>
            )}
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Inhoud</div>
            <div className="whitespace-pre-wrap leading-relaxed text-foreground">
              {renderTokens(preview.body, SAMPLE)}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Selecteer een sjabloon
          </div>
        )}
        <div className="text-[10px] text-muted-foreground">
          Variabelen ({TEMPLATE_TOKENS.join(", ")}) worden automatisch ingevuld vanuit prospect-data.
        </div>
      </div>

      {/* Version history */}
      <div className="space-y-2 xl:block hidden">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <History className="h-3.5 w-3.5" /> Versies
        </div>
        {!editing ? (
          <div className="rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            Selecteer een sjabloon
          </div>
        ) : versions.length === 0 ? (
          <div className="rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            Nog geen versies
          </div>
        ) : (
          <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
            {versions.map((v, idx) => {
              const isCurrent = idx === 0;
              const isPreviewing = previewVersion?.id === v.id;
              return (
                <div
                  key={v.id}
                  className={`rounded-md border p-2 transition ${
                    isPreviewing
                      ? "border-primary/50 bg-accent text-accent-foreground"
                      : "border-border bg-card text-card-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 ${
                          isCurrent
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        v{v.version}
                      </Badge>
                      {isCurrent && (
                        <span className="text-[9px] font-medium uppercase tracking-wider text-primary">
                          huidig
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(v.created_at).toLocaleString("nl-NL", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">{v.name}</div>
                  {v.subject && (
                    <div className="truncate text-[10px] text-muted-foreground">{v.subject}</div>
                  )}
                  <div className="mt-1.5 flex gap-1">
                    <button
                      type="button"
                      onClick={() => setPreviewVersion(isPreviewing ? null : v)}
                      className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      {isPreviewing ? "Sluit preview" : "Preview"}
                    </button>
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => restoreVersion(v)}
                        className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/15"
                      >
                        <RotateCcw className="h-2.5 w-2.5" /> Herstel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
