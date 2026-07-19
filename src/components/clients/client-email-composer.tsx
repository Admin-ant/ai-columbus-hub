import { useEffect, useMemo, useState } from "react";
import { Mail, Send, Eye, EyeOff, RefreshCcw } from "lucide-react";

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

export function ClientEmailComposer({
  clientId,
  companyName,
  companyEmail,
  defaultTo,
}: {
  clientId: string;
  companyName: string;
  companyEmail?: string | null;
  defaultTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [to, setTo] = useState<string>("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [showPreview, setShowPreview] = useState(false);

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
        setTo(defaultTo ?? primary?.email ?? companyEmail ?? "");
      }
    })();
    return () => { ok = false; };
  }, [clientId, companyEmail, defaultTo, open]);

  useEffect(() => {
    if (!open) {
      setSubject(DEFAULT_SUBJECT);
      setBody(DEFAULT_BODY);
      setShowPreview(false);
    }
  }, [open]);

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="mr-2 h-4 w-4" /> E-mail opmaken
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>E-mail opmaken</DialogTitle>
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

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
          <Button asChild disabled={!to}>
            <a
              href={mailtoHref}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                void logClientActivity({
                  clientId,
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
