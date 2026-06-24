import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  Megaphone,
  Sparkles,
  Trash2,
  Mail,
  Linkedin,
  Phone,
  Target,
  TrendingUp,
  Users,
  PlayCircle,
  PauseCircle,
  FileSignature,
  ListOrdered,
  Search,
  FlaskConical,
  Copy,
} from "lucide-react";
import { buildDefaultSections, DEFAULT_THEME } from "@/lib/offerte-studio";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { useServerFn } from "@tanstack/react-start";
import { askAssistant } from "@/lib/ai-assistant.functions";
import { researchLead, generatePitchVariants, type PitchVariant } from "@/lib/ai-power.functions";

export const Route = createFileRoute("/_authenticated/outreach/")({
  head: () => ({ meta: [{ title: "Cold Outreach" }] }),
  component: OutreachDashboard,
});

const ACCENT = "#ff2bd6";

const STAGES = [
  { key: "nieuw", label: "Nieuw", color: "#64748b" },
  { key: "aangeschreven", label: "Aangeschreven", color: "#3b82f6" },
  { key: "reactie", label: "Reactie", color: "#f59e0b" },
  { key: "gesprek", label: "Gesprek", color: "#a855f7" },
  { key: "gewonnen", label: "Gewonnen", color: "#10b981" },
  { key: "verloren", label: "Verloren", color: "#ef4444" },
] as const;

type Stage = (typeof STAGES)[number]["key"];

type Campaign = {
  id: string;
  name: string;
  channel: "email" | "linkedin" | "cold-call" | "multi";
  status: "draft" | "active" | "paused" | "completed";
  goal: string | null;
  daily_limit: number;
  ai_pitch: string | null;
  notes: string | null;
  created_at: string;
  sequence_steps?: SequenceStep[];
  pitch_variants?: PitchVariant[];
};

export type SequenceStep = {
  day: number;
  channel: "email" | "linkedin" | "cold-call";
  subject?: string;
  body: string;
};

type TargetRow = {
  id: string;
  campaign_id: string | null;
  company: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  stage: Stage;
  last_contact_at: string | null;
  notes: string | null;
  research_summary?: string | null;
  research_at?: string | null;
};

