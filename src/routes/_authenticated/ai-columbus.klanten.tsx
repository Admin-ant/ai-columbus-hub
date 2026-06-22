import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Search, Pencil, Trash2, Building2, Mail, Phone, Globe } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/ai-columbus/klanten")({
  head: () => ({ meta: [{ title: "Klanten" }] }),
  component: ClientsPage,
});

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];

const EMPTY = {
  name: "",
  kvk_number: "",
  vat_number: "",
  contact_person: "",
  email: "",
  phone: "",
  website: "",
  address_line1: "",
  address_line2: "",
  postal_code: "",
  city: "",
  country: "Nederland",
  monthly_value: "0",
  notes: "",
};
type FormState = typeof EMPTY;

function ClientsPage() {
  const { user } = useAuth();
  const { currentOrganizationId, loading: wsLoading } = useWorkspace();
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  async function load() {
    if (!currentOrganizationId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("clients").select("*")
      .eq("organization_id", currentOrganizationId)
      .order("name", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data ?? []) as ClientRow[]);
    setLoading(false);
  }
  useEffect(() => { if (!wsLoading) load(); /* eslint-disable-next-line */ }, [currentOrganizationId, wsLoading]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.name} ${r.kvk_number ?? ""} ${r.contact_person ?? ""} ${r.email ?? ""} ${r.city ?? ""}`
        .toLowerCase().includes(q)
    );
  }, [rows, search]);

  function startNew() {
    setEditId(null);
    setForm(EMPTY);
    setOpen(true);
  }
  function startEdit(r: ClientRow) {
    setEditId(r.id);
    setForm({
      name: r.name ?? "",
      kvk_number: r.kvk_number ?? "",
      vat_number: r.vat_number ?? "",
      contact_person: r.contact_person ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      website: r.website ?? "",
      address_line1: r.address_line1 ?? "",
      address_line2: r.address_line2 ?? "",
      postal_code: r.postal_code ?? "",
      city: r.city ?? "",
      country: r.country ?? "Nederland",
      monthly_value: r.monthly_value != null ? String(r.monthly_value) : "0",
      notes: r.notes ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!currentOrganizationId) return;
    if (!form.name.trim()) { toast.error("Naam is verplicht"); return; }
    setSaving(true);
    const payload = {
      organization_id: currentOrganizationId,
      name: form.name.trim(),
      kvk_number: form.kvk_number.trim() || null,
      vat_number: form.vat_number.trim() || null,
      contact_person: form.contact_person.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      website: form.website.trim() || null,
      address_line1: form.address_line1.trim() || null,
      address_line2: form.address_line2.trim() || null,
      postal_code: form.postal_code.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim() || null,
      monthly_value: form.monthly_value ? Number(form.monthly_value) : 0,
      notes: form.notes.trim() || null,
    };
    let error;
    if (editId) {
      ({ error } = await supabase.from("clients").update(payload).eq("id", editId));
    } else {
      ({ error } = await supabase.from("clients").insert({ ...payload, created_by: user?.id ?? null }));
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editId ? "Klant bijgewerkt" : "Klant toegevoegd");
    setOpen(false);
    load();
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from("clients").delete().eq("id", deleteId);
    if (error) { toast.error(error.message); return; }
    toast.success("Klant verwijderd");
    setDeleteId(null);
    load();
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Klanten</h1>
          <p className="text-muted-foreground">Beheer NAW-gegevens en KvK-nummers van klanten en relaties.</p>
        </div>
        <Button onClick={startNew}>
          <Plus className="mr-2 h-4 w-4" /> Nieuwe klant
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full md:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Zoek op naam, KvK, plaats..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Badge variant="secondary">{filtered.length} klant{filtered.length === 1 ? "" : "en"}</Badge>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Naam</th>
                <th className="px-4 py-3 font-medium">KvK</th>
                <th className="px-4 py-3 font-medium">Contactpersoon</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Adres</th>
                <th className="px-4 py-3 text-right font-medium">Acties</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Nog geen klanten. Klik op "Nieuwe klant" om er een toe te voegen.
                </td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {r.name}
                    </div>
                    {r.website && (
                      <a href={r.website.startsWith("http") ? r.website : `https://${r.website}`} target="_blank" rel="noreferrer"
                        className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        <Globe className="h-3 w-3" /> {r.website}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.kvk_number || "—"}</td>
                  <td className="px-4 py-3">{r.contact_person || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-1 text-xs">
                      {r.email && <a href={`mailto:${r.email}`} className="flex items-center gap-1 hover:text-foreground"><Mail className="h-3 w-3" /> {r.email}</a>}
                      {r.phone && <a href={`tel:${r.phone}`} className="flex items-center gap-1 hover:text-foreground"><Phone className="h-3 w-3" /> {r.phone}</a>}
                      {!r.email && !r.phone && <span className="text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.address_line1 || r.postal_code || r.city ? (
                      <>
                        {r.address_line1}{r.address_line2 ? `, ${r.address_line2}` : ""}
                        <br />
                        {[r.postal_code, r.city].filter(Boolean).join(" ")}
                      </>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? "Klant bewerken" : "Nieuwe klant"}</DialogTitle>
            <DialogDescription>NAW-gegevens, KvK en contactgegevens van de klant.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Bedrijfsnaam *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>KvK-nummer</Label>
              <Input value={form.kvk_number} onChange={(e) => setForm({ ...form, kvk_number: e.target.value })} placeholder="12345678" />
            </div>
            <div>
              <Label>BTW-nummer</Label>
              <Input value={form.vat_number} onChange={(e) => setForm({ ...form, vat_number: e.target.value })} placeholder="NL........B01" />
            </div>
            <div>
              <Label>Contactpersoon</Label>
              <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Telefoon</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Website</Label>
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." />
            </div>
            <div className="md:col-span-2">
              <Label>Adres</Label>
              <Input value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} placeholder="Straat en huisnummer" />
            </div>
            <div className="md:col-span-2">
              <Input value={form.address_line2} onChange={(e) => setForm({ ...form, address_line2: e.target.value })} placeholder="Adresregel 2 (optioneel)" />
            </div>
            <div>
              <Label>Postcode</Label>
              <Input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
            </div>
            <div>
              <Label>Plaats</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <Label>Land</Label>
              <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
            <div>
              <Label>Maandbedrag (€)</Label>
              <Input type="number" step="0.01" value={form.monthly_value} onChange={(e) => setForm({ ...form, monthly_value: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Notities</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editId ? "Opslaan" : "Toevoegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Klant verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>Deze actie kan niet ongedaan gemaakt worden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Verwijderen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
