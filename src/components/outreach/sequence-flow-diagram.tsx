import { Mail, Clock, MessageSquare, Bot, PhoneCall, ArrowRight, Zap, GitBranch } from "lucide-react";

/**
 * Visuele workflow-diagram van de automatische outreach sequence.
 * Puur presentatie — de daadwerkelijke logica draait in de cron hook
 * (`/api/public/hooks/outreach-sequence`) en reply-classifier.
 */
export function SequenceFlowDiagram({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`rounded-lg border border-border bg-muted/30 ${compact ? "p-3" : "p-4"}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-brand" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Automatische flow
        </span>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-0">
        {/* Trigger */}
        <FlowNode
          icon={Zap}
          title="Trigger"
          subtitle="Prospect komt in 'Nieuw' of 'Aangeschreven'"
          tone="slate"
        />
        <FlowArrow />

        {/* Step 1 */}
        <FlowNode
          icon={Mail}
          title="Stap 1 · Dag 1"
          subtitle="Verstuur mail template → verplaats naar 'Aangeschreven'"
          tone="blue"
        />
        <FlowArrow />

        {/* Wait */}
        <FlowNode
          icon={Clock}
          title="Stap 2"
          subtitle="Wacht 3 dagen op reactie"
          tone="amber"
        />
        <FlowArrow />

        {/* Branch */}
        <div className="flex flex-1 flex-col gap-2">
          <FlowNode
            icon={MessageSquare}
            title="Als reactie"
            subtitle="→ 'Reactie' + AI-melding via Columbus"
            tone="emerald"
            branch="if"
            extraIcon={Bot}
          />
          <FlowNode
            icon={PhoneCall}
            title="Als geen reactie"
            subtitle="Follow-up mail óf bel/WhatsApp-taak voor recruiter"
            tone="rose"
            branch="else"
          />
        </div>
      </div>

      {!compact && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          De flow draait automatisch zodra een prospect op <em>Nieuw</em> of{" "}
          <em>Aangeschreven</em> staat en een campagne met sequentie is gekoppeld. Verzendtijden
          respecteren het campagne-tijdvenster en stoppen bij een reactie.
        </p>
      )}
    </div>
  );
}

type Tone = "slate" | "blue" | "amber" | "emerald" | "rose";
const TONE: Record<Tone, { border: string; bg: string; text: string; icon: string }> = {
  slate: {
    border: "border-slate-500/40",
    bg: "bg-slate-500/10",
    text: "text-slate-100",
    icon: "text-slate-300",
  },
  blue: {
    border: "border-blue-500/40",
    bg: "bg-blue-500/10",
    text: "text-blue-100",
    icon: "text-blue-300",
  },
  amber: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/10",
    text: "text-amber-100",
    icon: "text-amber-300",
  },
  emerald: {
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/10",
    text: "text-emerald-100",
    icon: "text-emerald-300",
  },
  rose: {
    border: "border-rose-500/40",
    bg: "bg-rose-500/10",
    text: "text-rose-100",
    icon: "text-rose-300",
  },
};

function FlowNode({
  icon: Icon,
  title,
  subtitle,
  tone,
  branch,
  extraIcon: ExtraIcon,
}: {
  icon: typeof Mail;
  title: string;
  subtitle: string;
  tone: Tone;
  branch?: "if" | "else";
  extraIcon?: typeof Mail;
}) {
  const t = TONE[tone];
  return (
    <div
      className={`relative flex-1 rounded-md border ${t.border} ${t.bg} p-2.5 min-w-0`}
    >
      {branch && (
        <span
          className={`absolute -top-2 left-2 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
            branch === "if"
              ? "bg-emerald-500/30 text-emerald-100"
              : "bg-rose-500/30 text-rose-100"
          }`}
        >
          {branch === "if" ? "IF" : "ELSE"}
        </span>
      )}
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${t.icon}`} />
        <span className={`text-[11px] font-semibold ${t.text}`}>{title}</span>
        {ExtraIcon && <ExtraIcon className={`ml-auto h-3 w-3 ${t.icon}`} />}
      </div>
      <div className="mt-1 text-[10px] leading-snug text-muted-foreground">{subtitle}</div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex items-center justify-center px-1 py-1 lg:py-0">
      <ArrowRight className="h-3.5 w-3.5 rotate-90 text-muted-foreground lg:rotate-0" />
    </div>
  );
}
