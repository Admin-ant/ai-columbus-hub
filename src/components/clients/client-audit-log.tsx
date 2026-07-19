import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, History, Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

type LogRow = {
  id: string;
  client_id: string;
  action: "insert" | "update" | "delete";
  changed_fields: string[] | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  actor_id: string | null;
  actor_email: string | null;
  created_at: string;
};

const FIELD_LABELS: Record<string, string> = {
  name: "Bedrijfsnaam",
  kvk_number: "KvK-nummer",
  vat_number: "BTW-nummer",
  contact_person: "Contactpersoon",
  email: "E-mail",
  phone: "Telefoon",
  website: "Website",
  address_line1: "Adres",
  address_line2: "Adres (regel 2)",
  postal_code: "Postcode",
  city: "Plaats",
  country: "Land",
  notes: "Notities",
  monthly_value: "Maandwaarde",
  start_date: "Startdatum",
  preferred_locale: "Voorkeurstaal",
};

const HIDDEN_FIELDS = new Set(["id", "created_at", "updated_at", "organization_id", "created_by"]);

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "ja" : "nee";
  return String(v);
}

export function ClientAuditLog({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_audit_log")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setRows((data ?? []) as unknown as LogRow[]);
    setLoading(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [clientId]);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <div>
            <h4 className="text-sm font-semibold">Wijzigingsgeschiedenis bedrijfsgegevens</h4>
            <p className="text-xs text-muted-foreground">Wie heeft welk veld aangepast en wanneer?</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Vernieuwen
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Nog geen wijzigingen geregistreerd.
        </div>
      ) : (
        <ScrollArea className="max-h-96">
          <ul className="divide-y">
            {rows.map((r) => {
              const Icon = r.action === "insert" ? Plus : r.action === "delete" ? Trash2 : Pencil;
              const variant = r.action === "insert" ? "default" : r.action === "delete" ? "destructive" : "secondary";
              const label = r.action === "insert" ? "Aangemaakt" : r.action === "delete" ? "Verwijderd" : "Bewerkt";
              const fields = (r.changed_fields ?? []).filter((f) => !HIDDEN_FIELDS.has(f));
              return (
                <li key={r.id} className="p-4 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-md bg-muted p-1.5">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={variant as "default" | "destructive" | "secondary"} className="text-[10px]">{label}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("nl-NL")}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        door {r.actor_email ?? "onbekende gebruiker"}
                      </div>
                      {r.action === "update" && fields.length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-xs">
                          {fields.map((f) => (
                            <li key={f} className="text-muted-foreground">
                              <span className="font-medium text-foreground">{FIELD_LABELS[f] ?? f}:</span>{" "}
                              <span className="line-through">{fmt((r.old_data ?? {})[f])}</span>{" → "}
                              <span>{fmt((r.new_data ?? {})[f])}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}
