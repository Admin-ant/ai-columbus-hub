import { useEffect, useState } from "react";
import { Mail, Phone, RefreshCcw, User } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Activity = Database["public"]["Tables"]["crm_activities"]["Row"];
type Contact = Database["public"]["Tables"]["client_contacts"]["Row"];

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("nl-NL", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export function ClientActivityHistory({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<Activity[]>([]);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("crm_activities")
      .select("*")
      .eq("client_id", clientId)
      .in("kind", ["email", "call"])
      .order("created_at", { ascending: false })
      .limit(100);
    const list = (data ?? []) as Activity[];
    setItems(list);
    const ids = Array.from(new Set(list.map((a) => a.contact_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: cs } = await supabase.from("client_contacts").select("*").in("id", ids);
      const map: Record<string, Contact> = {};
      (cs ?? []).forEach((c) => { map[c.id] = c as Contact; });
      setContacts(map);
    } else {
      setContacts({});
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [clientId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Historie: e-mails & belpogingen</CardTitle>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCcw className="mr-2 h-3.5 w-3.5" /> Ververs
        </Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen acties vastgelegd.</p>
        ) : (
          <ol className="space-y-3">
            {items.map((a) => {
              const c = a.contact_id ? contacts[a.contact_id] : undefined;
              const contactLabel = c
                ? ([c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email || "Contactpersoon")
                : null;
              return (
                <li key={a.id} className="flex gap-3 rounded-md border p-3">
                  <div className="mt-0.5">
                    {a.kind === "email" ? (
                      <Mail className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Phone className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={a.kind === "email" ? "default" : "secondary"}>
                        {a.kind === "email" ? "E-mail" : "Belpoging"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(a.created_at)}</span>
                      {contactLabel && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" /> {contactLabel}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate text-sm font-medium">{a.title ?? "—"}</div>
                    {a.body && (
                      <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-muted-foreground">
                        {a.body.length > 400 ? a.body.slice(0, 400) + "…" : a.body}
                      </pre>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
