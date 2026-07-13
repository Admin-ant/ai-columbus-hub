import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Wand2,
  FileSignature,
  Receipt,
  ClipboardList,
  Inbox,
  Loader2,
  RefreshCcw,
  ExternalLink,
} from "lucide-react";

import { useWorkspace } from "@/hooks/use-workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listSalesPipeline,
  upsertRequirements,
  aiDraftRequirements,
  generateQuoteFromRequirements,
  type PipelineLead,
} from "@/lib/sales-workflow.functions";

export const Route = createFileRoute("/_authenticated/sales-workflow")({
  head: () => ({
    meta: [
      { title: "Sales Workflow — AI-Q Cloud" },
      {
        name: "description",
        content:
          "End-to-end verkoopproces: leads, klantwensen, offertes, ondertekening en facturatie.",
      },
    ],
  }),
  component: SalesWorkflowPage,
});

type StageKey = "lead" | "requirements" | "quote" | "signed" | "invoiced" | "won" | "lost";

const WON_STAGES = new Set(["klant", "gewonnen", "ai_columbus"]);

function stageOf(l: PipelineLead): StageKey {
  if (l.stage === "verloren") return "lost";
  if (l.invoice_count > 0 || l.contract) return "invoiced";
  if (l.quote?.signed_at) return "signed";
  if (WON_STAGES.has(l.stage) && !l.contract) return "won";
  if (l.quote) return "quote";
  if (l.requirements) return "requirements";
  return "lead";
}

const eur = (cents: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);

