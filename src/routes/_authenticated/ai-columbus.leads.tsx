import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/ai-columbus/leads")({
  head: () => ({ meta: [{ title: "AI van Columbus — Leads funnel" }] }),
  component: AiColumbusPage,
});

type LeadStage = Database["public"]["Enums"]["lead_stage"];
type Lead = Database["public"]["Tables"]["leads"]["Row"];

const STAGES: { key: LeadStage; label: string; color: string }[] = [
  { key: "nieuwe", label: "Nieuwe", color: "bg-orange-500" },
  { key: "op_afspraak", label: "Op afspraak", color: "bg-green-500" },
  { key: "in_afwachting", label: "In afwachting", color: "bg-emerald-600" },
  { key: "even_on_hold", label: "Even on hold", color: "bg-yellow-500" },
  { key: "in_contact", label: "In contact", color: "bg-lime-600" },
  { key: "klant", label: "Klant", color: "bg-teal-600" },
  { key: "verloren", label: "Verloren", color: "bg-red-500" },
  { key: "ai_columbus", label: "AI van Columbus", color: "bg-slate-600" },
];

const EUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

function AiColumbusPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    stage: "nieuwe" as LeadStage,
    value: "0",
    source: "",
    rep: "",
    phone: "",
    email: "",
    notes: "",
  });

  async function load() {
    setLoading(true);
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", "ai-columbus")
      .maybeSingle();
    setOrgId(org?.id ?? null);
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Leads laden mislukt: " + error.message);
    setLeads((data ?? []) as Lead[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<LeadStage, Lead[]>();
    STAGES.forEach((s) => map.set(s.key, []));
    leads.forEach((l) => map.get(l.stage)?.push(l));
    return map;
  }, [leads]);

  const totals = useMemo(() => {
    const map = new Map<LeadStage, { count: number; value: number }>();
    STAGES.forEach((s) => map.set(s.key, { count: 0, value: 0 }));
    leads.forEach((l) => {
      const t = map.get(l.stage)!;
      t.count += 1;
      t.value += Number(l.value ?? 0);
    });
    return map;
  }, [leads]);

  async function moveLead(id: string, stage: LeadStage) {
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage } : l)));
    const { error } = await supabase.from("leads").update({ stage }).eq("id", id);
    if (error) {
      toast.error("Verplaatsen mislukt: " + error.message);
      setLeads(prev);
    }
  }

  async function createLead(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Naam is verplicht");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("leads").insert({
      name: form.name.trim(),
      stage: form.stage,
      value: Number(form.value) || 0,
      source: form.source || null,
      rep: form.rep || null,
      phone: form.phone || null,
      email: form.email || null,
      notes: form.notes || null,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error("Aanmaken mislukt: " + error.message);
      return;
    }
    toast.success("Lead aangemaakt");
    setOpen(false);
    setForm({
      name: "",
      stage: "nieuwe",
      value: "0",
      source: "",
      rep: "",
      phone: "",
      email: "",
      notes: "",
    });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI van Columbus — Leads funnel</h1>
          <p className="text-sm text-muted-foreground">
            Sleep een lead naar een andere kolom om de fase te wijzigen.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nieuwe lead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nieuwe lead</DialogTitle>
              <DialogDescription>Voeg een nieuwe lead toe aan de funnel.</DialogDescription>
            </DialogHeader>
            <form onSubmit={createLead} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="lead-name">Naam *</Label>
                  <Input
                    id="lead-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Fase</Label>
                  <Select
                    value={form.stage}
                    onValueChange={(v) => setForm({ ...form, stage: v as LeadStage })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-value">Lead waarde (€)</Label>
                  <Input
                    id="lead-value"
                    type="number"
                    step="0.01"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-source">Bron</Label>
                  <Input
                    id="lead-source"
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                    placeholder="bv. Telecom"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-rep">Vertegenwoordiger</Label>
                  <Input
                    id="lead-rep"
                    value={form.rep}
                    onChange={(e) => setForm({ ...form, rep: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-email">E-mail</Label>
                  <Input
                    id="lead-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-phone">Telefoon</Label>
                  <Input
                    id="lead-phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="lead-notes">Notities</Label>
                  <Textarea
                    id="lead-notes"
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
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

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
        </div>
      ) : (
        <div className="grid grid-flow-col auto-cols-[16rem] gap-3 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const stageLeads = grouped.get(stage.key) ?? [];
            const t = totals.get(stage.key)!;
            return (
              <div
                key={stage.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragId) {
                    moveLead(dragId, stage.key);
                    setDragId(null);
                  }
                }}
                className="flex flex-col rounded-lg border bg-muted/30"
              >
                <div
                  className={`flex items-center justify-between gap-2 rounded-t-lg px-3 py-2 text-xs font-semibold text-white ${stage.color}`}
                >
                  <span className="truncate">{stage.label}</span>
                  <span className="shrink-0 opacity-90">
                    {EUR.format(t.value)} · {t.count}
                  </span>
                </div>
                <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
                  {stageLeads.length === 0 && (
                    <div className="flex flex-1 items-center justify-center py-6 text-xs text-muted-foreground">
                      Geen leads
                    </div>
                  )}
                  {stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => setDragId(lead.id)}
                      onDragEnd={() => setDragId(null)}
                      className="cursor-grab rounded-md border bg-card p-3 text-sm shadow-sm transition hover:shadow-md active:cursor-grabbing"
                    >
                      <div className="font-medium">{lead.name}</div>
                      {lead.rep && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Vertegenwoordiger: {lead.rep}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {EUR.format(Number(lead.value ?? 0))}
                        </Badge>
                        {lead.source && (
                          <Badge variant="outline" className="text-[10px]">
                            {lead.source}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
