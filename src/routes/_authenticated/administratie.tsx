import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Loader2, ShieldAlert } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/administratie")({
  head: () => ({ meta: [{ title: "Administratie — AI van Columbus" }] }),
  component: AdministratiePage,
});

type Client = Database["public"]["Tables"]["clients"]["Row"];

const EUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const MONTH_FMT = new Intl.DateTimeFormat("nl-NL", { month: "short", year: "2-digit" });

const empty = { name: "", monthly_value: "0", start_date: "" };

function AdministratiePage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(empty);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) toast.error("Klanten laden mislukt: " + error.message);
    setClients((data ?? []) as Client[]);
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  if (!isAdmin) {
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

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }

  function openEdit(c: Client) {
    setEditing(c);
    setForm({
      name: c.name,
      monthly_value: String(c.monthly_value ?? 0),
      start_date: c.start_date ?? "",
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Klantnaam is verplicht");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      monthly_value: Number(form.monthly_value) || 0,
      start_date: form.start_date || null,
    };
    const { error } = editing
      ? await supabase.from("clients").update(payload).eq("id", editing.id)
      : await supabase.from("clients").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Opslaan mislukt: " + error.message);
      return;
    }
    toast.success(editing ? "Klant bijgewerkt" : "Klant toegevoegd");
    setOpen(false);
    load();
  }

  async function remove(c: Client) {
    if (!confirm(`Klant "${c.name}" verwijderen?`)) return;
    const { error } = await supabase.from("clients").delete().eq("id", c.id);
    if (error) {
      toast.error("Verwijderen mislukt: " + error.message);
      return;
    }
    toast.success("Klant verwijderd");
    load();
  }

  const total = clients.reduce((acc, c) => acc + Number(c.monthly_value ?? 0), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Administratie</h1>
          <p className="text-sm text-muted-foreground">Klantenoverzicht — pot.waarde per maand.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Nieuwe klant
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Klant bewerken" : "Nieuwe klant"}</DialogTitle>
              <DialogDescription>Vul de gegevens van de klant in.</DialogDescription>
            </DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-name">Klantnaam *</Label>
                <Input
                  id="c-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="c-value">Pot.waarde per maand (€)</Label>
                  <Input
                    id="c-value"
                    type="number"
                    step="0.01"
                    value={form.monthly_value}
                    onChange={(e) => setForm({ ...form, monthly_value: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-date">Ingangsdatum</Label>
                  <Input
                    id="c-date"
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Opslaan
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-sky-100/60 hover:bg-sky-100/60">
              <TableHead className="w-12">#</TableHead>
              <TableHead>Klant</TableHead>
              <TableHead className="text-right">Pot.waarde / maand</TableHead>
              <TableHead className="text-right">Ingangsdatum</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nog geen klanten
                </TableCell>
              </TableRow>
            ) : (
              clients.map((c, i) => (
                <TableRow key={c.id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {EUR.format(Number(c.monthly_value ?? 0))}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {c.start_date ? MONTH_FMT.format(new Date(c.start_date)) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(c)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell />
              <TableCell className="font-semibold">Totaal</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {EUR.format(total)}
              </TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