function SalesWorkflowPage() {
  const { currentOrganizationId } = useWorkspace();
  const listFn = useServerFn(listSalesPipeline);
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["sales-workflow", currentOrganizationId],
    queryFn: () =>
      currentOrganizationId
        ? listFn({ data: { organizationId: currentOrganizationId } })
        : Promise.resolve([]),
    enabled: !!currentOrganizationId,
  });

  const [editing, setEditing] = useState<PipelineLead | null>(null);

  const rows = data ?? [];

  const kpis = useMemo(() => {
    const counts: Record<StageKey, number> = {
      lead: 0,
      requirements: 0,
      quote: 0,
      signed: 0,
      invoiced: 0,
      won: 0,
      lost: 0,
    };
    let mrrCents = 0;
    let pipelineMonthlyCents = 0;
    for (const r of rows) {
      counts[stageOf(r)]++;
      if (r.contract && r.contract.status === "active") {
        mrrCents += Number(r.contract.monthly_amount_cents ?? 0);
      }
      if (r.requirements) pipelineMonthlyCents += r.requirements.recurring_cents;
    }
    return { counts, mrrCents, pipelineMonthlyCents };
  }, [rows]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales Workflow</h1>
          <p className="text-sm text-muted-foreground">
            Van lead tot terugkerende factuur — alles op één plek.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
          Verversen
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        <KpiCard icon={Inbox} label="Leads" value={kpis.counts.lead} />
        <KpiCard icon={ClipboardList} label="Klantwensen" value={kpis.counts.requirements} />
        <KpiCard icon={Wand2} label="Offerte" value={kpis.counts.quote} />
        <KpiCard icon={FileSignature} label="Ondertekend" value={kpis.counts.signed} />
        <KpiCard icon={Receipt} label="Gewonnen" value={kpis.counts.won} />
        <KpiCard icon={Receipt} label="Klant" value={kpis.counts.invoiced} />
        <KpiCard icon={Inbox} label="Verloren" value={kpis.counts.lost} />
        <KpiCard
          icon={Receipt}
          label="Actieve MRR"
          value={eur(kpis.mrrCents)}
          tone="accent"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nog geen leads. Ga naar <Link to="/leads" className="underline">Leads</Link> om er een aan te maken.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Fase</TableHead>
                    <TableHead>Klantwensen</TableHead>
                    <TableHead>Offerte</TableHead>
                    <TableHead>Contract / Facturen</TableHead>
                    <TableHead className="text-right">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <PipelineRow
                      key={r.id}
                      row={r}
                      onEdit={() => setEditing(r)}
                      onChanged={() => qc.invalidateQueries({ queryKey: ["sales-workflow"] })}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {editing && currentOrganizationId && (
        <RequirementsDialog
          lead={editing}
          organizationId={currentOrganizationId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["sales-workflow"] });
          }}
        />
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Inbox;
  label: string;
  value: string | number;
  tone?: "accent";
}) {
  return (
    <Card className={tone === "accent" ? "border-primary/40 bg-primary/5" : ""}>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <div>
          <div className="text-xs uppercase text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function stageBadge(s: StageKey) {
  const map: Record<StageKey, { label: string; variant: "default" | "secondary" | "outline" }> = {
    lead: { label: "Nieuwe lead", variant: "outline" },
    requirements: { label: "Klantwensen", variant: "secondary" },
    quote: { label: "Offerte", variant: "secondary" },
    signed: { label: "Ondertekend", variant: "default" },
    invoiced: { label: "Klant", variant: "default" },
    won: { label: "Gewonnen", variant: "default" },
    lost: { label: "Verloren", variant: "outline" },
  };
  const cfg = map[s];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function PipelineRow({
  row,
  onEdit,
  onChanged,
}: {
  row: PipelineLead;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const stage = stageOf(row);



  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{row.company ?? row.name}</div>
        <div className="text-xs text-muted-foreground">{row.email ?? "—"}</div>
      </TableCell>
      <TableCell>{stageBadge(stage)}</TableCell>
      <TableCell>
        {row.requirements ? (
          <div className="text-xs">
            <div>Eenmalig: {eur(row.requirements.one_time_cents)}</div>
            <div>Maand: {eur(row.requirements.recurring_cents)}</div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {row.quote ? (
          <div className="text-xs">
            <div className="font-medium">{row.quote.title}</div>
            <div className="text-muted-foreground">
              €{Number(row.quote.total_amount).toFixed(2)} · {row.quote.status}
            </div>
            <a
              className="mt-1 inline-flex items-center gap-1 text-primary underline"
              href={`/accept/quote/${row.quote.public_token}`}
              target="_blank"
              rel="noreferrer"
            >
              Publieke link <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {row.contract ? (
          <div className="text-xs">
            <div>MRR: {eur(row.contract.monthly_amount_cents)}</div>
            <div>Facturen: {row.invoice_count}</div>
            {row.contract.next_invoice_date && (
              <div className="text-muted-foreground">
                Volgende: {new Date(row.contract.next_invoice_date).toLocaleDateString("nl-NL")}
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            {row.requirements ? "Klantwensen bewerken" : "Klantwensen"}
          </Button>
          {!row.quote && row.requirements && (
            <GenerateButton row={row} onDone={onChanged} />
          )}
          {row.contract && (
            <Button asChild size="sm" variant="ghost">
              <Link to="/invoices">
                Facturen <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          )}
          {row.contract?.project_id && (
            <Button asChild size="sm" variant="outline">
              <Link to="/ai-columbus/projecten/$projectId" params={{ projectId: row.contract.project_id }}>
                Naar project <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function GenerateButton({
  row,
  onDone,
  disabled,
}: {
  row: PipelineLead;
  onDone: () => void;
  disabled?: boolean;
}) {
  const { currentOrganizationId } = useWorkspace();
  const generate = useServerFn(generateQuoteFromRequirements);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      disabled={busy || disabled || !currentOrganizationId}
      onClick={async () => {
        if (!currentOrganizationId) return;
        try {
          setBusy(true);
          await generate({
            data: { leadId: row.id, organizationId: currentOrganizationId },
          });
          toast.success("Offerte-concept aangemaakt");
          onDone();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Kon offerte niet maken");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 h-3 w-3" />}
      Offerte genereren
    </Button>
  );
}

function RequirementsDialog({
  lead,
  organizationId,
  onClose,
  onSaved,
}: {
  lead: PipelineLead;
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const upsert = useServerFn(upsertRequirements);
  const aiDraft = useServerFn(aiDraftRequirements);

  const [scope, setScope] = useState(lead.requirements?.scope ?? "");
  const [oneTime, setOneTime] = useState(
    lead.requirements ? (lead.requirements.one_time_cents / 100).toString() : "",
  );
  const [recurring, setRecurring] = useState(
    lead.requirements ? (lead.requirements.recurring_cents / 100).toString() : "",
  );
  const [notes, setNotes] = useState(lead.requirements?.notes ?? "");

  const saveMut = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          leadId: lead.id,
          organizationId,
          scope,
          oneTimeCents: Math.round(Number(oneTime || 0) * 100),
          recurringCents: Math.round(Number(recurring || 0) * 100),
          currency: "EUR",
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Klantwensen opgeslagen");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Kon niet opslaan"),
  });

  const aiMut = useMutation({
    mutationFn: () => aiDraft({ data: { leadId: lead.id } }),
    onSuccess: (r) => {
      setScope(r.scope);
      setOneTime((r.oneTimeCents / 100).toString());
      setRecurring((r.recurringCents / 100).toString());
      if (r.notes) setNotes(r.notes);
      toast.success("Concept gegenereerd — controleer en pas aan.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "AI-fout"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Klantwensen — {lead.company ?? lead.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => aiMut.mutate()} disabled={aiMut.isPending}>
              {aiMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              AI: vul in vanuit lead
            </Button>
          </div>
          <div>
            <Label htmlFor="scope">Project scope</Label>
            <Textarea
              id="scope"
              rows={7}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder={"- Website in WordPress\n- SEO basis\n- Hosting eerste jaar"}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="onetime">Eenmalige kosten (€)</Label>
              <Input
                id="onetime"
                type="number"
                min={0}
                step="0.01"
                value={oneTime}
                onChange={(e) => setOneTime(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="recurring">Maandelijkse kosten (€)</Label>
              <Input
                id="recurring"
                type="number"
                min={0}
                step="0.01"
                value={recurring}
                onChange={(e) => setRecurring(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="notes">Notities</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annuleren
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
