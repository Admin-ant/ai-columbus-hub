import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  History,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Plus,
  Pencil,
  Trash2,
  Download,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERIODS, periodRange, isValidPeriod, type PeriodKey } from "@/lib/dashboard-period";

export const Route = createFileRoute("/_authenticated/auditlog")({
  head: () => ({
    meta: [
      { title: "Klant-auditlog — wijzigingen per gebruiker" },
      {
        name: "description",
        content:
          "Bekijk alle wijzigingen aan klantgegevens met filters op periode, gebruiker en actie.",
      },
      { property: "og:title", content: "Klant-auditlog — wijzigingen per gebruiker" },
      {
        property: "og:description",
        content:
          "Bekijk alle wijzigingen aan klantgegevens met filters op periode, gebruiker en actie.",
      },
    ],
  }),
  component: AuditLogPage,
});

type Row = {
  id: string;
  client_id: string;
  action: string;
  changed_fields: string[] | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
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
  postal_code: "Postcode",
  city: "Plaats",
  country: "Land",
  notes: "Notities",
  monthly_value: "Maandwaarde",
  start_date: "Startdatum",
};

const HIDDEN_FIELDS = new Set(["id", "created_at", "updated_at", "organization_id", "created_by"]);

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "ja" : "nee";
  return String(v);
}

function actionMeta(action: string) {
  if (action === "insert")
    return { label: "Aangemaakt", Icon: Plus, variant: "default" as const };
  if (action === "delete")
    return { label: "Verwijderd", Icon: Trash2, variant: "destructive" as const };
  return { label: "Bewerkt", Icon: Pencil, variant: "secondary" as const };
}

function AuditLogPage() {
  const { hasRole } = useAuth();
  const { currentOrganizationId, loading: wsLoading } = useWorkspace();

  const [rows, setRows] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [actor, setActor] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);


  const isAdmin = hasRole("admin");

  useEffect(() => {
    if (!isAdmin || !currentOrganizationId) {
      if (!wsLoading) setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      setLoading(true);
      const { from } = periodRange(period);
      let q = supabase
        .from("client_audit_log")
        .select("id, client_id, action, changed_fields, old_data, new_data, actor_email, created_at")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (from) q = q.gte("created_at", from.toISOString());
      const { data, error } = await q;
      if (!active) return;
      if (error) toast.error(error.message);
      const list = (data ?? []) as unknown as Row[];
      setRows(list);

      const ids = Array.from(new Set(list.map((r) => r.client_id).filter(Boolean)));
      if (ids.length > 0) {
        const { data: clients } = await supabase
          .from("clients")
          .select("id, name")
          .in("id", ids);
        if (!active) return;
        setNames(
          Object.fromEntries((clients ?? []).map((c) => [c.id as string, (c.name as string) ?? "—"])),
        );
      } else {
        setNames({});
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [isAdmin, currentOrganizationId, wsLoading, period, refreshKey]);

  const actors = useMemo(
    () => Array.from(new Set(rows.map((r) => r.actor_email).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (actor !== "all" && (r.actor_email ?? "") !== actor) return false;
      if (action !== "all" && r.action !== action) return false;
      if (term) {
        const hay = `${names[r.client_id] ?? ""} ${r.actor_email ?? ""} ${(r.changed_fields ?? []).join(" ")}`;
        if (!hay.toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [rows, actor, action, search, names]);

  function exportCsv() {
    const head = ["Datum", "Klant", "Actie", "Gebruiker", "Gewijzigde velden"];
    const lines = filtered.map((r) =>
      [
        new Date(r.created_at).toLocaleString("nl-NL"),
        names[r.client_id] ?? r.client_id,
        actionMeta(r.action).label,
        r.actor_email ?? "",
        (r.changed_fields ?? []).filter((f) => !HIDDEN_FIELDS.has(f)).join(" | "),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const blob = new Blob([[head.join(";"), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `klant-auditlog-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">Geen toegang</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          De klant-auditlog is alleen toegankelijk voor admins.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <History className="h-6 w-6 text-brand" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Klant-auditlog</h1>
            <p className="text-sm text-muted-foreground">
              Alle wijzigingen aan klantgegevens, filterbaar op periode, gebruiker en actie.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" /> Vernieuwen
          </Button>

        </div>
      </div>

      <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Periode</Label>
          <Select
            value={period}
            onValueChange={(v) => isValidPeriod(v) && setPeriod(v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Gebruiker</Label>
          <Select value={actor} onValueChange={setActor}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle gebruikers</SelectItem>
              {actors.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Actie</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle acties</SelectItem>
              <SelectItem value="insert">Aangemaakt</SelectItem>
              <SelectItem value="update">Bewerkt</SelectItem>
              <SelectItem value="delete">Verwijderd</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-search">Zoeken</Label>
          <Input
            id="audit-search"
            value={search}
            placeholder="Klant, gebruiker of veld…"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b p-4 text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "gebeurtenis" : "gebeurtenissen"}
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Auditlog laden…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Geen wijzigingen gevonden voor deze filters.
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((r) => {
              const { label, Icon, variant } = actionMeta(r.action);
              const fields = (r.changed_fields ?? []).filter((f) => !HIDDEN_FIELDS.has(f));
              return (
                <li key={r.id} className="p-4 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-md bg-muted p-1.5">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={variant} className="text-[10px]">
                          {label}
                        </Badge>
                        <Link
                          to="/ai-columbus/klanten/$clientId"
                          params={{ clientId: r.client_id }}
                          className="font-medium hover:underline"
                        >
                          {names[r.client_id] ?? "Onbekende klant"}
                        </Link>
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
                              <span className="font-medium text-foreground">
                                {FIELD_LABELS[f] ?? f}:
                              </span>{" "}
                              <span className="line-through">{fmt((r.old_data ?? {})[f])}</span>
                              {" → "}
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
        )}
      </div>
    </div>
  );
}
