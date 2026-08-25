import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ShieldAlert,
  BarChart3,
  Receipt,
  Package,
  FileText,
  Loader2,
  Save,
  Users,
  Building2,
  History,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { supabase } from "@/integrations/supabase/client";
import { listUsers, setUserRole } from "@/lib/users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/administratie")({
  head: () => ({
    meta: [
      { title: "Administratie — gebruikers, rollen & organisatie" },
      {
        name: "description",
        content:
          "Beheer gebruikers en rollen en stel de basisgegevens van je organisatie in.",
      },
      { property: "og:title", content: "Administratie — gebruikers, rollen & organisatie" },
      {
        property: "og:description",
        content:
          "Beheer gebruikers en rollen en stel de basisgegevens van je organisatie in.",
      },
    ],
  }),
  component: AdministratiePage,
});

const tiles = [
  {
    title: "Analytics",
    description: "Inzicht in pipeline, conversie en omzettrends.",
    to: "/analytics",
    icon: BarChart3,
  },
  {
    title: "Boekhouding",
    description: "Journaal, BTW, debiteuren en crediteuren.",
    to: "/boekhouding",
    icon: Receipt,
  },
  {
    title: "Inkoopfacturen",
    description: "Voer leveranciersfacturen in met bijlage en boek ze door.",
    to: "/inkoopfacturen",
    icon: Receipt,
  },
  {
    title: "Producten & Prijzen",
    description: "Beheer producten, abonnementen en tarieven.",
    to: "/producten",
    icon: Package,
  },
  {
    title: "Klant-auditlog",
    description: "Wie wijzigde welk klantveld, met filters op periode, gebruiker en actie.",
    to: "/auditlog",
    icon: History,
  },
];

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  roles: string[];
};

