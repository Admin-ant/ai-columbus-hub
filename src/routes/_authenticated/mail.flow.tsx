import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Mail,
  MessageCircle,
  CalendarDays,
  FileSignature,
  Receipt,
  UserPlus,
  Inbox,
  Send,
  Workflow,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/mail/flow")({
  head: () => ({ meta: [{ title: "Hoe werkt de mail-flow?" }] }),
  component: MailFlowPage,
});

type FlowNode = {
  title: string;
  description: string;
  module: "Outreach" | "Mail" | "Offerte Studio" | "Gebruikers" | "Agenda";
  editHref: string;
  editLabel: string;
  icon: typeof Mail;
  tone: "brand" | "green" | "amber" | "purple" | "sky";
};

const TONE: Record<FlowNode["tone"], string> = {
  brand: "border-primary/40 bg-primary/5 text-primary",
  green: "border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400",
  amber: "border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400",
  purple: "border-violet-500/40 bg-violet-500/5 text-violet-600 dark:text-violet-400",
  sky: "border-sky-500/40 bg-sky-500/5 text-sky-600 dark:text-sky-400",
};

const STAGES: { title: string; steps: FlowNode[] }[] = [
  {
    title: "1. Prospect → Eerste contact",
    steps: [
      {
        title: "Lead binnen",
        description:
          "Automatisch via het formulier, importer of handmatig toegevoegd in Cold Outreach.",
        module: "Outreach",
        editHref: "/leads",
        editLabel: "Bekijk leads",
        icon: Inbox,
        tone: "sky",
      },
      {
        title: "Outreach mail 1 (dag 0)",
        description:
          "Eerste sjabloon uit de sequence — standaard 'Recruitment — Email (provincie)'. Tokens {{contact_name}}, {{company}}, {{province}} worden per lead ingevuld.",
        module: "Outreach",
        editHref: "/outreach/templates",
        editLabel: "Bewerk outreach sjabloon",
        icon: Send,
        tone: "brand",
      },
      {
        title: "Follow-up mails (dag 3, 7, 14)",
        description:
          "Vervolgstappen uit de sequence — draaien alleen als er geen reply/click is. Beheer via 'Sequence workflow' in Cold Outreach.",
        module: "Outreach",
        editHref: "/outreach/templates",
        editLabel: "Bewerk follow-ups",
        icon: Mail,
        tone: "amber",
      },
    ],
  },
  {
    title: "2. Reply → Afspraak",
    steps: [
      {
        title: "Reply ontvangen",
        description:
          "Landt in Mail-inbox. Kan handmatig beantwoord worden met een sjabloon uit 'Mail templates'.",
        module: "Mail",
        editHref: "/mail",
        editLabel: "Open mail-inbox",
        icon: MessageCircle,
        tone: "green",
      },
      {
        title: "Afspraakbevestiging",
        description:
          "Wanneer een prospect een afspraak boekt via de publieke agenda, gaat er automatisch een bevestigingsmail uit met datum, tijd en link.",
        module: "Agenda",
        editHref: "/mail/templates",
        editLabel: "Bewerk mail sjabloon",
        icon: CalendarDays,
        tone: "sky",
      },
    ],
  },
  {
    title: "3. Offerte → Getekend",
    steps: [
      {
        title: "Offerte verstuurd",
        description:
          "Vanuit Offerte Studio wordt een e-mail met de public link naar de klant gestuurd. Sjabloon wordt gerenderd met {{sender_name}}, klantnaam en bedrag.",
        module: "Offerte Studio",
        editHref: "/offerte-studio",
        editLabel: "Open Offerte Studio",
        icon: FileSignature,
        tone: "purple",
      },
      {
        title: "Quote follow-up (dag 3 & 7)",
        description:
          "Cron-taak stuurt automatisch een herinnering wanneer een offerte niet bekeken of nog niet ondertekend is.",
        module: "Offerte Studio",
        editHref: "/mail/templates",
        editLabel: "Bewerk herinnering",
        icon: Mail,
        tone: "amber",
      },
      {
        title: "Offerte getekend → factuur",
        description:
          "Na tekenen wordt automatisch een klant, contract en (indien setup fee) eerste factuur aangemaakt.",
        module: "Offerte Studio",
        editHref: "/invoices",
        editLabel: "Bekijk facturen",
        icon: Receipt,
        tone: "green",
      },
    ],
  },
  {
    title: "4. Gebruiker uitgenodigd",
    steps: [
      {
        title: "Welkomstmail nieuwe gebruiker",
        description:
          "Bij het aanmaken van een gebruikersaccount wordt een welkomstmail met tijdelijk wachtwoord en reset-link gestuurd. Onderwerp en tekst zijn per organisatie aanpasbaar.",
        module: "Gebruikers",
        editHref: "/gebruikers",
        editLabel: "Bewerk welkomstmail",
        icon: UserPlus,
        tone: "brand",
      },
    ],
  },
];

function StepCard({ step }: { step: FlowNode }) {
  const Icon = step.icon;
  return (
    <div className={`rounded-lg border p-3 shadow-sm ${TONE[step.tone]}`}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-foreground">{step.title}</div>
            <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              {step.module}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
          <Link
            to={step.editHref}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {step.editLabel} <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function MailFlowPage() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-6xl space-y-6 p-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Workflow className="h-6 w-6 text-brand" />
            Hoe werkt de mail-flow?
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Overzicht van alle geautomatiseerde mailmomenten — van eerste outreach tot
            welkomstmail. Klik op een stap om het bijbehorende sjabloon aan te passen.
          </p>
        </div>

        <div className="space-y-6">
          {STAGES.map((stage) => (
            <section key={stage.title} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {stage.title}
              </h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {stage.steps.map((s) => (
                  <StepCard key={s.title} step={s} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="rounded-lg border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
          <div className="mb-1 font-medium text-foreground">Tip — templates delen tussen modules</div>
          Outreach- en algemene mailsjablonen delen dezelfde bibliotheek. Wat je in
          <Link to="/outreach/templates" className="mx-1 text-primary hover:underline">
            /outreach/templates
          </Link>
          aanmaakt, is ook zichtbaar in
          <Link to="/mail/templates" className="mx-1 text-primary hover:underline">
            /mail/templates
          </Link>
          en beschikbaar in het mail-dialoog bij een factuur of offerte.
        </div>
      </div>
    </div>
  );
}
