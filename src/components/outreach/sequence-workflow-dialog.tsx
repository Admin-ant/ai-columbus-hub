import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Eye,
  Loader2,
  Mail,
  PlayCircle,
  RefreshCw,
  Workflow,
  XCircle,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { scheduleSequence, retryOutreachMessage } from "@/lib/outreach.functions";
import { SequenceBuilder, type SequenceStep } from "@/components/outreach/sequence-builder";
import { SequenceFlowDiagram } from "@/components/outreach/sequence-flow-diagram";
import { computeSchedule, validateSequence } from "@/lib/sequence-workflow";

type CampaignLite = {
  id: string;
  name: string;
  sequence_steps?: SequenceStep[] | null;
};

type Target = {
  id: string;
  company: string;
  campaign_id: string | null;
} | null;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null;
  target?: Target;
  /** Optioneel — als leeg wordt de eerste campagne geselecteerd of de target's campaign_id. */
  initialCampaignId?: string | null;
  onSaved?: () => void;
};

type MessageLog = {
  id: string;
  step_index: number | null;
  channel: string;
  subject: string | null;
  status: string;
  error: string | null;
  sent_at: string | null;
  created_at: string;
};

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  linkedin: "LinkedIn",
  "cold-call": "Cold call",
  wait: "Wachten",
};