function AdministratiePage() {
  const { hasRole } = useAuth();
  if (!hasRole("admin")) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">Geen toegang</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Administratie is alleen toegankelijk voor admins.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-brand" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Administratie</h1>
          <p className="text-sm text-muted-foreground">
            Onderdelen, gebruikersbeheer en instellingen per organisatie.
          </p>
        </div>
      </div>

      <Tabs defaultValue="onderdelen">
        <TabsList>
          <TabsTrigger value="onderdelen">Onderdelen</TabsTrigger>
          <TabsTrigger value="gebruikers">Gebruikers &amp; rollen</TabsTrigger>
          <TabsTrigger value="organisatie">Organisatie</TabsTrigger>
        </TabsList>

        <TabsContent value="onderdelen" className="mt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tiles.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                className="group rounded-xl border bg-card p-5 transition hover:border-brand/40 hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <t.icon className="h-5 w-5" />
                  </span>
                  <h2 className="text-base font-semibold">{t.title}</h2>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{t.description}</p>
                <span className="mt-4 inline-block text-xs font-medium text-brand opacity-0 transition group-hover:opacity-100">
                  Openen →
                </span>
              </Link>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="gebruikers" className="mt-6">
          <UsersPanel />
        </TabsContent>

        <TabsContent value="organisatie" className="mt-6">
          <OrgSettingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UsersPanel() {
  const fnList = useServerFn(listUsers);
  const fnRole = useServerFn(setUserRole);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fnList({} as never)
      .then((data) => {
        if (active) setRows(data as UserRow[]);
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Kon gebruikers niet laden"),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [fnList]);

  async function changeRole(userId: string, role: "admin" | "medewerker") {
    setSavingId(userId);
    try {
      await fnRole({ data: { userId, role, enabled: true } });
      if (role === "medewerker") {
        await fnRole({ data: { userId, role: "admin", enabled: false } });
      }
      setRows((prev) =>
        prev.map((r) => (r.id === userId ? { ...r, roles: [role] } : r)),
      );
      toast.success("Rol bijgewerkt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kon rol niet wijzigen");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Gebruikers laden…
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-brand" />
          <h2 className="text-base font-semibold">Gebruikers &amp; rollen</h2>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/gebruikers">Uitnodigen &amp; beheren</Link>
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Naam</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Laatste login</TableHead>
            <TableHead className="w-48">Rol</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                Geen gebruikers gevonden.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((u) => {
              const role = u.roles.includes("admin") ? "admin" : "medewerker";
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.display_name ?? "—"}
                    {role === "admin" && (
                      <Badge variant="secondary" className="ml-2">
                        admin
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.last_sign_in_at
                      ? new Date(u.last_sign_in_at).toLocaleString("nl-NL")
                      : "Nooit"}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={role}
                      onValueChange={(v) => changeRole(u.id, v as "admin" | "medewerker")}
                      disabled={savingId === u.id}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="medewerker">Medewerker</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

type OrgForm = {
  name: string;
  email: string;
  phone: string;
  website: string;
  kvk_number: string;
  tax_number: string;
  address_line1: string;
  postal_code: string;
  city: string;
  country: string;
  invoice_prefix: string;
};

const EMPTY_ORG: OrgForm = {
  name: "",
  email: "",
  phone: "",
  website: "",
  kvk_number: "",
  tax_number: "",
  address_line1: "",
  postal_code: "",
  city: "",
  country: "",
  invoice_prefix: "",
};

function OrgSettingsPanel() {
  const { currentOrganizationId, loading: wsLoading } = useWorkspace();
  const [form, setForm] = useState<OrgForm>(EMPTY_ORG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentOrganizationId) {
      setLoading(wsLoading);
      return;
    }
    let active = true;
    setLoading(true);
    supabase
      .from("organizations")
      .select(
        "name, email, phone, website, kvk_number, tax_number, address_line1, postal_code, city, country, invoice_prefix",
      )
      .eq("id", currentOrganizationId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) toast.error(error.message);
        if (data) {
          setForm({
            name: data.name ?? "",
            email: data.email ?? "",
            phone: data.phone ?? "",
            website: data.website ?? "",
            kvk_number: data.kvk_number ?? "",
            tax_number: data.tax_number ?? "",
            address_line1: data.address_line1 ?? "",
            postal_code: data.postal_code ?? "",
            city: data.city ?? "",
            country: data.country ?? "",
            invoice_prefix: data.invoice_prefix ?? "",
          });
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentOrganizationId, wsLoading]);

  async function save() {
    if (!currentOrganizationId) return;
    if (!form.name.trim()) {
      toast.error("Naam is verplicht");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("organizations")
      .update({
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        kvk_number: form.kvk_number.trim() || null,
        tax_number: form.tax_number.trim() || null,
        address_line1: form.address_line1.trim() || null,
        postal_code: form.postal_code.trim() || null,
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        invoice_prefix: form.invoice_prefix.trim() || "F",
      })
      .eq("id", currentOrganizationId);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Organisatiegegevens opgeslagen");
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Instellingen laden…
      </div>
    );
  }

  if (!currentOrganizationId) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Geen actieve organisatie geselecteerd.
      </p>
    );
  }

  const field = (key: keyof OrgForm, label: string, placeholder?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b p-4">
        <Building2 className="h-4 w-4 text-brand" />
        <h2 className="text-base font-semibold">Basisinstellingen organisatie</h2>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        {field("name", "Naam")}
        {field("email", "E-mail")}
        {field("phone", "Telefoon")}
        {field("website", "Website")}
        {field("kvk_number", "KvK-nummer")}
        {field("tax_number", "BTW-nummer")}
        {field("address_line1", "Adres")}
        {field("postal_code", "Postcode")}
        {field("city", "Plaats")}
        {field("country", "Land")}
        {field("invoice_prefix", "Factuurprefix", "F")}
      </div>
      <div className="flex justify-end border-t p-4">
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Opslaan
        </Button>
      </div>
    </div>
  );
}
