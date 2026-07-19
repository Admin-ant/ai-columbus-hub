import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Mail, Phone, Smartphone, Linkedin, Pencil, Trash2, Star, StarOff, Building } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
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
import {
  ContactPermissionsDialog,
  DEFAULT_PERMISSIONS,
  type ContactPermissions,
} from "./contact-permissions-dialog";

type ContactRow = Database["public"]["Tables"]["client_contacts"]["Row"];

const EMPTY = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  mobile: "",
  linkedin_url: "",
  department: "",
  job_title: "",
  is_primary: false,
  notes: "",
};
type FormState = typeof EMPTY;

export function ClientContactsManager({
  clientId,
  organizationId,
}: {
  clientId: string;
  organizationId: string | null;
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_contacts")
      .select("*")
      .eq("client_id", clientId)
      .order("is_primary", { ascending: false })
      .order("first_name", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data ?? []) as ContactRow[]);
    setLoading(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [clientId]);

  function startNew() {
    setEditId(null);
    setForm({ ...EMPTY, is_primary: rows.length === 0 });
    setOpen(true);
  }
  function startEdit(r: ContactRow) {
    setEditId(r.id);
    setForm({
      first_name: r.first_name ?? "",
      last_name: r.last_name ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      mobile: r.mobile ?? "",
      linkedin_url: r.linkedin_url ?? "",
      department: r.department ?? "",
      job_title: r.job_title ?? "",
      is_primary: !!r.is_primary,
      notes: r.notes ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!organizationId) { toast.error("Organisatie ontbreekt"); return; }
    if (!form.first_name.trim()) { toast.error("Voornaam is verplicht"); return; }
    setSaving(true);
    const payload = {
      client_id: clientId,
      organization_id: organizationId,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      mobile: form.mobile.trim() || null,
      linkedin_url: form.linkedin_url.trim() || null,
      department: form.department.trim() || null,
      job_title: form.job_title.trim() || null,
      is_primary: form.is_primary,
      notes: form.notes.trim() || null,
    };
    let error;
    if (editId) {
      ({ error } = await supabase.from("client_contacts").update(payload).eq("id", editId));
    } else {
      ({ error } = await supabase.from("client_contacts").insert({ ...payload, created_by: user?.id ?? null }));
    }
    if (!error && form.is_primary) {
      // unset primary on siblings
      await supabase
        .from("client_contacts")
        .update({ is_primary: false })
        .eq("client_id", clientId)
        .neq("id", editId ?? "00000000-0000-0000-0000-000000000000");
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editId ? "Contactpersoon bijgewerkt" : "Contactpersoon toegevoegd");
    setOpen(false);
    load();
  }

  async function togglePrimary(r: ContactRow) {
    if (!r.is_primary) {
      await supabase.from("client_contacts").update({ is_primary: false }).eq("client_id", clientId);
    }
    const { error } = await supabase.from("client_contacts").update({ is_primary: !r.is_primary }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    load();
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from("client_contacts").delete().eq("id", deleteId);
    if (error) { toast.error(error.message); return; }
    setDeleteId(null);
    toast.success("Contactpersoon verwijderd");
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Contactpersonen &amp; medewerkers</h3>
          <p className="text-sm text-muted-foreground">Beheer alle medewerkers van deze klant.</p>
        </div>
        <Button size="sm" onClick={startNew}><Plus className="mr-2 h-4 w-4" /> Nieuwe contactpersoon</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nog geen contactpersonen. Voeg medewerkers van dit bedrijf toe.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium">
                      {[r.first_name, r.last_name].filter(Boolean).join(" ")}
                    </div>
                    {r.is_primary && <Badge className="text-[10px]" variant="default">Primair</Badge>}
                  </div>
                  {(r.job_title || r.department) && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      {r.department && <Building className="h-3 w-3" />}
                      <span>{[r.job_title, r.department].filter(Boolean).join(" · ")}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" title={r.is_primary ? "Primair verwijderen" : "Als primair"} onClick={() => togglePrimary(r)}>
                    {r.is_primary ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm">
                {r.email && <a href={`mailto:${r.email}`} className="flex items-center gap-2 hover:text-foreground text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {r.email}</a>}
                {r.phone && <a href={`tel:${r.phone}`} className="flex items-center gap-2 hover:text-foreground text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {r.phone}</a>}
                {r.mobile && <a href={`tel:${r.mobile}`} className="flex items-center gap-2 hover:text-foreground text-muted-foreground"><Smartphone className="h-3.5 w-3.5" /> {r.mobile}</a>}
                {r.linkedin_url && (
                  <a href={r.linkedin_url.startsWith("http") ? r.linkedin_url : `https://${r.linkedin_url}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-foreground text-muted-foreground">
                    <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                  </a>
                )}
              </div>
              {r.notes && <p className="mt-3 whitespace-pre-wrap text-xs text-muted-foreground">{r.notes}</p>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? "Contactpersoon bewerken" : "Nieuwe contactpersoon"}</DialogTitle>
            <DialogDescription>Medewerker of contactpersoon bij deze klant.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Voornaam *</Label>
              <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div>
              <Label>Achternaam</Label>
              <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
            <div>
              <Label>Functietitel</Label>
              <Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} placeholder="bijv. Sales Manager" />
            </div>
            <div>
              <Label>Afdeling</Label>
              <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="bijv. Verkoop" />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Telefoon (vast)</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Mobiel / 06</Label>
              <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="06 12345678" />
            </div>
            <div>
              <Label>LinkedIn</Label>
              <Input value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/..." />
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_primary}
                  onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
                  className="h-4 w-4"
                />
                Primaire contactpersoon
              </label>
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
            <AlertDialogTitle>Contactpersoon verwijderen?</AlertDialogTitle>
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
