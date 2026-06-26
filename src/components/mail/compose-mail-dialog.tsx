import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Send, Paperclip, X, FileText, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { sendMail } from "@/lib/mail.functions";
import { renderTokens } from "@/lib/outreach-templates";

type Template = {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
};
type Client = { id: string; name: string; email: string | null };

type Props = {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  organizationId: string;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  inReplyTo?: string | null;
  threadId?: string | null;
  onSent?: () => void;
};

export function ComposeMailDialog({
  open,
  onOpenChange,
  organizationId,
  defaultTo,
  defaultSubject,
  defaultBody,
  inReplyTo,
  threadId,
  onSent,
}: Props) {
  const send = useServerFn(sendMail);
  const [to, setTo] = useState(defaultTo ?? "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [body, setBody] = useState(defaultBody ?? "");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<
    Array<{ path: string; filename: string; size: number; mime: string }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open || !organizationId) return;
    setTo(defaultTo ?? "");
    setSubject(defaultSubject ?? "");
    setBody(defaultBody ?? "");
    setCc("");
    setAttachments([]);
    setSelectedClient(null);
    setSelectedTemplate(null);
    (async () => {
      const [tRes, cRes] = await Promise.all([
        supabase
          .from("outreach_message_templates")
          .select("id, name, channel, subject, body")
          .eq("organization_id", organizationId)
          .in("channel", ["email"])
          .order("name"),
        supabase
          .from("clients")
          .select("id, name, email")
          .eq("organization_id", organizationId)
          .order("name")
          .limit(500),
      ]);
      setTemplates((tRes.data ?? []) as Template[]);
      setClients((cRes.data ?? []) as Client[]);
    })();
  }, [open, organizationId, defaultTo, defaultSubject, defaultBody]);

  const selectedClientObj = useMemo(
    () => clients.find((c) => c.id === selectedClient) ?? null,
    [clients, selectedClient],
  );

  function applyTemplate(id: string) {
    setSelectedTemplate(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    const vars = {
      contact_name: selectedClientObj?.name ?? "",
      company: selectedClientObj?.name ?? "",
      sender_name: "",
      province: "",
    };
    if (t.subject) setSubject(renderTokens(t.subject, vars));
    setBody(renderTokens(t.body, vars));
  }

  function pickClient(id: string) {
    setSelectedClient(id);
    const c = clients.find((x) => x.id === id);
    if (c?.email && !to) setTo(c.email);
  }

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        if (f.size > 10 * 1024 * 1024) {
          toast.error(`${f.name} is groter dan 10MB`);
          continue;
        }
        const path = `${organizationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.name}`;
        const { error } = await supabase.storage
          .from("mail-attachments")
          .upload(path, f, { contentType: f.type });
        if (error) {
          toast.error(error.message);
          continue;
        }
        setAttachments((a) => [
          ...a,
          { path, filename: f.name, size: f.size, mime: f.type },
        ]);
      }
    } finally {
      setUploading(false);
    }
  }

  async function onSend() {
    const toList = to.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const ccList = cc.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (toList.length === 0 || !subject.trim() || !body.trim()) {
      toast.error("Vul ontvanger, onderwerp en bericht in");
      return;
    }
    setBusy(true);
    try {
      await send({
        data: {
          organization_id: organizationId,
          to: toList,
          cc: ccList,
          bcc: [],
          subject,
          body,
          client_id: selectedClient ?? null,
          lead_id: null,
          in_reply_to: inReplyTo ?? null,
          thread_id: threadId ?? null,
          attachments,
        },
      });
      toast.success("Mail verstuurd");
      onOpenChange(false);
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verzendfout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-[#0f0f0f] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle>{inReplyTo ? "Beantwoorden" : "Nieuwe mail"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-white/50 flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Bedrijf / Contact
              </label>
              <Select value={selectedClient ?? ""} onValueChange={pickClient}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Selecteer bedrijf…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.email ? `· ${c.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-white/50 flex items-center gap-1">
                <FileText className="h-3 w-3" /> Template
              </label>
              <Select value={selectedTemplate ?? ""} onValueChange={applyTemplate}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Kies template…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {templates.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-white/50">Geen templates</div>
                  )}
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-white/50">Aan</label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="naam@bedrijf.nl, ander@bedrijf.nl"
              className="bg-white/5 border-white/10 text-white"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-white/50">CC</label>
            <Input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="optioneel"
              className="bg-white/5 border-white/10 text-white"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-white/50">Onderwerp</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-white/50">Bericht</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="bg-white/5 border-white/10 text-white font-mono text-sm"
            />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-white/50 flex items-center gap-1">
              <Paperclip className="h-3 w-3" /> Bijlagen
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {attachments.map((a) => (
                <Badge
                  key={a.path}
                  variant="outline"
                  className="border-white/20 text-white/80 gap-1.5"
                >
                  {a.filename}
                  <button
                    onClick={() =>
                      setAttachments((cur) => cur.filter((x) => x.path !== a.path))
                    }
                    className="opacity-70 hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-dashed border-white/20 px-2 py-1 text-xs text-white/70 hover:bg-white/5">
                {uploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Paperclip className="h-3 w-3" />
                )}
                Toevoegen
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => onUpload(e.target.files)}
                />
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/20 text-white/80 hover:bg-white/10"
          >
            Annuleren
          </Button>
          <Button
            onClick={onSend}
            disabled={busy}
            className="bg-[#ff2bd6] hover:bg-[#ff2bd6]/90 text-white"
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Verstuur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
