import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Mail, Linkedin, MessageCircle, Send, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  type OutreachTemplate,
  type TemplateChannel,
  renderTokens,
} from "@/lib/outreach-templates";

type Target = {
  id: string;
  company: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  province?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: Target | null;
  organizationId: string | null;
  onSentViaSystem?: () => void;
  onSend: (args: { subject: string; body: string }) => Promise<void>;
};

export function SendOutreachDialog({
  open,
  onOpenChange,
  target,
  organizationId,
  onSend,
  onSentViaSystem,
}: Props) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [channel, setChannel] = useState<TemplateChannel>("email");
  const [templateId, setTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !organizationId) return;
    supabase
      .from("outreach_message_templates")
      .select("*")
      .eq("organization_id", organizationId)
      .order("is_default", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setTemplates((data ?? []) as OutreachTemplate[]);
      });
  }, [open, organizationId]);

  const senderName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split("@")[0] ?? "";

  const vars = useMemo(
    () => ({
      contact_name: target?.contact_name ?? target?.company ?? "",
      company: target?.company ?? "",
      province: target?.province ?? "",
      sender_name: senderName,
    }),
    [target, senderName],
  );

  // Pick default template when channel/templates change
  useEffect(() => {
    const channelTemplates = templates.filter((t) => t.channel === channel);
    if (channelTemplates.length === 0) {
      setTemplateId("");
      setSubject("");
      setBody("");
      return;
    }
    const def = channelTemplates.find((t) => t.is_default) ?? channelTemplates[0];
    setTemplateId(def.id);
  }, [channel, templates]);

  useEffect(() => {
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    setSubject(renderTokens(t.subject ?? "", vars));
    setBody(renderTokens(t.body, vars));
  }, [templateId, templates, vars]);

  if (!target) return null;

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Gekopieerd");
  };

  const channelTemplates = templates.filter((t) => t.channel === channel);
  const mailto = target.email
    ? `mailto:${target.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : "";
  const waLink = target.phone
    ? `https://wa.me/${target.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(body)}`
    : "";

  async function handleSendViaSystem() {
    setSending(true);
    try {
      await onSend({ subject, body });
      toast.success("Verstuurd via systeem");
      onSentViaSystem?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Versturen mislukt");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-border bg-background text-foreground">
        <DialogHeader>
          <DialogTitle>Aanschrijven — {target.company}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {target.contact_name ? `${target.contact_name} · ` : ""}
            {target.province ? `${target.province} · ` : ""}
            Kies een sjabloon, pas eventueel aan, kopieer of verstuur.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={channel} onValueChange={(v) => setChannel(v as TemplateChannel)}>
          <TabsList className="bg-muted/50 border border-border">
            <TabsTrigger value="email" disabled={!target.email}>
              <Mail className="mr-1 h-3.5 w-3.5" /> E-mail
            </TabsTrigger>
            <TabsTrigger value="linkedin">
              <Linkedin className="mr-1 h-3.5 w-3.5" /> LinkedIn
            </TabsTrigger>
            <TabsTrigger value="whatsapp" disabled={!target.phone}>
              <MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp
            </TabsTrigger>
          </TabsList>

          <TabsContent value={channel} className="mt-4 space-y-3">
            <div>
              <Label className="text-[11px] text-muted-foreground">Sjabloon</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="bg-muted/50 border-border text-foreground">
                  <SelectValue placeholder="Selecteer sjabloon" />
                </SelectTrigger>
                <SelectContent>
                  {channelTemplates.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      Geen sjablonen — maak er een in Mail templates
                    </div>
                  ) : (
                    channelTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} {t.is_default ? "★" : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {channel === "email" && (
              <div>
                <Label className="text-[11px] text-muted-foreground">Onderwerp</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="bg-muted/50 border-border text-foreground"
                />
              </div>
            )}

            <div>
              <Label className="text-[11px] text-muted-foreground">Bericht</Label>
              <Textarea
                rows={12}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="bg-muted/50 border-border text-foreground font-mono text-xs"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copy(channel === "email" && subject ? `${subject}\n\n${body}` : body)
                }
                className="border-border text-foreground hover:bg-muted"
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Kopieer tekst
              </Button>
              {channel === "email" && target.email && (
                <>
                  <a href={mailto} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="border-border text-foreground hover:bg-muted">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open in mailprogramma
                    </Button>
                  </a>
                  <Button
                    size="sm"
                    onClick={handleSendViaSystem}
                    disabled={sending}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    {sending ? "Versturen…" : "Verstuur via systeem"}
                  </Button>
                </>
              )}
              {channel === "linkedin" && target.linkedin_url && (
                <a href={target.linkedin_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="border-border text-foreground hover:bg-muted">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open LinkedIn-profiel
                  </Button>
                </a>
              )}
              {channel === "whatsapp" && waLink && (
                <a href={waLink} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="border-border text-foreground hover:bg-muted">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open WhatsApp
                  </Button>
                </a>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Sluiten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
