import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save, Star, Mail, Linkedin, MessageCircle, Eye } from "lucide-react";
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

export function TemplatesManager({ organizationId }: { organizationId: string | null }) {
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<OutreachTemplate | null>(null);
  const [channel, setChannel] = useState<TemplateChannel>("email");

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
    toast.success("Opgeslagen");
    load();
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
    // unset others of same channel, set this
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

  const visible = templates.filter((t) => t.channel === channel);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr_280px]">
      {/* List */}
      <div className="space-y-3">
        <Tabs value={channel} onValueChange={(v) => setChannel(v as TemplateChannel)}>
          <TabsList className="bg-white/5 border border-white/10 w-full grid grid-cols-3">
            <TabsTrigger value="email"><Mail className="h-3.5 w-3.5" /></TabsTrigger>
            <TabsTrigger value="linkedin"><Linkedin className="h-3.5 w-3.5" /></TabsTrigger>
            <TabsTrigger value="whatsapp"><MessageCircle className="h-3.5 w-3.5" /></TabsTrigger>
          </TabsList>
          {(["email", "linkedin", "whatsapp"] as const).map((c) => (
            <TabsContent key={c} value={c} className="mt-3 space-y-2">
              {loading ? (
                <div className="text-xs text-white/40 p-3">Laden…</div>
              ) : visible.length === 0 ? (
                <div className="rounded border border-dashed border-white/10 p-3 text-center text-xs text-white/40">
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
                          ? "border-[#ff2bd6]/60 bg-[#ff2bd6]/10"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className="h-3.5 w-3.5 text-white/70 shrink-0" />
                          <span className="text-xs font-medium text-white truncate">{t.name}</span>
                        </div>
                        {t.is_default && (
                          <Badge variant="outline" className="text-[9px] border-amber-400/40 text-amber-300 px-1.5">
                            standaard
                          </Badge>
                        )}
                      </div>
                      {t.subject && (
                        <div className="mt-1 truncate text-[11px] text-white/50">{t.subject}</div>
                      )}
                    </div>
                  );
                })
              )}
              <Button
                size="sm"
                variant="outline"
                className="w-full border-white/20 text-white/80 hover:bg-white/10"
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
          <div className="rounded-lg border border-dashed border-white/10 p-12 text-center text-sm text-white/40">
            Selecteer of maak een sjabloon
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="bg-white/5 border-white/10 text-white font-semibold"
              />
              <div className="flex gap-1">
                {!editing.is_default && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDefault(editing)}
                    className="text-amber-300 hover:bg-amber-400/10"
                    title="Markeer als standaard voor dit kanaal"
                  >
                    <Star className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(editing.id)}
                  className="text-rose-400 hover:bg-rose-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-[11px] text-white/60">Beschrijving</Label>
              <Input
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="Korte omschrijving — wanneer gebruik je dit sjabloon?"
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            {editing.channel === "email" && (
              <div>
                <Label className="text-[11px] text-white/60">Onderwerp</Label>
                <Input
                  value={editing.subject ?? ""}
                  onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
            )}
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-white/60">Inhoud</Label>
                <div className="flex gap-1 flex-wrap">
                  {TEMPLATE_TOKENS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => insertToken(t)}
                      className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
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
                className="bg-white/5 border-white/10 text-white font-mono text-xs"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={save} className="bg-[#ff2bd6] hover:bg-[#ff2bd6]/90 text-white">
                <Save className="mr-2 h-4 w-4" /> Opslaan
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/60">
          <Eye className="h-3.5 w-3.5" /> Preview
        </div>
        {editing ? (
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/80">
            {editing.subject && (
              <>
                <div className="mb-2 text-[10px] uppercase tracking-wider text-white/40">Onderwerp</div>
                <div className="mb-3 font-medium text-white">
                  {renderTokens(editing.subject, SAMPLE)}
                </div>
              </>
            )}
            <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">Inhoud</div>
            <div className="whitespace-pre-wrap text-white/85">
              {renderTokens(editing.body, SAMPLE)}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-white/40">
            Selecteer een sjabloon
          </div>
        )}
        <div className="text-[10px] text-white/40">
          Tokens worden automatisch ingevuld vanuit prospect-data.
        </div>
      </div>
    </div>
  );
}
