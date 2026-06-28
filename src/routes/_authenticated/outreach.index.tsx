import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  Upload,
  Send,
  CalendarClock,
  Video,
  MapPin,
  FileText,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
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
import {
  bulkImportTargets,
  sendOutreachEmail,
  scheduleSequence,
  personalizeForTarget,
  bulkPersonalize,
} from "@/lib/outreach.functions";
import { OutreachAnalyticsTab } from "@/components/outreach/analytics-tab";
import { OutreachInboxTab } from "@/components/outreach/inbox-tab";
import { SequenceBuilder } from "@/components/outreach/sequence-builder";
import { SendOutreachDialog } from "@/components/outreach/send-outreach-dialog";
import { DemoPromptDialog } from "@/components/outreach/demo-prompt-dialog";
import { NL_PROVINCES } from "@/lib/outreach-templates";


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
  personalized_at?: string | null;
  personalized_subject?: string | null;
  province?: string | null;
  demo_type?: "online" | "onsite" | null;
  demo_at?: string | null;
};

function OutreachDashboard() {
  const { user } = useAuth();
  const { currentOrganizationId, currentOrganization, loading: wsLoading } = useWorkspace();
  const ask = useServerFn(askAssistant);
  const research = useServerFn(researchLead);
  const genVariants = useServerFn(generatePitchVariants);
  const sendEmailFn = useServerFn(sendOutreachEmail);
  const scheduleSeqFn = useServerFn(scheduleSequence);
  const importFn = useServerFn(bulkImportTargets);
  const personalizeFn = useServerFn(personalizeForTarget);
  const bulkPersonalizeFn = useServerFn(bulkPersonalize);
  const navigate = useNavigate();
  const [unreadInbox, setUnreadInbox] = useState(0);
  const [builderCampaignId, setBuilderCampaignId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [sendDialogTarget, setSendDialogTarget] = useState<TargetRow | null>(null);
  const [demoDialogTarget, setDemoDialogTarget] = useState<TargetRow | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function runPersonalize(t: TargetRow) {
    toast.loading("AI personaliseren…", { id: "pz" });
    try {
      await personalizeFn({ data: { target_id: t.id } });
      toast.success("Gepersonaliseerd", { id: "pz" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mislukt", { id: "pz" });
    }
  }

  async function runBulkPersonalize() {
    const ids = targets.filter((t) => t.stage === "nieuw" && t.email).map((t) => t.id).slice(0, 50);
    if (ids.length === 0) return toast.error("Geen nieuwe prospects met e-mail");
    if (!confirm(`AI personaliseer ${ids.length} prospect(s)? Dit kan even duren.`)) return;
    setBulkBusy(true);
    toast.loading(`Bezig met ${ids.length} prospects…`, { id: "bp" });
    try {
      const r = await bulkPersonalizeFn({ data: { target_ids: ids } });
      toast.success(`${r.personalized} gepersonaliseerd, ${r.failed} fout`, { id: "bp" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mislukt", { id: "bp" });
    } finally {
      setBulkBusy(false);
    }
  }

  async function sendNow(t: TargetRow) {
    if (!t.email) return toast.error("Geen e-mailadres");
    if (!confirm(`Direct e-mail sturen naar ${t.email}?`)) return;
    toast.loading("Versturen…", { id: "snd" });
    try {
      await sendEmailFn({ data: { target_id: t.id } });
      toast.success("Verstuurd", { id: "snd" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mislukt", { id: "snd" });
    }
  }

  async function startSequence(t: TargetRow) {
    if (!t.campaign_id) return toast.error("Koppel eerst aan een campagne met sequentie");
    toast.loading("Inplannen…", { id: "sch" });
    try {
      await scheduleSeqFn({ data: { target_id: t.id, start_in_minutes: 1 } });
      toast.success("Sequentie ingepland (start binnen 15 min)", { id: "sch" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mislukt", { id: "sch" });
    }
  }

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
    const prev = targets.find((t) => t.id === id);
    if (prev && prev.stage === stage) return;
    setTargets((cur) => cur.map((t) => (t.id === id ? { ...t, stage } : t)));
    const { error } = await supabase
      .from("outreach_targets")
      .update({ stage, last_contact_at: stage !== "nieuw" ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
      return;
    }
    // Side-effects per target stage
    const fresh = prev ? { ...prev, stage } : null;
    if (fresh && stage === "aangeschreven") {
      setSendDialogTarget(fresh);
    } else if (fresh && stage === "gesprek" && !fresh.demo_at) {
      setDemoDialogTarget(fresh);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over?.id;
    const activeId = event.active.id;
    if (!overId || typeof overId !== "string" || typeof activeId !== "string") return;
    const stage = overId as Stage;
    if (!STAGES.some((s) => s.key === stage)) return;
    moveTarget(activeId, stage);
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
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Megaphone className="h-6 w-6" style={{ color: ACCENT }} />
              Cold Outreach
            </h1>
            <p className="text-sm text-muted-foreground">
              {currentOrganization?.name ?? ""} — pipeline & campagnes
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/outreach/templates">
              <Button
                variant="outline"
                size="sm"
                className="border-border bg-muted/50 text-foreground hover:bg-muted"
              >
                <FileText className="mr-1 h-4 w-4" />
                Mail templates
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="border-brand/40 text-brand hover:bg-brand/10"
              onClick={runBulkPersonalize}
              disabled={bulkBusy}
            >
              <Sparkles className="mr-1 h-4 w-4" />
              {bulkBusy ? "Bezig…" : "AI personaliseer nieuwe"}
            </Button>
            <ImportCsvDialog
              campaigns={campaigns}
              orgId={currentOrganizationId}
              importFn={importFn}
              onDone={load}
            />
            <NewTargetDialog
              campaigns={campaigns}
              orgId={currentOrganizationId}
              userId={user?.id ?? null}
              onCreated={load}
            />
            <NewProvincialCampaignButton
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
          <TabsList className="bg-muted/50 border border-border">
            <TabsTrigger value="pipeline" className="data-[state=active]:bg-brand/20 data-[state=active]:text-foreground">
              Pipeline
            </TabsTrigger>
            <TabsTrigger value="inbox" className="data-[state=active]:bg-brand/20 data-[state=active]:text-foreground">
              Inbox{unreadInbox > 0 ? ` (${unreadInbox})` : ""}
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="data-[state=active]:bg-brand/20 data-[state=active]:text-foreground">
              Campagnes ({campaigns.length})
            </TabsTrigger>
            <TabsTrigger value="sequences" className="data-[state=active]:bg-brand/20 data-[state=active]:text-foreground">
              Sequences
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-brand/20 data-[state=active]:text-foreground">
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="mt-4">
            {loading ? (
              <Loading />
            ) : (
              <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {STAGES.map((s) => {
                    const items = targets.filter((t) => t.stage === s.key);
                    return (
                      <DroppableColumn key={s.key} stage={s.key} color={s.color} label={s.label} count={items.length}>
                        {items.length === 0 ? (
                          <div className="rounded border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
                            Sleep hier
                          </div>
                        ) : (
                          items.map((t) => (
                            <DraggableCard key={t.id} id={t.id}>
                              <TargetCard
                                row={t}
                                campaign={campaigns.find((c) => c.id === t.campaign_id) ?? null}
                                onMove={moveTarget}
                                onDelete={deleteTarget}
                                onCreateQuote={() => createQuoteFromTarget(t)}
                                onResearch={() => runResearch(t)}
                                onPersonalize={() => runPersonalize(t)}
                                onSendNow={() => sendNow(t)}
                                onStartSequence={() => startSequence(t)}
                                onOpenSend={() => setSendDialogTarget(t)}
                                onOpenDemo={() => setDemoDialogTarget(t)}
                              />
                            </DraggableCard>
                          ))
                        )}
                      </DroppableColumn>
                    );
                  })}
                </div>
              </DndContext>
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
                    onGenerateVariants={() => runVariants(c)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="inbox" className="mt-4">
            <OutreachInboxTab
              organizationId={currentOrganizationId}
              campaignNames={Object.fromEntries(campaigns.map((c) => [c.id, c.name]))}
              onUnreadChange={setUnreadInbox}
            />
          </TabsContent>

          <TabsContent value="sequences" className="mt-4">
            {campaigns.length === 0 ? (
              <Empty text="Maak eerst een campagne aan." />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Campagne:</Label>
                  <Select
                    value={builderCampaignId ?? campaigns[0]?.id ?? ""}
                    onValueChange={setBuilderCampaignId}
                  >
                    <SelectTrigger className="w-[280px] bg-muted/50 border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {campaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(() => {
                  const active = campaigns.find(
                    (c) => c.id === (builderCampaignId ?? campaigns[0]?.id),
                  );
                  if (!active) return null;
                  return (
                    <SequenceBuilder
                      key={active.id}
                      campaignId={active.id}
                      initialSteps={(active.sequence_steps ?? []) as never}
                      onSaved={() => load()}
                    />
                  );
                })()}
              </div>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="mt-4">
            <OutreachAnalyticsTab
              organizationId={currentOrganizationId}
              campaignNames={Object.fromEntries(campaigns.map((c) => [c.id, c.name]))}
            />
          </TabsContent>
        </Tabs>
      </div>

      <SendOutreachDialog
        open={!!sendDialogTarget}
        onOpenChange={(o) => !o && setSendDialogTarget(null)}
        target={sendDialogTarget}
        organizationId={currentOrganizationId}
        onSend={async ({ subject, body }) => {
          if (!sendDialogTarget) return;
          await sendEmailFn({
            data: {
              target_id: sendDialogTarget.id,
              override_subject: subject,
              override_body: body,
            },
          });
          load();
        }}
      />

      <DemoPromptDialog
        open={!!demoDialogTarget}
        onOpenChange={(o) => !o && setDemoDialogTarget(null)}
        targetId={demoDialogTarget?.id ?? null}
        targetCompany={demoDialogTarget?.company}
        initialType={demoDialogTarget?.demo_type ?? null}
        initialAt={demoDialogTarget?.demo_at ?? null}
        onSaved={load}
      />
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
      className="rounded-lg border border-border bg-muted/50 p-4"
      style={accent ? { boxShadow: `0 0 24px ${ACCENT}33`, borderColor: `${ACCENT}55` } : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
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
  onResearch,
  onPersonalize,
  onSendNow,
  onStartSequence,
  onOpenSend,
  onOpenDemo,
}: {
  row: TargetRow & { personalized_at?: string | null };
  campaign: Campaign | null;
  onMove: (id: string, stage: Stage) => void;
  onDelete: (id: string) => void;
  onCreateQuote: () => void;
  onResearch: () => void;
  onPersonalize: () => void;
  onSendNow: () => void;
  onStartSequence: () => void;
  onOpenSend?: () => void;
  onOpenDemo?: () => void;
}) {
  const [showResearch, setShowResearch] = useState(false);
  const demoLabel = row.demo_at
    ? new Date(row.demo_at).toLocaleString("nl-NL", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  return (
    <div className="group rounded-md border border-border bg-muted/40 p-3 transition-all hover:border-brand/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{row.company}</div>
          {row.contact_name && (
            <div className="truncate text-xs text-muted-foreground">{row.contact_name}</div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-400"
          onClick={() => onDelete(row.id)}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
        {row.email && <Mail className="h-3 w-3" />}
        {row.linkedin_url && <Linkedin className="h-3 w-3" />}
        {row.phone && <Phone className="h-3 w-3" />}
        {row.province && (
          <span className="rounded bg-blue-500/15 text-blue-200 px-1.5 py-0.5 text-[10px]">
            {row.province}
          </span>
        )}
        {campaign && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{campaign.name}</span>
        )}
        {row.research_summary && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px]"
            style={{ background: `${ACCENT}22`, color: ACCENT }}
          >
            ✨ research
          </span>
        )}
      </div>
      {(row.stage === "gesprek" || row.stage === "gewonnen") && row.demo_at && (
        <button
          type="button"
          onClick={onOpenDemo}
          className="mt-2 flex w-full items-center gap-1.5 rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-1.5 text-[11px] font-medium text-purple-200 hover:bg-purple-500/20"
        >
          {row.demo_type === "onsite" ? (
            <MapPin className="h-3 w-3" />
          ) : (
            <Video className="h-3 w-3" />
          )}
          <span className="truncate">
            {row.demo_type === "onsite" ? "Op locatie" : "Teams"} · {demoLabel}
          </span>
        </button>
      )}
      {row.stage === "gesprek" && !row.demo_at && onOpenDemo && (
        <button
          type="button"
          onClick={onOpenDemo}
          className="mt-2 flex w-full items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/50"
        >
          <CalendarClock className="h-3 w-3" /> Demo plannen
        </button>
      )}
      {onOpenSend && row.stage !== "verloren" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenSend}
          className="mt-2 h-7 w-full justify-start text-[11px] hover:bg-muted"
          title="Open bericht-sjablonen"
        >
          <Mail className="mr-1 h-3 w-3" /> Aanschrijven (templates)
        </Button>
      )}
      <Select value={row.stage} onValueChange={(v) => onMove(row.id, v as Stage)}>
        <SelectTrigger className="mt-2 h-7 border-border bg-muted/50 text-xs">
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
      <div className="mt-2 flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onResearch}
          className="h-7 flex-1 justify-start text-[11px] hover:bg-muted"
          title="AI research op deze prospect"
        >
          <Search className="mr-1 h-3 w-3" /> Research
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCreateQuote}
          className="h-7 flex-1 justify-start text-[11px] hover:bg-brand/10"
          style={{ color: ACCENT }}
        >
          <FileSignature className="mr-1 h-3 w-3" /> Offerte
        </Button>
      </div>
      <div className="mt-1 flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onPersonalize}
          className="h-7 flex-1 justify-start text-[11px] hover:bg-brand/10"
          style={{ color: ACCENT }}
          title="AI personaliseer onderwerp + body voor deze prospect"
        >
          <Sparkles className="mr-1 h-3 w-3" />
          {row.personalized_at ? "Re-personaliseer" : "Personaliseer"}
        </Button>
      </div>
      {row.email && (
        <div className="mt-1 flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSendNow}
            className="h-7 flex-1 justify-start text-[11px] hover:bg-muted"
            title="Stuur direct e-mail"
          >
            <Send className="mr-1 h-3 w-3" /> Verstuur
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onStartSequence}
            className="h-7 flex-1 justify-start text-[11px] hover:bg-muted"
            title="Start sequentie van de campagne"
          >
            <CalendarClock className="mr-1 h-3 w-3" /> Sequentie
          </Button>
        </div>
      )}
      {row.research_summary && (
        <button
          type="button"
          onClick={() => setShowResearch((v) => !v)}
          className="mt-2 w-full text-left text-[10px] text-muted-foreground hover:text-muted-foreground"
        >
          {showResearch ? "▾ Verberg research" : "▸ Toon research"}
        </button>
      )}
      {showResearch && row.research_summary && (
        <pre className="mt-1 max-h-48 overflow-auto rounded border border-border bg-muted/50 p-2 text-[10px] leading-snug text-foreground whitespace-pre-wrap">
          {row.research_summary}
        </pre>
      )}
    </div>
  );
}

function CampaignCard({
  campaign,
  targetCount,
  onToggle,
  onDelete,
  onGenerateSequence,
  onGenerateVariants,
}: {
  campaign: Campaign;
  targetCount: number;
  onToggle: () => void;
  onDelete: () => void;
  onGenerateSequence: () => void;
  onGenerateVariants: () => void;
}) {
  const channelIcon =
    campaign.channel === "linkedin" ? Linkedin : campaign.channel === "cold-call" ? Phone : Mail;
  const Icon = channelIcon;
  const isActive = campaign.status === "active";
  return (
    <div
      className="rounded-lg border border-border bg-muted/50 p-4 transition-all hover:border-brand/40"
      style={isActive ? { boxShadow: `0 0 24px ${ACCENT}22` } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">{campaign.name}</div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {campaign.channel} · {targetCount} prospects
            </div>
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-border text-[10px] uppercase"
          style={
            isActive
              ? { borderColor: ACCENT, color: ACCENT }
              : { color: "rgba(255,255,255,0.6)" }
          }
        >
          {campaign.status}
        </Badge>
      </div>
      {campaign.goal && <p className="mt-3 text-xs text-muted-foreground">{campaign.goal}</p>}
      {campaign.ai_pitch && (
        <div className="mt-3 rounded border border-brand/30 bg-brand/5 p-2">
          <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider" style={{ color: ACCENT }}>
            <Sparkles className="h-3 w-3" /> AI Pitch
          </div>
          <p className="line-clamp-4 text-[11px] text-foreground whitespace-pre-wrap">{campaign.ai_pitch}</p>
        </div>
      )}
      {Array.isArray(campaign.sequence_steps) && campaign.sequence_steps.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <ListOrdered className="h-3 w-3" /> Sequentie ({campaign.sequence_steps.length} stappen)
          </div>
          {campaign.sequence_steps.map((s, i) => (
            <div key={i} className="rounded border border-border bg-muted/40 p-2">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Dag {s.day} · {s.channel}</span>
                {s.subject && <span className="truncate font-medium text-muted-foreground">{s.subject}</span>}
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] text-foreground/75 whitespace-pre-wrap">{s.body}</p>
            </div>
          ))}
        </div>
      )}
      {Array.isArray(campaign.pitch_variants) && campaign.pitch_variants.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <FlaskConical className="h-3 w-3" /> A/B varianten ({campaign.pitch_variants.length})
          </div>
          {campaign.pitch_variants.map((v) => (
            <div key={v.id} className="rounded border border-border bg-muted/40 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-foreground">{v.label}</span>
                <button
                  type="button"
                  onClick={() => {
                    const txt = v.subject ? `${v.subject}\n\n${v.body}` : v.body;
                    navigator.clipboard.writeText(txt).then(() => toast.success("Gekopieerd"));
                  }}
                  className="text-muted-foreground hover:text-foreground"
                  title="Kopieer"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
              {v.angle && (
                <div className="text-[10px] uppercase tracking-wider" style={{ color: ACCENT }}>
                  {v.angle}
                </div>
              )}
              {v.subject && (
                <div className="mt-1 text-[10px] text-muted-foreground">Onderwerp: {v.subject}</div>
              )}
              <p className="mt-1 line-clamp-3 text-[11px] text-foreground/75 whitespace-pre-wrap">
                {v.body}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-[11px] text-muted-foreground">Limiet: {campaign.daily_limit}/dag</span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onGenerateSequence}
            className="h-7 text-xs hover:bg-brand/10"
            style={{ color: ACCENT }}
            title="Genereer een 3-staps AI-sequentie"
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            Sequentie
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onGenerateVariants}
            className="h-7 text-xs hover:bg-muted"
            title="Genereer 3 A/B pitchvarianten"
          >
            <FlaskConical className="mr-1 h-3.5 w-3.5" />
            A/B
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs hover:bg-muted"
            onClick={onToggle}
          >
            {isActive ? <PauseCircle className="mr-1 h-3.5 w-3.5" /> : <PlayCircle className="mr-1 h-3.5 w-3.5" />}
            {isActive ? "Pauzeer" : "Start"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
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
  const initialForm = {
    company: "",
    contact_name: "",
    email: "",
    phone: "",
    linkedin_url: "",
    campaign_id: "",
    province: "",
    notes: "",
    demo_type: "" as "" | "online" | "onsite",
    demo_at: "",
  };
  const [form, setForm] = useState(initialForm);

  // When a campaign with a province is chosen, auto-fill province
  function onCampaignChange(id: string) {
    const camp = campaigns.find((c) => c.id === id) as (Campaign & { province?: string | null }) | undefined;
    setForm((f) => ({
      ...f,
      campaign_id: id,
      province: f.province || (camp?.province ?? ""),
    }));
  }

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
      province: form.province || null,
      demo_type: form.demo_type || null,
      demo_at: form.demo_at ? new Date(form.demo_at).toISOString() : null,
      stage: "nieuw",
      created_by: userId,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Prospect toegevoegd");
    setOpen(false);
    setForm(initialForm);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-border bg-muted/50 text-foreground hover:bg-muted">
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
            <div className="space-y-1.5">
              <Label>Provincie</Label>
              <Select value={form.province} onValueChange={(v) => setForm({ ...form, province: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer provincie" />
                </SelectTrigger>
                <SelectContent>
                  {NL_PROVINCES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Campagne</Label>
              <Select value={form.campaign_id} onValueChange={onCampaignChange}>
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
            <div className="col-span-2 rounded-md border border-border bg-muted/50 p-3 space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" /> Demo inplannen (optioneel)
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={form.demo_type}
                    onValueChange={(v) => setForm({ ...form, demo_type: v as "online" | "onsite" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Geen demo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online">
                        <span className="inline-flex items-center gap-2"><Video className="h-3.5 w-3.5" /> Online (Teams)</span>
                      </SelectItem>
                      <SelectItem value="onsite">
                        <span className="inline-flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> Op locatie</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Datum &amp; tijd</Label>
                  <Input
                    type="datetime-local"
                    value={form.demo_at}
                    onChange={(e) => setForm({ ...form, demo_at: e.target.value })}
                  />
                </div>
              </div>
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
          className="text-foreground shadow-[0_0_24px_rgba(255,43,214,0.5)]"
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
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const splitLine = (l: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') {
        if (inQ && l[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if ((ch === "," || ch === ";" || ch === "\t") && !inQ) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
  return lines.slice(1).map((l) => {
    const cells = splitLine(l);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cells[i] ?? ""));
    return obj;
  });
}

function ImportCsvDialog({
  campaigns,
  orgId,
  importFn,
  onDone,
}: {
  campaigns: Campaign[];
  orgId: string | null;
  importFn: ReturnType<typeof useServerFn<typeof bulkImportTargets>>;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [campaignId, setCampaignId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  function fieldOf(row: Record<string, string>, keys: string[]): string {
    for (const k of keys) {
      if (row[k] && row[k].length > 0) return row[k];
    }
    return "";
  }

  async function handleImport() {
    if (!orgId) return toast.error("Geen organisatie");
    const parsed = parseCsv(text);
    if (parsed.length === 0) return toast.error("Geen rijen gevonden");
    const rows = parsed
      .map((r) => ({
        company: fieldOf(r, ["company", "bedrijf", "organization", "name"]),
        contact_name: fieldOf(r, ["contact_name", "contact", "naam", "first_name", "full_name"]) || null,
        email: fieldOf(r, ["email", "e_mail", "mail"]) || null,
        phone: fieldOf(r, ["phone", "telefoon", "tel"]) || null,
        linkedin_url: fieldOf(r, ["linkedin", "linkedin_url"]) || null,
        notes: fieldOf(r, ["notes", "notitie"]) || null,
      }))
      .filter((r) => r.company);
    if (rows.length === 0) return toast.error("Geen geldige rijen — vereist kolom: company");
    setBusy(true);
    try {
      const res = await importFn({
        data: {
          organization_id: orgId,
          campaign_id: campaignId || null,
          rows,
        },
      });
      toast.success(`${res.inserted} prospects geïmporteerd`);
      setOpen(false);
      setText("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-border bg-muted/50 text-foreground hover:bg-muted">
          <Upload className="mr-2 h-4 w-4" /> CSV import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl border-border bg-background text-foreground">
        <DialogHeader>
          <DialogTitle>CSV bulk import</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Plak CSV (kop verplicht). Herkende kolommen: company, contact_name, email, phone, linkedin_url, notes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Campagne (optioneel)</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger className="border-border bg-muted/50">
                <SelectValue placeholder="Geen campagne" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"company,contact_name,email\nAcme BV,Jan Jansen,jan@acme.nl"}
            className="min-h-[220px] border-border bg-muted/40 font-mono text-xs"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Annuleren
          </Button>
          <Button onClick={handleImport} disabled={busy} style={{ background: ACCENT, color: "white" }}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Importeer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* DnD helpers                                                                */
/* -------------------------------------------------------------------------- */

function DroppableColumn({
  stage,
  color,
  label,
  count,
  children,
}: {
  stage: Stage;
  color: string;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border bg-muted/50 p-3 transition ${
        isOver ? "border-brand/60 bg-brand/10" : "border-border"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: color, boxShadow: `0 0 8px ${color}` }}
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
            {label}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="space-y-2 min-h-[60px]">{children}</div>
    </div>
  );
}

function DraggableCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({ id });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.6 : 1,
    cursor: "grab",
  };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Provincial campaign quick action                                           */
/* -------------------------------------------------------------------------- */

function NewProvincialCampaignButton({
  orgId,
  userId,
  onCreated,
}: {
  orgId: string | null;
  userId: string | null;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [province, setProvince] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!orgId) return toast.error("Geen organisatie");
    if (!province) return toast.error("Kies een provincie");
    setSaving(true);
    // Load the default email template for body/subject seed
    const { data: tpl } = await supabase
      .from("outreach_message_templates")
      .select("subject, body")
      .eq("organization_id", orgId)
      .eq("channel", "email")
      .eq("is_default", true)
      .maybeSingle();
    const t = tpl as { subject: string | null; body: string } | null;
    const sequence = [
      {
        day: 1,
        channel: "email",
        subject: t?.subject ?? `Halveer de screeningstijd voor {{company}} in ${province}`,
        body: t?.body?.replace(/\{\{\s*province\s*\}\}/g, province) ?? "",
      },
    ];
    const { error } = await supabase.from("outreach_campaigns").insert({
      organization_id: orgId,
      name: `Recruitment ${province}`,
      channel: "email",
      status: "draft",
      goal: `Recruitment-bureaus aanschrijven in ${province}`,
      daily_limit: 20,
      province,
      sequence_steps: sequence as never,
      created_by: userId,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Campagne "Recruitment ${province}" aangemaakt`);
    setOpen(false);
    setProvince("");
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-blue-400/40 text-blue-200 hover:bg-blue-400/10"
        >
          <MapPin className="mr-1 h-4 w-4" /> Provinciale campagne
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md border-border bg-background text-foreground">
        <DialogHeader>
          <DialogTitle>Nieuwe provinciale campagne</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Maakt automatisch een campagne aan met het standaard e-mail-sjabloon, ingevuld
            op de gekozen provincie.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-[11px] text-muted-foreground">Provincie</Label>
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger className="bg-muted/50 border-border text-foreground">
                <SelectValue placeholder="Kies provincie" />
              </SelectTrigger>
              <SelectContent>
                {NL_PROVINCES.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
          <Button
            onClick={create}
            disabled={saving}
            className="bg-brand hover:bg-brand/90 text-brand-foreground"
          >
            {saving ? "Aanmaken…" : "Aanmaken"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

