import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mail, Send, Eye, EyeOff, RefreshCcw, Save, Plus, Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  RadioGroup, RadioGroupItem,
} from "@/components/ui/radio-group";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { logClientActivity } from "@/lib/client-activity";
import { sendMail } from "@/lib/mail.functions";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

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
  const [toList, setToList] = useState<string[]>([]);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [showPreview, setShowPreview] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [localCompanyEmail, setLocalCompanyEmail] = useState<string | null>(companyEmail ?? null);
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addTarget, setAddTarget] = useState<"company" | "contact">("contact");
  const [addFirstName, setAddFirstName] = useState("");
  const [addLastName, setAddLastName] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  const sendMailFn = useServerFn(sendMail);

  useEffect(() => { setLocalCompanyEmail(companyEmail ?? null); }, [companyEmail]);

  const loadContacts = async () => {
    const { data } = await supabase
      .from("client_contacts")
      .select("*")
      .eq("client_id", clientId)
      .order("is_primary", { ascending: false })
      .order("first_name", { ascending: true });
    const list = (data ?? []) as Contact[];
    setContacts(list);
    return list;
  };

  useEffect(() => {
    if (!open) return;
    let ok = true;
    (async () => {
      const list = await loadContacts();
      if (!ok) return;
      const primary = list.find((c) => c.is_primary) ?? list[0];
      const initial = draft?.to ?? defaultTo ?? primary?.email ?? localCompanyEmail ?? "";
      setToList(initial ? [initial] : []);
    })();
    return () => { ok = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, open]);

  useEffect(() => {
    if (open) {
      setSubject(draft?.subject ?? DEFAULT_SUBJECT);
      setBody(draft?.body ?? DEFAULT_BODY);
      setDraftId(draft?.id ?? null);
      setShowPreview(false);
    }
  }, [open, draft?.id, draft?.subject, draft?.body]);

  const primaryTo = toList[0] ?? "";
  const selectedContact = useMemo(() => {
    return contacts.find((c) => c.email === primaryTo);
  }, [contacts, primaryTo]);

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
    if (toList.length === 0) return "#";
    const params = new URLSearchParams();
    if (finalSubject) params.set("subject", finalSubject);
    if (finalBody) params.set("body", finalBody);
    return `mailto:${toList.join(",")}?${params.toString()}`;
  }, [toList, finalSubject, finalBody]);

  const recipientOptions = useMemo(() => {
    const opts: { value: string; label: string; hint?: string }[] = [];
    if (localCompanyEmail) {
      opts.push({ value: localCompanyEmail, label: `${companyName}`, hint: "bedrijf" });
    }
    contacts.forEach((c) => {
      if (!c.email) return;
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email;
      opts.push({ value: c.email, label: `${name}${c.is_primary ? " ★" : ""}`, hint: c.email });
    });
    // Dedupe
    const seen = new Set<string>();
    return opts.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
  }, [contacts, localCompanyEmail, companyName]);

  function toggleRecipient(email: string, on: boolean) {
    setToList((prev) => {
      if (on) return prev.includes(email) ? prev : [...prev, email];
      return prev.filter((e) => e !== email);
    });
  }

  async function addRecipient() {
    const email = addEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Vul een geldig e-mailadres in");
      return;
    }
    setAddSaving(true);
    try {
      if (addTarget === "company") {
        const { error } = await supabase.from("clients").update({ email }).eq("id", clientId);
        if (error) throw error;
        setLocalCompanyEmail(email);
      } else {
        const payload: any = {
          client_id: clientId,
          organization_id: organizationId,
          email,
          first_name: addFirstName.trim() || null,
          last_name: addLastName.trim() || null,
          is_primary: contacts.length === 0,
        };
        const { error } = await supabase.from("client_contacts").insert(payload);
        if (error) throw error;
        await loadContacts();
      }
      setToList((prev) => (prev.includes(email) ? prev : [...prev, email]));
      toast.success("E-mailadres toegevoegd");
      setAddOpen(false);
      setAddEmail(""); setAddFirstName(""); setAddLastName("");
      onSaved?.();
    } catch (e: any) {
      toast.error(e.message ?? "Toevoegen mislukt");
    } finally {
      setAddSaving(false);
    }
  }

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
        to_emails: toList,
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

  async function sendNow() {
    if (toList.length === 0) return toast.error("Kies minstens één ontvanger");
    if (!finalSubject.trim()) return toast.error("Onderwerp is verplicht");
    setSending(true);
    try {
      await sendMailFn({
        data: {
          organization_id: organizationId,
          client_id: clientId,
          to: toList,
          subject: finalSubject,
          body: finalBody,
        } as any,
      });
      toast.success(`Verstuurd naar ${toList.length} ontvanger${toList.length > 1 ? "s" : ""}`);
      logClientActivity({
        clientId,
        organizationId,
        kind: "email",
        title: `E-mail: ${finalSubject}`,
        body: `Aan: ${toList.join(", ")}\n\n${finalBody}`,
        contactId: selectedContact?.id ?? null,
      });
      // Remove draft if present (it's now been sent)
      if (draftId) {
        await supabase.from("mail_messages").delete().eq("id", draftId);
      }
      onSaved?.();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Versturen mislukt");
    } finally {
      setSending(false);
    }
  }

  const hasRecipients = recipientOptions.length > 0;
  const canSend = toList.length > 0 && !sending;

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
            Kies één of meerdere ontvangers en verstuur direct vanuit het klantenportaal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Aan {toList.length > 0 && <span className="text-xs text-muted-foreground">({toList.length} geselecteerd)</span>}</Label>
              <Popover open={addOpen} onOpenChange={setAddOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    <Plus className="mr-1 h-3.5 w-3.5" /> E-mailadres toevoegen
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">E-mailadres</Label>
                    <Input
                      type="email"
                      value={addEmail}
                      onChange={(e) => setAddEmail(e.target.value)}
                      placeholder="naam@bedrijf.nl"
                    />
                  </div>
                  <RadioGroup value={addTarget} onValueChange={(v) => setAddTarget(v as any)} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="contact" id="add-target-contact" />
                      <Label htmlFor="add-target-contact" className="text-xs font-normal">Als nieuwe contactpersoon</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="company" id="add-target-company" />
                      <Label htmlFor="add-target-company" className="text-xs font-normal">Als bedrijfs-e-mailadres</Label>
                    </div>
                  </RadioGroup>
                  {addTarget === "contact" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Voornaam</Label>
                        <Input value={addFirstName} onChange={(e) => setAddFirstName(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Achternaam</Label>
                        <Input value={addLastName} onChange={(e) => setAddLastName(e.target.value)} />
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setAddOpen(false)}>Annuleren</Button>
                    <Button size="sm" onClick={addRecipient} disabled={addSaving || !addEmail.trim()}>
                      {addSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      Toevoegen
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {hasRecipients ? (
              <div className="rounded border divide-y max-h-56 overflow-y-auto">
                {recipientOptions.map((opt) => {
                  const checked = toList.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggleRecipient(opt.value, v === true)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {opt.label}
                          {opt.hint === "bedrijf" && (
                            <span className="ml-2 text-xs text-muted-foreground">(bedrijf)</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{opt.value}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-destructive">
                Geen e-mailadressen bekend voor deze klant. Gebruik <b>E-mailadres toevoegen</b> hierboven — je concept blijft behouden.
              </p>
            )}
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
              Klik op een placeholder om deze in te voegen op de cursorpositie. Placeholders gebruiken de eerst geselecteerde contactpersoon.
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
              <div className="text-sm"><span className="text-muted-foreground">Aan:</span> {toList.join(", ") || "—"}</div>
              <div className="text-sm"><span className="text-muted-foreground">Onderwerp:</span> {finalSubject}</div>
              <pre className="whitespace-pre-wrap text-sm font-sans text-foreground">{finalBody}</pre>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => setOpen(false)}>Sluiten</Button>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              asChild
              disabled={toList.length === 0}
              title={toList.length === 0 ? "Geen ontvanger geselecteerd" : "Openen in je eigen mailclient"}
            >
              <a href={mailtoHref} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> Mailclient
              </a>
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => saveDraft(false)}
              disabled={saving || toList.length === 0}
              title={toList.length === 0 ? "Geen e-mailadres — kies of voeg een ontvanger toe" : undefined}
            >
              <Save className="mr-2 h-4 w-4" /> {draftId ? "Concept bijwerken" : "Opslaan als concept"}
            </Button>
            <Button
              type="button"
              onClick={sendNow}
              disabled={!canSend}
            >
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Verstuur direct
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
