import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/_authenticated/ai-columbus/leads")({
  head: () => ({ meta: [{ title: "Leads funnel" }] }),
  component: LeadsKanbanPage,
});

type LeadStage = Database["public"]["Enums"]["lead_stage"];
type Lead = Database["public"]["Tables"]["leads"]["Row"];

const STAGES: { key: LeadStage; color: string }[] = [
  { key: "nieuwe", color: "bg-orange-500" },
  { key: "op_afspraak", color: "bg-green-500" },
  { key: "in_afwachting", color: "bg-emerald-600" },
  { key: "even_on_hold", color: "bg-yellow-500" },
  { key: "in_contact", color: "bg-lime-600" },
  { key: "klant", color: "bg-teal-600" },
  { key: "verloren", color: "bg-red-500" },
  { key: "ai_columbus", color: "bg-slate-600" },
];

const EUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

function LeadsKanbanPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const { currentOrganizationId, currentOrganization, loading: wsLoading } = useWorkspace();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const eur = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en-IE" : "nl-NL", {
        style: "currency",
        currency: "EUR",
      }),
    [i18n.resolvedLanguage],
  );

  async function load() {
    if (!currentOrganizationId) {
      setLeads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("organization_id", currentOrganizationId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setLeads((data ?? []) as Lead[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!wsLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganizationId, wsLoading]);

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
      const tt = map.get(l.stage)!;
      tt.count += 1;
      tt.value += Number(l.value ?? 0);
    });
    return map;
  }, [leads]);

  async function moveLead(id: string, stage: LeadStage) {
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage } : l)));
    const { error } = await supabase.from("leads").update({ stage }).eq("id", id);
    if (error) {
      toast.error(error.message);
      setLeads(prev);
    }
  }

  async function createLead(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error(t("leads.name_required"));
    if (!currentOrganizationId) return toast.error(t("leads.no_organization"));
    setSaving(true);
    const { error } = await supabase.from("leads").insert({
      organization_id: currentOrganizationId,
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
    if (error) return toast.error(error.message);
    toast.success(t("leads.created"));
    setOpen(false);
    setForm({ name: "", stage: "nieuwe", value: "0", source: "", rep: "", phone: "", email: "", notes: "" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {currentOrganization?.name ?? ""} — {t("leads.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("leads.drag_hint")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t("leads.new_lead")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("leads.new_lead")}</DialogTitle>
              <DialogDescription>{currentOrganization?.name}</DialogDescription>
            </DialogHeader>
            <form onSubmit={createLead} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="lead-name">Naam *</Label>
                  <Input id="lead-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Fase</Label>
                  <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v as LeadStage })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => (
                        <SelectItem key={s.key} value={s.key}>{t(`leads.stages.${s.key}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-value">€</Label>
                  <Input id="lead-value" type="number" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-source">Bron</Label>
                  <Input id="lead-source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-rep">{t("leads.rep")}</Label>
                  <Input id="lead-rep" value={form.rep} onChange={(e) => setForm({ ...form, rep: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-email">E-mail</Label>
                  <Input id="lead-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-phone">Tel.</Label>
                  <Input id="lead-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="lead-notes">Notities</Label>
                  <Textarea id="lead-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : (
        <div className="grid grid-flow-col auto-cols-[16rem] gap-3 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const stageLeads = grouped.get(stage.key) ?? [];
            const tot = totals.get(stage.key)!;
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
                <div className={`flex items-center justify-between gap-2 rounded-t-lg px-3 py-2 text-xs font-semibold text-white ${stage.color}`}>
                  <span className="truncate">{t(`leads.stages.${stage.key}`)}</span>
                  <span className="shrink-0 opacity-90">{eur.format(tot.value)} · {tot.count}</span>
                </div>
                <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
                  {stageLeads.length === 0 && (
                    <div className="flex flex-1 items-center justify-center py-6 text-xs text-muted-foreground">
                      {t("leads.empty")}
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
                        <div className="mt-1 text-xs text-muted-foreground">{t("leads.rep")}: {lead.rep}</div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">{eur.format(Number(lead.value ?? 0))}</Badge>
                        {lead.source && <Badge variant="outline" className="text-[10px]">{lead.source}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AIAssistantPanel
        title={t("ai_assistant.title")}
        task="summarize_lead"
        suggestions={[
          {
            label: t("ai_assistant.summarize_lead"),
            task: "summarize_lead",
            context: leads
              .slice(0, 5)
              .map((l) => `- ${l.name} (${l.stage}) €${l.value ?? 0} — ${l.notes ?? ""}`)
              .join("\n") || "Geen leads beschikbaar.",
          },
          {
            label: t("ai_assistant.suggest_quote"),
            task: "lead_to_quote",
            context:
              leads[0]
                ? `Lead: ${leads[0].name}, waarde €${leads[0].value ?? 0}, notities: ${leads[0].notes ?? "-"}`
                : "Geen lead geselecteerd.",
          },
        ]}
      />
    </div>
  );
}


