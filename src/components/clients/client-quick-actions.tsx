import { useEffect, useState } from "react";
import { Mail, Phone, Smartphone, Linkedin, ChevronDown, Building2, Star, Copy, Check } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClientEmailComposer } from "@/components/clients/client-email-composer";

type Contact = Database["public"]["Tables"]["client_contacts"]["Row"];

export function ClientQuickActions({
  clientId,
  companyName,
  companyEmail,
  companyPhone,
}: {
  clientId: string;
  companyName: string;
  companyEmail?: string | null;
  companyPhone?: string | null;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    let ok = true;
    (async () => {
      const { data } = await supabase
        .from("client_contacts")
        .select("*")
        .eq("client_id", clientId)
        .order("is_primary", { ascending: false })
        .order("first_name", { ascending: true });
      if (ok) setContacts((data ?? []) as Contact[]);
    })();
    return () => { ok = false; };
  }, [clientId]);

  const primary = contacts.find((c) => c.is_primary) ?? contacts[0];
  const mailTo = primary?.email ?? companyEmail ?? null;
  const callTo = primary?.mobile ?? primary?.phone ?? companyPhone ?? null;
  const label = (c: Contact) => [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email || "Onbekend";

  const mailContacts = contacts.filter((c) => !!c.email);
  const callContacts = contacts.filter((c) => !!(c.mobile || c.phone));
  const linkedinContacts = contacts.filter((c) => !!c.linkedin_url);

  function CopyButton({ value }: { value: string | null | undefined }) {
    const [copied, setCopied] = useState(false);
    if (!value) return null;
    return (
      <button
        type="button"
        onClick={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success("Gekopieerd: " + value);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toast.error("Kopiëren mislukt");
          }
        }}
        className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Kopiëren"
        title="Kopiëren"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {/* E-mail opmaken */}
      <ClientEmailComposer
        clientId={clientId}
        companyName={companyName}
        companyEmail={companyEmail}
      />

      {/* E-mail */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={!mailTo && mailContacts.length === 0 && !companyEmail}>
            <Mail className="mr-2 h-4 w-4" /> Mail
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {companyEmail && (
            <>
              <DropdownMenuLabel className="text-xs">Bedrijf</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <a href={`mailto:${companyEmail}`} className="flex items-center justify-between">
                  <span className="flex items-center">
                    <Building2 className="mr-2 h-4 w-4" /> {companyEmail}
                  </span>
                  <CopyButton value={companyEmail} />
                </a>
              </DropdownMenuItem>
              {mailContacts.length > 0 && <DropdownMenuSeparator />}
            </>
          )}
          {mailContacts.length > 0 ? (
            <>
              <DropdownMenuLabel className="text-xs">Contactpersonen</DropdownMenuLabel>
              {mailContacts.map((c) => (
                <DropdownMenuItem key={c.id} asChild>
                  <a href={`mailto:${c.email!}`} className="flex items-center gap-2">
                    {c.is_primary && <Star className="h-3.5 w-3.5 fill-current text-brand" />}
                    <span className="truncate">{label(c)}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">{c.email}</span>
                    <CopyButton value={c.email} />
                  </a>
                </DropdownMenuItem>
              ))}
            </>
          ) : !companyEmail && (
            <DropdownMenuItem disabled>Geen e-mailadres bekend</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Bel */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={!callTo && callContacts.length === 0 && !companyPhone}>
            <Phone className="mr-2 h-4 w-4" /> Bel
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {companyPhone && (
            <>
              <DropdownMenuLabel className="text-xs">Bedrijf</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <a href={`tel:${companyPhone}`} className="flex items-center justify-between">
                  <span className="flex items-center">
                    <Building2 className="mr-2 h-4 w-4" /> {companyPhone}
                  </span>
                  <CopyButton value={companyPhone} />
                </a>
              </DropdownMenuItem>
              {callContacts.length > 0 && <DropdownMenuSeparator />}
            </>
          )}
          {callContacts.length > 0 ? (
            <>
              <DropdownMenuLabel className="text-xs">Contactpersonen</DropdownMenuLabel>
              {callContacts.map((c) => (
                <div key={c.id}>
                  {c.mobile && (
                    <DropdownMenuItem asChild>
                      <a href={`tel:${c.mobile}`} className="flex items-center gap-2">
                        <Smartphone className="h-3.5 w-3.5" />
                        <span className="truncate">{label(c)}</span>
                        <span className="ml-auto truncate text-xs text-muted-foreground">{c.mobile}</span>
                        <CopyButton value={c.mobile} />
                      </a>
                    </DropdownMenuItem>
                  )}
                  {c.phone && (
                    <DropdownMenuItem asChild>
                      <a href={`tel:${c.phone}`} className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5" />
                        <span className="truncate">{label(c)}</span>
                        <span className="ml-auto truncate text-xs text-muted-foreground">{c.phone}</span>
                        <CopyButton value={c.phone} />
                      </a>
                    </DropdownMenuItem>
                  )}
                </div>
              ))}
            </>
          ) : !companyPhone && (
            <DropdownMenuItem disabled>Geen telefoonnummer bekend</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* LinkedIn */}
      {linkedinContacts.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Linkedin className="mr-2 h-4 w-4" /> LinkedIn
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {linkedinContacts.map((c) => (
              <DropdownMenuItem key={c.id} asChild>
                <a
                  href={c.linkedin_url!.startsWith("http") ? c.linkedin_url! : `https://${c.linkedin_url!}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2"
                >
                  <Linkedin className="h-3.5 w-3.5" />
                  <span className="truncate">{label(c)}</span>
                </a>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