function fmtDate(d: Date): string {
  return d.toLocaleString("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SequenceWorkflowDialog({
  open,
  onOpenChange,
  organizationId,
  target,
  initialCampaignId,
  onSaved,
}: Props) {
  const [campaigns, setCampaigns] = useState<CampaignLite[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const scheduleFn = useServerFn(scheduleSequence);

  useEffect(() => {
    if (!open || !organizationId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("outreach_campaigns")
        .select("id, name, sequence_steps")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) toast.error(error.message);
      const list = (data ?? []) as unknown as CampaignLite[];
      setCampaigns(list);
      setSelectedId(
        initialCampaignId ?? target?.campaign_id ?? list[0]?.id ?? null,
      );
      setLoading(false);
    })();
  }, [open, organizationId, initialCampaignId, target?.campaign_id]);

  // Live status: laad laatste berichten van deze prospect (indien target).
  useEffect(() => {
    if (!open || !target?.id) {
      setLogs([]);
      return;
    }
    let cancelled = false;
    const fetchLogs = async () => {
      const { data } = await supabase
        .from("outreach_messages")
        .select("id, step_index, channel, subject, status, error, sent_at, created_at")
        .eq("target_id", target.id)
        .order("created_at", { ascending: false })
        .limit(8);
      if (!cancelled) setLogs((data ?? []) as unknown as MessageLog[]);
    };
    fetchLogs();
    const iv = setInterval(fetchLogs, 15_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [open, target?.id]);

  const active = useMemo(
    () => campaigns.find((c) => c.id === selectedId) ?? null,
    [campaigns, selectedId],
  );

  const activeSteps = (active?.sequence_steps ?? []) as SequenceStep[];
  const issues = useMemo(() => validateSequence(activeSteps), [activeSteps]);
  const canStart = Boolean(target && selectedId && issues.length === 0);

  const schedule = useMemo(
    () => computeSchedule(activeSteps, new Date(Date.now() + 60_000)),
    [activeSteps],
  );

  async function startForTarget() {
    if (!target) return;
    if (!selectedId) return toast.error("Kies eerst een campagne");
    if (issues.length > 0) return toast.error(issues[0].message);
    setStarting(true);
    try {
      if (target.campaign_id !== selectedId) {
        const { error: linkErr } = await supabase
          .from("outreach_targets")
          .update({ campaign_id: selectedId } as never)
          .eq("id", target.id);
        if (linkErr) throw new Error(linkErr.message);
      }
      await scheduleFn({ data: { target_id: target.id, start_in_minutes: 1 } });
      toast.success(`Sequentie gestart voor ${target.company}`);
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Starten mislukt");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-brand" />
            Sequentie workflow
            {target && (
              <span className="text-sm font-normal text-muted-foreground">
                — {target.company}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Bekijk de automatische flow, pas de stappen aan en start de sequentie
            {target ? " voor deze prospect." : "."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <SequenceFlowDiagram />

          {campaigns.length === 0 && !loading ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nog geen campagnes. Maak er eerst één aan.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[240px] flex-1">
                  <Label className="text-xs text-muted-foreground">Campagne</Label>
                  <Select
                    value={selectedId ?? ""}
                    onValueChange={(v) => setSelectedId(v)}
                  >
                    <SelectTrigger className="bg-muted/50 border-border text-foreground">
                      <SelectValue placeholder="Kies campagne" />
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
                {target && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setShowPreview((v) => !v)}
                      disabled={!selectedId || activeSteps.length === 0}
                      className="border-border text-foreground hover:bg-muted"
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      {showPreview ? "Verberg voorbeeld" : "Voorbeeld bekijken"}
                    </Button>
                    <Button
                      onClick={startForTarget}
                      disabled={starting || !canStart}
                      className="bg-brand hover:bg-brand/90 text-brand-foreground"
                    >
                      {starting ? (
                        <>
                          <CalendarClock className="mr-2 h-4 w-4 animate-pulse" />
                          Bezig…
                        </>
                      ) : (
                        <>
                          <PlayCircle className="mr-2 h-4 w-4" />
                          Start voor {target.company}
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>

              {target && issues.length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Workflow nog niet compleet — starten geblokkeerd
                  </div>
                  <ul className="ml-4 list-disc space-y-0.5">
                    {issues.map((iss, k) => (
                      <li key={k}>{iss.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {target && showPreview && schedule.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Geplande verzendmomenten (voorbeeld)
                  </div>
                  <ol className="space-y-1.5">
                    {schedule.map(({ index, step, sendAt }) => (
                      <li
                        key={index}
                        className="flex items-center justify-between gap-3 rounded border border-border/50 bg-background/40 px-2.5 py-1.5 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            Stap {index + 1}
                          </Badge>
                          <span className="text-muted-foreground">
                            {CHANNEL_LABEL[step.channel] ?? step.channel}
                          </span>
                          <span className="truncate text-foreground/85">
                            {step.channel === "wait" ? "wachten" : step.subject || "—"}
                          </span>
                        </div>
                        <span className="text-muted-foreground">{fmtDate(sendAt)}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Exacte tijden kunnen ±1u schuiven i.v.m. het verzendvenster van de campagne.
                  </p>
                </div>
              )}

              {target && logs.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    Live status — laatst uitgevoerde stappen
                  </div>
                  <ul className="space-y-1.5">
                    {logs.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-start justify-between gap-3 rounded border border-border/50 bg-background/40 px-2.5 py-1.5 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {m.status === "sent" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            ) : m.status === "failed" ? (
                              <XCircle className="h-3.5 w-3.5 text-rose-400" />
                            ) : (
                              <CalendarClock className="h-3.5 w-3.5 text-amber-400" />
                            )}
                            <span className="font-medium text-foreground">
                              Stap {(m.step_index ?? 0) + 1}
                            </span>
                            <Badge variant="outline" className="text-[9px]">
                              {CHANNEL_LABEL[m.channel] ?? m.channel}
                            </Badge>
                            <span className="text-muted-foreground">{m.status}</span>
                          </div>
                          <div className="mt-0.5 truncate text-muted-foreground">
                            {m.subject ?? "—"}
                          </div>
                          {m.error && (
                            <div className="mt-0.5 text-[11px] text-rose-300">
                              {m.error}
                            </div>
                          )}
                        </div>
                        <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                          {m.sent_at
                            ? fmtDate(new Date(m.sent_at))
                            : fmtDate(new Date(m.created_at))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {active && (
                <SequenceBuilder
                  key={active.id}
                  campaignId={active.id}
                  initialSteps={(active.sequence_steps ?? []) as SequenceStep[]}
                  onSaved={(steps) => {
                    setCampaigns((cur) =>
                      cur.map((c) => (c.id === active.id ? { ...c, sequence_steps: steps } : c)),
                    );
                    onSaved?.();
                  }}
                />
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