function OutreachDashboard() {
  const { user } = useAuth();
  const { currentOrganizationId, currentOrganization, loading: wsLoading } = useWorkspace();
  const ask = useServerFn(askAssistant);
  const research = useServerFn(researchLead);
  const genVariants = useServerFn(generatePitchVariants);
  const navigate = useNavigate();

  async function runResearch(t: TargetRow) {
    const website = prompt(
      `Website van ${t.company}? (optioneel — laat leeg om alleen met bedrijfsnaam te werken)`,
      "",
    );
    if (website === null) return;
    const url = website.trim();
    const safeUrl = url
      ? url.startsWith("http")
        ? url
        : `https://${url}`
      : undefined;
    toast.loading("AI research…", { id: "rs" });
    try {
      await research({ data: { target_id: t.id, website: safeUrl } });
      toast.success("Research klaar", { id: "rs" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mislukt", { id: "rs" });
    }
  }

  async function runVariants(c: Campaign) {
    toast.loading("A/B varianten genereren…", { id: "ab" });
    try {
      await genVariants({ data: { campaign_id: c.id } });
      toast.success("Varianten opgeslagen", { id: "ab" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mislukt", { id: "ab" });
    }
  }


  async function createQuoteFromTarget(t: TargetRow) {
    if (!currentOrganizationId) return;
    const { data, error } = await supabase
      .from("studio_quotes")
      .insert({
        organization_id: currentOrganizationId,
        title: `Offerte ${t.company}`,
        client_name: t.company,
        outreach_target_id: t.id,
        theme: DEFAULT_THEME as never,
        sections: buildDefaultSections() as never,
        status: "draft",
        created_by: user?.id ?? null,
      } as never)
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    toast.success("Offerte aangemaakt vanuit prospect");
    if (data) navigate({ to: "/offerte-studio/q/$id", params: { id: data.id } });
  }

  async function generateSequence(c: Campaign) {
    toast.loading("AI sequentie genereren…", { id: "seq" });
    try {
      const { reply } = await ask({
        data: {
          task: "generic",
          context: `Maak een 3-staps cold-outreach sequentie als JSON-array voor campagne "${c.name}" (kanaal ${c.channel}, doel: ${c.goal ?? "afspraak inplannen"}). Elk object: {"day": number, "channel": "email"|"linkedin"|"cold-call", "subject": string, "body": string}. Dag 1 = intro, dag 4 = waarde-follow-up, dag 8 = laatste kans. Schrijf in het Nederlands, kort, persoonlijk, geen clichés. Antwoord met UITSLUITEND geldige JSON, geen toelichting of markdown.`,
        },
      });
      const cleaned = reply.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleaned) as SequenceStep[];
      const { error } = await supabase
        .from("outreach_campaigns")
        .update({ sequence_steps: parsed as never })
        .eq("id", c.id);
      if (error) throw new Error(error.message);
      toast.success("Sequentie opgeslagen", { id: "seq" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Genereren mislukt", { id: "seq" });
    }
  }

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!currentOrganizationId) {
      setCampaigns([]);
      setTargets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [c, t] = await Promise.all([
      supabase
        .from("outreach_campaigns")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("outreach_targets")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("updated_at", { ascending: false }),
    ]);
    if (c.error) toast.error(c.error.message);
    if (t.error) toast.error(t.error.message);
    setCampaigns((c.data ?? []) as unknown as Campaign[]);
    setTargets((t.data ?? []) as TargetRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!wsLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganizationId, wsLoading]);

  const stats = useMemo(() => {
    const total = targets.length;
    const active = campaigns.filter((c) => c.status === "active").length;
    const contacted = targets.filter((t) =>
      ["aangeschreven", "reactie", "gesprek", "gewonnen"].includes(t.stage),
    ).length;
    const won = targets.filter((t) => t.stage === "gewonnen").length;
    const replyRate = contacted ? Math.round((targets.filter((t) => ["reactie", "gesprek", "gewonnen"].includes(t.stage)).length / contacted) * 100) : 0;
    return { total, active, contacted, won, replyRate };
  }, [targets, campaigns]);

  async function moveTarget(id: string, stage: Stage) {
    setTargets((cur) => cur.map((t) => (t.id === id ? { ...t, stage } : t)));
    const { error } = await supabase
      .from("outreach_targets")
      .update({ stage, last_contact_at: stage !== "nieuw" ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  async function deleteTarget(id: string) {
    if (!confirm("Deze prospect verwijderen?")) return;
    const { error } = await supabase.from("outreach_targets").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Verwijderd");
    load();
  }

  async function deleteCampaign(id: string) {
    if (!confirm("Deze campagne verwijderen? Prospects blijven behouden.")) return;
    const { error } = await supabase.from("outreach_campaigns").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Verwijderd");
    load();
  }

  async function toggleCampaign(c: Campaign) {
    const next = c.status === "active" ? "paused" : "active";
    const { error } = await supabase.from("outreach_campaigns").update({ status: next }).eq("id", c.id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white -m-4 p-6 md:-m-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Megaphone className="h-6 w-6" style={{ color: ACCENT }} />
              Cold Outreach
            </h1>
            <p className="text-sm text-white/60">
              {currentOrganization?.name ?? ""} — pipeline & campagnes
            </p>
          </div>
          <div className="flex gap-2">
            <NewTargetDialog
              campaigns={campaigns}
              orgId={currentOrganizationId}
              userId={user?.id ?? null}
              onCreated={load}
            />
            <NewCampaignDialog
              orgId={currentOrganizationId}
              userId={user?.id ?? null}
              onCreated={load}
              ask={ask}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <StatCard icon={Users} label="Prospects" value={stats.total} />
          <StatCard icon={PlayCircle} label="Actieve campagnes" value={stats.active} />
          <StatCard icon={Mail} label="Aangeschreven" value={stats.contacted} />
          <StatCard icon={TrendingUp} label="Reply rate" value={`${stats.replyRate}%`} />
          <StatCard icon={Target} label="Gewonnen" value={stats.won} accent />
        </div>

        <Tabs defaultValue="pipeline" className="w-full">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="pipeline" className="data-[state=active]:bg-[#ff2bd6]/20 data-[state=active]:text-white">
              Pipeline
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="data-[state=active]:bg-[#ff2bd6]/20 data-[state=active]:text-white">
              Campagnes ({campaigns.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="mt-4">
            {loading ? (
              <Loading />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {STAGES.map((s) => {
                  const items = targets.filter((t) => t.stage === s.key);
                  return (
                    <div key={s.key} className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }}
                          />
                          <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
                            {s.label}
                          </span>
                        </div>
                        <span className="text-xs text-white/50">{items.length}</span>
                      </div>
                      <div className="space-y-2">
                        {items.length === 0 ? (
                          <div className="rounded border border-dashed border-white/10 p-3 text-center text-[11px] text-white/40">
                            Leeg
                          </div>
                        ) : (
                          items.map((t) => (
                            <TargetCard
                              key={t.id}
                              row={t}
                              campaign={campaigns.find((c) => c.id === t.campaign_id) ?? null}
                              onMove={moveTarget}
                              onDelete={deleteTarget}
                              onCreateQuote={() => createQuoteFromTarget(t)}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="campaigns" className="mt-4">
            {loading ? (
              <Loading />
            ) : campaigns.length === 0 ? (
              <Empty text="Nog geen campagnes. Klik op 'Nieuwe campagne' om te starten." />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {campaigns.map((c) => (
                  <CampaignCard
                    key={c.id}
                    campaign={c}
                    targetCount={targets.filter((t) => t.campaign_id === c.id).length}
                    onToggle={() => toggleCampaign(c)}
                    onDelete={() => deleteCampaign(c.id)}
                    onGenerateSequence={() => generateSequence(c)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Mail;
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-lg border border-white/10 bg-white/5 p-4"
      style={accent ? { boxShadow: `0 0 24px ${ACCENT}33`, borderColor: `${ACCENT}55` } : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-white/60">{label}</span>
        <Icon className="h-4 w-4" style={{ color: accent ? ACCENT : "rgba(255,255,255,0.5)" }} />
      </div>
      <div className="mt-2 text-2xl font-bold" style={{ color: accent ? ACCENT : "white" }}>
        {value}
      </div>
    </div>
  );
}

function TargetCard({
  row,
  campaign,
  onMove,
  onDelete,
  onCreateQuote,
}: {
  row: TargetRow;
  campaign: Campaign | null;
  onMove: (id: string, stage: Stage) => void;
  onDelete: (id: string) => void;
  onCreateQuote: () => void;
}) {
  return (
    <div className="group rounded-md border border-white/10 bg-black/40 p-3 transition-all hover:border-[#ff2bd6]/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{row.company}</div>
          {row.contact_name && (
            <div className="truncate text-xs text-white/60">{row.contact_name}</div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-white/40 opacity-0 group-hover:opacity-100 hover:text-red-400"
          onClick={() => onDelete(row.id)}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-white/50">
        {row.email && <Mail className="h-3 w-3" />}
        {row.linkedin_url && <Linkedin className="h-3 w-3" />}
        {row.phone && <Phone className="h-3 w-3" />}
        {campaign && (
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">{campaign.name}</span>
        )}
      </div>
      <Select value={row.stage} onValueChange={(v) => onMove(row.id, v as Stage)}>
        <SelectTrigger className="mt-2 h-7 border-white/10 bg-white/5 text-xs">
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
      <Button
        variant="ghost"
        size="sm"
        onClick={onCreateQuote}
        className="mt-2 h-7 w-full justify-start text-[11px] hover:bg-[#ff2bd6]/10"
        style={{ color: ACCENT }}
      >
        <FileSignature className="mr-1 h-3 w-3" /> Maak offerte
      </Button>
    </div>
  );
}

function CampaignCard({
  campaign,
  targetCount,
  onToggle,
  onDelete,
  onGenerateSequence,
}: {
  campaign: Campaign;
  targetCount: number;
  onToggle: () => void;
  onDelete: () => void;
  onGenerateSequence: () => void;
}) {
  const channelIcon =
    campaign.channel === "linkedin" ? Linkedin : campaign.channel === "cold-call" ? Phone : Mail;
  const Icon = channelIcon;
  const isActive = campaign.status === "active";
  return (
    <div
      className="rounded-lg border border-white/10 bg-white/5 p-4 transition-all hover:border-[#ff2bd6]/40"
      style={isActive ? { boxShadow: `0 0 24px ${ACCENT}22` } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-white/10">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">{campaign.name}</div>
            <div className="text-[11px] uppercase tracking-wider text-white/50">
              {campaign.channel} · {targetCount} prospects
            </div>
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-white/20 text-[10px] uppercase"
          style={
            isActive
              ? { borderColor: ACCENT, color: ACCENT }
              : { color: "rgba(255,255,255,0.6)" }
          }
        >
          {campaign.status}
        </Badge>
      </div>
      {campaign.goal && <p className="mt-3 text-xs text-white/70">{campaign.goal}</p>}
      {campaign.ai_pitch && (
        <div className="mt-3 rounded border border-[#ff2bd6]/30 bg-[#ff2bd6]/5 p-2">
          <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider" style={{ color: ACCENT }}>
            <Sparkles className="h-3 w-3" /> AI Pitch
          </div>
          <p className="line-clamp-4 text-[11px] text-white/80 whitespace-pre-wrap">{campaign.ai_pitch}</p>
        </div>
      )}
      {Array.isArray(campaign.sequence_steps) && campaign.sequence_steps.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/60">
            <ListOrdered className="h-3 w-3" /> Sequentie ({campaign.sequence_steps.length} stappen)
          </div>
          {campaign.sequence_steps.map((s, i) => (
            <div key={i} className="rounded border border-white/10 bg-black/40 p-2">
              <div className="flex items-center justify-between text-[10px] text-white/50">
                <span>Dag {s.day} · {s.channel}</span>
                {s.subject && <span className="truncate font-medium text-white/70">{s.subject}</span>}
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] text-white/75 whitespace-pre-wrap">{s.body}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
        <span className="text-[11px] text-white/40">Limiet: {campaign.daily_limit}/dag</span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onGenerateSequence}
            className="h-7 text-xs hover:bg-[#ff2bd6]/10"
            style={{ color: ACCENT }}
            title="Genereer een 3-staps AI-sequentie"
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            Sequentie
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs hover:bg-white/10"
            onClick={onToggle}
          >
            {isActive ? <PauseCircle className="mr-1 h-3.5 w-3.5" /> : <PlayCircle className="mr-1 h-3.5 w-3.5" />}
            {isActive ? "Pauzeer" : "Start"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-white/40 hover:bg-red-500/10 hover:text-red-400"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function NewTargetDialog({
  campaigns,
  orgId,
  userId,
  onCreated,
}: {
  campaigns: Campaign[];
  orgId: string | null;
  userId: string | null;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company: "",
    contact_name: "",
    email: "",
    phone: "",
    linkedin_url: "",
    campaign_id: "",
    notes: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return toast.error("Geen organisatie");
    if (!form.company.trim()) return toast.error("Bedrijfsnaam is verplicht");
    setSaving(true);
    const { error } = await supabase.from("outreach_targets").insert({
      organization_id: orgId,
      campaign_id: form.campaign_id || null,
      company: form.company.trim(),
      contact_name: form.contact_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      linkedin_url: form.linkedin_url.trim() || null,
      notes: form.notes.trim() || null,
      stage: "nieuw",
      created_by: userId,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Prospect toegevoegd");
    setOpen(false);
    setForm({ company: "", contact_name: "", email: "", phone: "", linkedin_url: "", campaign_id: "", notes: "" });
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10">
          <Plus className="mr-2 h-4 w-4" /> Prospect
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nieuwe prospect</DialogTitle>
          <DialogDescription>Voeg een lead toe aan je pipeline.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Bedrijf *</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Contactpersoon</Label>
              <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefoon</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>LinkedIn URL</Label>
              <Input value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Campagne</Label>
              <Select value={form.campaign_id} onValueChange={(v) => setForm({ ...form, campaign_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Geen campagne" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notities</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Toevoegen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewCampaignDialog({
  orgId,
  userId,
  onCreated,
  ask,
}: {
  orgId: string | null;
  userId: string | null;
  onCreated: () => void;
  ask: (opts: { data: { task: "generic"; context: string } }) => Promise<{ reply: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    channel: "email" as Campaign["channel"],
    goal: "",
    daily_limit: 20,
    ai_pitch: "",
    notes: "",
  });

  async function generatePitch() {
    if (!form.name.trim() && !form.goal.trim()) {
      return toast.error("Geef eerst een naam en/of doel op");
    }
    setGenerating(true);
    try {
      const { reply } = await ask({
        data: {
          task: "generic",
          context: `Schrijf een korte, persoonlijke cold-outreach pitch (max 120 woorden) voor het kanaal "${form.channel}". Campagne: ${form.name}. Doel: ${form.goal || "afspraak inplannen"}. Gebruik geen clichés. Schrijf in het Nederlands met een directe, zelfverzekerde toon.`,
        },
      });
      setForm((f) => ({ ...f, ai_pitch: reply }));
      toast.success("Pitch gegenereerd");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generatie mislukt");
    } finally {
      setGenerating(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return toast.error("Geen organisatie");
    if (!form.name.trim()) return toast.error("Naam is verplicht");
    setSaving(true);
    const { error } = await supabase.from("outreach_campaigns").insert({
      organization_id: orgId,
      name: form.name.trim(),
      channel: form.channel,
      goal: form.goal.trim() || null,
      daily_limit: form.daily_limit,
      ai_pitch: form.ai_pitch.trim() || null,
      notes: form.notes.trim() || null,
      status: "draft",
      created_by: userId,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Campagne aangemaakt");
    setOpen(false);
    setForm({ name: "", channel: "email", goal: "", daily_limit: 20, ai_pitch: "", notes: "" });
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className="text-white shadow-[0_0_24px_rgba(255,43,214,0.5)]"
          style={{ background: ACCENT }}
        >
          <Plus className="mr-2 h-4 w-4" /> Nieuwe campagne
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nieuwe campagne</DialogTitle>
          <DialogDescription>Definieer kanaal, doel en optionele AI-pitch.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Naam *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Kanaal</Label>
              <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v as Campaign["channel"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="cold-call">Cold call</SelectItem>
                  <SelectItem value="multi">Multi-channel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Dagelijkse limiet</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={form.daily_limit}
                onChange={(e) => setForm({ ...form, daily_limit: Number(e.target.value) || 20 })}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Doel</Label>
              <Input
                placeholder="Bv. demo inplannen bij MKB e-commerce bedrijven"
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <div className="flex items-center justify-between">
                <Label>AI Pitch</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={generatePitch}
                  disabled={generating}
                  style={{ color: ACCENT }}
                >
                  {generating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                  Genereer met AI
                </Button>
              </div>
              <Textarea
                rows={5}
                placeholder="Pitch / openingsbericht…"
                value={form.ai_pitch}
                onChange={(e) => setForm({ ...form, ai_pitch: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notities</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aanmaken
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-20 text-white/60">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 py-16 text-center text-sm text-white/50">
      {text}
    </div>
  );
}
