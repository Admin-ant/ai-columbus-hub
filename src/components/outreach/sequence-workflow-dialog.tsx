import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, PlayCircle, Workflow } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { scheduleSequence } from "@/lib/outreach.functions";
import { SequenceBuilder, type SequenceStep } from "@/components/outreach/sequence-builder";
import { SequenceFlowDiagram } from "@/components/outreach/sequence-flow-diagram";

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

  const active = useMemo(
    () => campaigns.find((c) => c.id === selectedId) ?? null,
    [campaigns, selectedId],
  );

  async function startForTarget() {
    if (!target) return;
    if (!selectedId) return toast.error("Kies eerst een campagne");
    setStarting(true);
    try {
      // Als het doel nog niet aan deze campagne hangt: koppelen.
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
                  <Button
                    onClick={startForTarget}
                    disabled={starting || !selectedId}
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
                )}
              </div>

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
