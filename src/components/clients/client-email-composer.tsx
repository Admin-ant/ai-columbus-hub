import { useEffect, useMemo, useState } from "react";
import { Mail, Send, Eye, EyeOff, RefreshCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { logClientActivity } from "@/lib/client-activity";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Contact = Database["public"]["Tables"]["client_contacts"]["Row"];

const DEFAULT_SUBJECT = "Bericht voor {{bedrijfsnaam}}";
const DEFAULT_BODY = "Beste {{contactpersoon}},\n\nHierbij een bericht namens {{bedrijfsnaam}}.\n\nMet vriendelijke groet,";

const PLACEHOLDERS = [
  { key: "{{bedrijfsnaam}}", label: "Bedrijfsnaam" },
  { key: "{{contactpersoon}}", label: "Contactpersoon" },
  { key: "{{voornaam}}", label: "Voornaam" },
  { key: "{{achternaam}}", label: "Achternaam" },
];

export type EmailDraft = {
  id?: string | null;
  to?: string | null;
  subject?: string | null;
  body?: string | null;
};

export function ClientEmailComposer({
  clientId,
  organizationId,
  companyName,
  companyEmail,
  defaultTo,
  draft,
  open: controlledOpen,
  onOpenChange,
  hideTrigger,
  onSaved,
}: {
  clientId: string;
  organizationId: string;
  companyName: string;
  companyEmail?: string | null;
  defaultTo?: string;
  draft?: EmailDraft | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  onSaved?: () => void;
}) {

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    if (controlledOpen === undefined) setUncontrolledOpen(v);
  };

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [to, setTo] = useState<string>("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [showPreview, setShowPreview] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ok = true;
    (async () => {
      const { data } = await supabase
        .from("client_contacts")
        .select("*")
        .eq("client_id", clientId)
        .order("is_primary", { ascending: false })
        .order("first_name", { ascending: true });
      if (ok) {
        const list = (data ?? []) as Contact[];
        setContacts(list);
        const primary = list.find((c) => c.is_primary) ?? list[0];
        setTo(draft?.to ?? defaultTo ?? primary?.email ?? companyEmail ?? "");
      }
    })();
    return () => { ok = false; };
  }, [clientId, companyEmail, defaultTo, open, draft?.to]);

  useEffect(() => {
    if (open) {
      setSubject(draft?.subject ?? DEFAULT_SUBJECT);
      setBody(draft?.body ?? DEFAULT_BODY);
      setDraftId(draft?.id ?? null);
      setShowPreview(false);
    }
  }, [open, draft?.id, draft?.subject, draft?.body]);

  const selectedContact = useMemo(() => {
    return contacts.find((c) => c.email === to);
  }, [contacts, to]);

  const replacePlaceholders = (text: string) => {
    const contact = selectedContact ?? contacts.find((c) => c.is_primary) ?? contacts[0];
    const firstName = contact?.first_name ?? "";
    const lastName = contact?.last_name ?? "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || contact?.email || "";
    return text
      .replace(/{{bedrijfsnaam}}/g, companyName)
      .replace(/{{contactpersoon}}/g, fullName)
      .replace(/{{voornaam}}/g, firstName)
      .replace(/{{achternaam}}/g, lastName);
  };

  const finalSubject = replacePlaceholders(subject);
  const finalBody = replacePlaceholders(body);
  const mailtoHref = useMemo(() => {
    if (!to) return "#";
    const params = new URLSearchParams();
    if (finalSubject) params.set("subject", finalSubject);
    if (finalBody) params.set("body", finalBody);
    return `mailto:${to}?${params.toString()}`;
  }, [to, finalSubject, finalBody]);

  const recipientOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    if (companyEmail) {
      opts.push({ value: companyEmail, label: `${companyName} (bedrijf)` });
    }
    contacts.forEach((c) => {
      if (!c.email) return;
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email;
      opts.push({ value: c.email, label: `${name}${c.is_primary ? " ★" : ""} — ${c.email}` });
    });
    return opts;
  }, [contacts, companyEmail, companyName]);

  function insertPlaceholder(key: string) {
    const textarea = document.getElementById("email-body") as HTMLTextAreaElement | null;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = body.slice(0, start);
      const after = body.slice(end);
      setBody(before + key + after);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + key.length, start + key.length);
      }, 0);
    } else {
      setBody((b) => b + " " + key);
    }
  }

  async function saveDraft(closeAfter = false) {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        organization_id: organizationId,
        client_id: clientId,
        folder: "draft" as const,
        status: "draft",
        subject: subject || null,
        body_text: body || null,
        to_emails: to ? [to] : [],
        created_by: userData.user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      if (draftId) {
        const { error } = await supabase.from("mail_messages").update(payload).eq("id", draftId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("mail_messages").insert(payload).select("id").single();
        if (error) throw error;
        setDraftId(data.id);
      }
      toast.success("Concept opgeslagen");
      onSaved?.();
      if (closeAfter) setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Kon concept niet opslaan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Mail className="mr-2 h-4 w-4" /> E-mail opmaken
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draftId ? "Concept bewerken" : "E-mail opmaken"}</DialogTitle>
          <DialogDescription>
            Vul onderwerp en bericht in. Gebruik placeholders om bedrijfsnaam en contactpersoon automatisch in te vullen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Aan</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger>
                <SelectValue placeholder="Kies een ontvanger" />
              </SelectTrigger>
              <SelectContent>
                {recipientOptions.length === 0 && (
                  <SelectItem value="" disabled>Geen e-mailadres bekend</SelectItem>
                )}
                {recipientOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Onderwerp</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Onderwerp"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Bericht</Label>
              <div className="flex gap-1">
                {PLACEHOLDERS.map((p) => (
                  <Button
                    key={p.key}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => insertPlaceholder(p.key)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
            <Textarea
              id="email-body"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Typ hier je bericht..."
            />
            <p className="text-xs text-muted-foreground">
              Klik op een placeholder om deze in te voegen op de cursorpositie.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview((s) => !s)}
            >
              {showPreview ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {showPreview ? "Verberg voorbeeld" : "Toon voorbeeld"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setSubject(DEFAULT_SUBJECT); setBody(DEFAULT_BODY); }}
            >
              <RefreshCcw className="mr-2 h-4 w-4" /> Standaard herstellen
            </Button>
          </div>

          {showPreview && (
            <div className="rounded border bg-muted/50 p-4 space-y-2">
              <div className="text-sm font-medium">Voorbeeld</div>
              <div className="text-sm"><span className="text-muted-foreground">Aan:</span> {to || "—"}</div>
              <div className="text-sm"><span className="text-muted-foreground">Onderwerp:</span> {finalSubject}</div>
              <pre className="whitespace-pre-wrap text-sm font-sans text-foreground">{finalBody}</pre>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => setOpen(false)}>Sluiten</Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => saveDraft(false)}
              disabled={saving}
            >
              <Save className="mr-2 h-4 w-4" /> {draftId ? "Concept bijwerken" : "Opslaan als concept"}
            </Button>
            <Button asChild disabled={!to}>
              <a
                href={mailtoHref}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  logClientActivity({
                    clientId,
                    organizationId,
                    kind: "email",
                    title: `E-mail: ${finalSubject || "(geen onderwerp)"}`,
                    body: `Aan: ${to}\n\n${finalBody}`,
                    contactId: selectedContact?.id ?? null,
                  });
                }}
              >
                <Send className="mr-2 h-4 w-4" /> Open in mailclient
              </a>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
