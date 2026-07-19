import { useEffect, useMemo, useState } from "react";
import { PhoneCall, Copy, Check, Star, Building2, Smartphone, Phone, RotateCcw, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Contact = Database["public"]["Tables"]["client_contacts"]["Row"];

type Script = { id: string; name: string; body: string; builtin?: boolean };

const BUILTIN: Script[] = [
  {
    id: "builtin-intro",
    name: "Kennismaking",
    builtin: true,
    body:
`Hallo {{voornaam}}, je spreekt met [jouw naam] van AI Columbus.
Ik bel je even kort over {{bedrijfsnaam}} — we helpen bedrijven zoals dat van jou met slimme AI-oplossingen.
Heb je twee minuten? Ik wil graag kort ontdekken waar jullie nu tegenaan lopen en of het interessant kan zijn om vrijblijvend eens door te praten.`,
  },
  {
    id: "builtin-followup",
    name: "Opvolgen offerte",
    builtin: true,
    body:
`Hoi {{voornaam}}, met [jouw naam] van AI Columbus.
Ik bel je even in aansluiting op de offerte die we voor {{bedrijfsnaam}} hebben opgesteld.
Heb je hem al kunnen bekijken? Zijn er nog vragen of punten waar ik je bij kan helpen?`,
  },
  {
    id: "builtin-appointment",
    name: "Afspraak bevestigen",
    builtin: true,
    body:
`Hallo {{voornaam}}, met [jouw naam] van AI Columbus.
Ik bel even kort ter bevestiging van onze afspraak met {{bedrijfsnaam}}.
Komt het nog steeds uit op de geplande datum en tijd? Zo ja, dan zorg ik dat alles klaarstaat.`,
  },
];

function storageKey(clientId: string) {
  return `call-scripts:${clientId}`;
}

function loadCustom(clientId: string): Script[] {
  try {
    const raw = localStorage.getItem(storageKey(clientId));
    return raw ? (JSON.parse(raw) as Script[]) : [];
  } catch { return []; }
}
function saveCustom(clientId: string, scripts: Script[]) {
  try { localStorage.setItem(storageKey(clientId), JSON.stringify(scripts)); } catch { /* noop */ }
}

function render(body: string, ctx: { companyName: string; contact?: Contact | null }) {
  const c = ctx.contact;
  const full = c ? [c.first_name, c.last_name].filter(Boolean).join(" ").trim() : "";
  return body
    .replaceAll("{{bedrijfsnaam}}", ctx.companyName || "")
    .replaceAll("{{contactpersoon}}", full || "")
    .replaceAll("{{voornaam}}", c?.first_name || "")
    .replaceAll("{{achternaam}}", c?.last_name || "");
}

export function ClientCallScript({
  clientId,
  companyName,
  companyPhone,
}: {
  clientId: string;
  companyName: string;
  companyPhone?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [customScripts, setCustomScripts] = useState<Script[]>([]);
  const [scriptId, setScriptId] = useState<string>(BUILTIN[0].id);
  const [draft, setDraft] = useState<string>(BUILTIN[0].body);
  const [contactId, setContactId] = useState<string>("company");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let ok = true;
    (async () => {
      const { data } = await supabase
        .from("client_contacts").select("*").eq("client_id", clientId)
        .order("is_primary", { ascending: false })
        .order("first_name", { ascending: true });
      if (ok) setContacts((data ?? []) as Contact[]);
    })();
    setCustomScripts(loadCustom(clientId));
    return () => { ok = false; };
  }, [open, clientId]);

  const allScripts = useMemo(() => [...BUILTIN, ...customScripts], [customScripts]);
  const current = allScripts.find((s) => s.id === scriptId) ?? BUILTIN[0];

  useEffect(() => {
    setDraft(current.body);
  }, [scriptId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedContact = contactId === "company" ? null : contacts.find((c) => c.id === contactId) ?? null;
  const preview = render(draft, { companyName, contact: selectedContact });

  const callNumber = selectedContact?.mobile || selectedContact?.phone || companyPhone || null;

  function reset() {
    setDraft(current.body);
  }

  async function copyPreview() {
    try {
      await navigator.clipboard.writeText(preview);
      setCopied(true);
      toast.success("Belscript gekopieerd");
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("Kopiëren mislukt"); }
  }

  function saveAsNew() {
    const name = window.prompt("Naam voor dit belscript?");
    if (!name) return;
    const s: Script = { id: `custom-${crypto.randomUUID()}`, name, body: draft };
    const next = [...customScripts, s];
    setCustomScripts(next);
    saveCustom(clientId, next);
    setScriptId(s.id);
    toast.success("Belscript opgeslagen");
  }
  function overwriteCustom() {
    if (current.builtin) return;
    const next = customScripts.map((s) => s.id === current.id ? { ...s, body: draft } : s);
    setCustomScripts(next); saveCustom(clientId, next);
    toast.success("Belscript bijgewerkt");
  }
  function removeCustom() {
    if (current.builtin) return;
    if (!window.confirm(`"${current.name}" verwijderen?`)) return;
    const next = customScripts.filter((s) => s.id !== current.id);
    setCustomScripts(next); saveCustom(clientId, next);
    setScriptId(BUILTIN[0].id);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PhoneCall className="mr-2 h-4 w-4" /> Belscript
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Belscript — {companyName}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Script</Label>
              <Select value={scriptId} onValueChange={setScriptId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUILTIN.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  {customScripts.length > 0 && (
                    <>
                      {customScripts.map((s) => (
                        <SelectItem key={s.id} value={s.id}>★ {s.name}</SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Contactpersoon</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">
                    <span className="inline-flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5" /> Bedrijf ({companyName})
                    </span>
                  </SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="inline-flex items-center gap-2">
                        {c.is_primary && <Star className="h-3.5 w-3.5 fill-current text-brand" />}
                        {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Onbekend"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Script (bewerkbaar)</Label>
              <div className="text-[10px] text-muted-foreground">
                Placeholders: {"{{bedrijfsnaam}}"} {"{{contactpersoon}}"} {"{{voornaam}}"} {"{{achternaam}}"}
              </div>
            </div>
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={7} className="font-mono text-sm" />
          </div>

          <div>
            <Label className="text-xs">Voorbeeld</Label>
            <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{preview}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={copyPreview}>
              {copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
              Kopieer script
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={saveAsNew}>
              <Plus className="mr-2 h-3.5 w-3.5" /> Opslaan als nieuw
            </Button>
            {!current.builtin && (
              <>
                <Button type="button" variant="outline" size="sm" onClick={overwriteCustom}>
                  Overschrijven
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={removeCustom}>
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Verwijderen
                </Button>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {callNumber ? (
              <span className="inline-flex items-center gap-1">
                {selectedContact?.mobile ? <Smartphone className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
                {callNumber}
              </span>
            ) : "Geen telefoonnummer bekend"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Sluiten</Button>
            <Button asChild disabled={!callNumber}>
              <a href={callNumber ? `tel:${callNumber}` : undefined}>
                <PhoneCall className="mr-2 h-4 w-4" /> Bellen
              </a>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
