import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];

type FormState = {
  name: string;
  kvk_number: string;
  vat_number: string;
  website: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  city: string;
  country: string;
  notes: string;
};

const empty = (c: ClientRow): FormState => ({
  name: c.name ?? "",
  kvk_number: c.kvk_number ?? "",
  vat_number: c.vat_number ?? "",
  website: c.website ?? "",
  email: c.email ?? "",
  phone: c.phone ?? "",
  address_line1: c.address_line1 ?? "",
  address_line2: c.address_line2 ?? "",
  postal_code: c.postal_code ?? "",
  city: c.city ?? "",
  country: c.country ?? "",
  notes: c.notes ?? "",
});

export function ClientCompanyDetailsDialog({
  client,
  onSaved,
}: {
  client: ClientRow;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(empty(client));

  useEffect(() => { if (open) setForm(empty(client)); }, [open, client]);

  function set<K extends keyof FormState>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.name.trim()) { toast.error("Bedrijfsnaam is verplicht"); return; }
    if (form.kvk_number && !/^[0-9]{8}$/.test(form.kvk_number.replace(/\s/g, ""))) {
      toast.error("KvK-nummer moet 8 cijfers zijn"); return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      kvk_number: form.kvk_number.trim() || null,
      vat_number: form.vat_number.trim() || null,
      website: form.website.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address_line1: form.address_line1.trim() || null,
      address_line2: form.address_line2.trim() || null,
      postal_code: form.postal_code.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim() || null,
      notes: form.notes.trim() || null,
    };
    const { error } = await supabase.from("clients").update(payload).eq("id", client.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bedrijfsgegevens opgeslagen");
    setOpen(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Pencil className="mr-2 h-4 w-4" /> Bewerken</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bedrijfsgegevens bewerken</DialogTitle>
          <DialogDescription>KvK, BTW, adres en contactgegevens van deze klant.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Bedrijfsnaam *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label>KvK-nummer</Label>
            <Input value={form.kvk_number} onChange={(e) => set("kvk_number", e.target.value)} placeholder="12345678" />
          </div>
          <div>
            <Label>BTW-nummer</Label>
            <Input value={form.vat_number} onChange={(e) => set("vat_number", e.target.value)} placeholder="NL123456789B01" />
          </div>
          <div>
            <Label>Website</Label>
            <Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <Label>Telefoon</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div />
          <div className="md:col-span-2">
            <Label>Adres</Label>
            <Input value={form.address_line1} onChange={(e) => set("address_line1", e.target.value)} placeholder="Straat en huisnummer" />
          </div>
          <div className="md:col-span-2">
            <Input value={form.address_line2} onChange={(e) => set("address_line2", e.target.value)} placeholder="Adres (regel 2)" />
          </div>
          <div>
            <Label>Postcode</Label>
            <Input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
          </div>
          <div>
            <Label>Plaats</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Land</Label>
            <Input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="Nederland" />
          </div>
          <div className="md:col-span-2">
            <Label>Notities</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
