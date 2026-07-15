import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Zap,
  Globe,
  Mail,
  Clock,
  MousePointerClick,
  PhoneCall,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Loader2,
  Trash2,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useServerFn } from "@tanstack/react-start";
import { askAssistant } from "@/lib/ai-assistant.functions";
import { scanWebsite, type WebsiteScanResult } from "@/lib/website-scan.functions";

type ScrapeResult = WebsiteScanResult;

type FlowTask = {
  id: string;
  leadName: string;
  company: string;
  action: "call" | "followup";
  reason: string;
  createdAt: string;
  done: boolean;
};

type FlowLead = {
  id: string;
  name: string;
  company: string;
  email: string;
  website: string;
  scrape: ScrapeResult | null;
  emailPreview: string;
  sentAt: string | null;
  clicked: boolean;
  stage: 1 | 2 | 3 | 4;
  createdAt: string;
};

const LS_LEADS = "campaign-flow-leads";
const LS_TASKS = "campaign-flow-tasks";

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Lichte mock om branche/tone uit een URL af te leiden zonder externe API. */
function mockScrape(url: string, company: string): ScrapeResult {
  const host = url.replace(/https?:\/\//, "").replace(/\/.*/, "").toLowerCase();
  const hint = `${host} ${company}`.toLowerCase();
  let industry = "uitzendbureau";
  if (/tech|it|software|dev/.test(hint)) industry = "tech & IT staffing";
  else if (/zorg|care|medisch|health/.test(hint)) industry = "zorg";
  else if (/bouw|construct/.test(hint)) industry = "bouw & techniek";
  else if (/logistiek|transport|warehouse/.test(hint)) industry = "logistiek";
  else if (/horeca|hospitality/.test(hint)) industry = "horeca";
  return {
    industry,
    specialisation: `${industry} met focus op flexibele plaatsingen`,
    tone: "professioneel, warm en oplossingsgericht",
  };
}

export function CampaignFlowTab() {
  const ask = useServerFn(askAssistant);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [scrape, setScrape] = useState<ScrapeResult | null>(null);
  const [preview, setPreview] = useState("");
  const [generating, setGenerating] = useState(false);

  const [leads, setLeads] = useState<FlowLead[]>(() => loadLS<FlowLead[]>(LS_LEADS, []));
  const [tasks, setTasks] = useState<FlowTask[]>(() => loadLS<FlowTask[]>(LS_TASKS, []));

  useEffect(() => {
    localStorage.setItem(LS_LEADS, JSON.stringify(leads));
  }, [leads]);
  useEffect(() => {
    localStorage.setItem(LS_TASKS, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    if (!website.trim()) {
      setScrape(null);
      return;
    }
    const t = setTimeout(() => setScrape(mockScrape(website, company)), 400);
    return () => clearTimeout(t);
  }, [website, company]);

  async function generateCampaign() {
    if (!name || !company || !email || !website) {
      toast.error("Vul alle velden in");
      return;
    }
    const s = scrape ?? mockScrape(website, company);
    setScrape(s);
    setGenerating(true);
    try {
      const { reply } = await ask({
        data: {
          task: "generic",
          context: `Schrijf een korte, warme cold-outreach mail (max 130 woorden) in het Nederlands aan ${name} van ${company}. Verwerk subtiel dat ze actief zijn in ${s.industry} en gespecialiseerd zijn in ${s.specialisation}. Toon: ${s.tone}. Begin met een persoonlijke openingszin die refereert aan hun website (${website}). Sluit af met een concrete vraag voor een korte kennismaking. Geef ALLEEN de mailtekst terug, zonder onderwerpregel of markdown.`,
        },
      });
      const previewText = reply.trim();
      setPreview(previewText);
      const now = new Date().toISOString();
      const lead: FlowLead = {
        id: crypto.randomUUID(),
        name,
        company,
        email,
        website,
        scrape: s,
        emailPreview: previewText,
        sentAt: now,
        clicked: false,
        stage: 2,
        createdAt: now,
      };
      setLeads((cur) => [lead, ...cur]);
      toast.success("Campagne gestart & mail verstuurd (mock)");
    } catch (e) {
      // Fallback zonder AI
      const fallback = `Hi ${name},\n\nIk zag op ${website} dat jullie bij ${company} gespecialiseerd zijn in ${s.specialisation}. Mooi hoe jullie ${s.industry} aanpakken.\n\nWij helpen uitzendbureaus zoals jullie om intakes en plaatsingen te versnellen met AI. Kan ik komende week 15 minuten inplannen om te laten zien wat dat concreet oplevert?\n\nGroet,`;
      setPreview(fallback);
      const now = new Date().toISOString();
      const lead: FlowLead = {
        id: crypto.randomUUID(),
        name,
        company,
        email,
        website,
        scrape: s,
        emailPreview: fallback,
        sentAt: now,
        clicked: false,
        stage: 2,
        createdAt: now,
      };
      setLeads((cur) => [lead, ...cur]);
      toast.warning("AI niet beschikbaar — fallback template gebruikt");
    } finally {
      setGenerating(false);
    }
  }

  function simulateClick(lead: FlowLead) {
    setLeads((cur) =>
      cur.map((l) => (l.id === lead.id ? { ...l, clicked: true, stage: 4 } : l)),
    );
    const task: FlowTask = {
      id: crypto.randomUUID(),
      leadName: lead.name,
      company: lead.company,
      action: "call",
      reason: "Heeft landingspagina bezocht",
      createdAt: new Date().toISOString(),
      done: false,
    };
    setTasks((cur) => [task, ...cur]);
    toast.success(`Taak aangemaakt: Bel ${lead.name}`);
  }

  function simulateNoResponse(lead: FlowLead) {
    setLeads((cur) => cur.map((l) => (l.id === lead.id ? { ...l, stage: 4 } : l)));
    const task: FlowTask = {
      id: crypto.randomUUID(),
      leadName: lead.name,
      company: lead.company,
      action: "followup",
      reason: "Geen reactie na 3 dagen",
      createdAt: new Date().toISOString(),
      done: false,
    };
    setTasks((cur) => [task, ...cur]);
    toast.info(`Opvolgtaak aangemaakt voor ${lead.company}`);
  }

  const openTasks = useMemo(() => tasks.filter((t) => !t.done), [tasks]);

  return (
    <div className="space-y-6">
      {/* Timeline */}
      <FlowTimeline />

      {/* Nieuwe campagne starten */}
      <div className="rounded-lg border border-border bg-muted/30 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Rocket className="h-5 w-5 text-brand" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Nieuwe campagne starten
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground">Naam contactpersoon</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jan de Vries" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Bedrijfsnaam</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="FlexPro Uitzendbureau" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">E-mailadres</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jan@flexpro.nl" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Website URL</Label>
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://flexpro.nl" />
          </div>
        </div>

        {scrape && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-brand/5 p-3 text-xs">
            <Globe className="h-4 w-4 text-brand" />
            <span className="text-muted-foreground">Website scan:</span>
            <Badge variant="outline" className="border-brand/40 text-brand">
              {scrape.industry}
            </Badge>
            <Badge variant="outline" className="border-border">
              {scrape.specialisation}
            </Badge>
            <Badge variant="outline" className="border-border">
              tone: {scrape.tone}
            </Badge>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={generateCampaign}
            disabled={generating}
            className="bg-brand text-white hover:bg-brand/90"
          >
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {generating ? "Genereren…" : "Genereer Gepersonaliseerde Campagne"}
          </Button>
        </div>

        {preview && (
          <div className="mt-5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              E-mail concept (preview)
            </Label>
            <Textarea
              value={preview}
              onChange={(e) => setPreview(e.target.value)}
              rows={10}
              className="mt-1 font-mono text-xs"
            />
          </div>
        )}
      </div>

      {/* Actieve leads in flow */}
      <div className="rounded-lg border border-border bg-muted/30 p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Leads in flow ({leads.length})
        </h3>
        {leads.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nog geen leads. Start hierboven een campagne.
          </p>
        ) : (
          <div className="space-y-2">
            {leads.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/50 p-3"
              >
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{l.name}</span>
                    <span className="text-xs text-muted-foreground">· {l.company}</span>
                    {l.clicked && (
                      <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
                        Geklikt
                      </Badge>
                    )}
                    <Badge variant="outline" className="border-border text-[10px]">
                      Stap {l.stage}/4
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{l.email} · {l.website}</div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => simulateClick(l)}
                    disabled={l.clicked}
                  >
                    <MousePointerClick className="mr-1 h-3 w-3" />
                    Sim. klik
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => simulateNoResponse(l)}>
                    <Clock className="mr-1 h-3 w-3" />
                    Sim. geen reactie
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setLeads((cur) => cur.filter((x) => x.id !== l.id))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Taken & Acties */}
      <div className="rounded-lg border border-border bg-muted/30 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Taken & Acties ({openTasks.length} open)
          </h3>
          {tasks.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm("Alle taken wissen?")) setTasks([]);
              }}
            >
              Wis alles
            </Button>
          )}
        </div>
        {tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Geen openstaande taken. Taken verschijnen automatisch zodra leads statuswijzigingen doorlopen.
          </p>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-3 rounded-md border p-3 transition-all ${
                  t.done
                    ? "border-border/50 bg-background/30 opacity-60"
                    : t.action === "call"
                      ? "border-emerald-500/40 bg-emerald-500/5"
                      : "border-amber-500/40 bg-amber-500/5"
                }`}
              >
                <div className="flex items-center gap-3">
                  {t.action === "call" ? (
                    <PhoneCall className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Mail className="h-4 w-4 text-amber-400" />
                  )}
                  <div>
                    <div className="text-sm font-medium">
                      {t.action === "call"
                        ? `Bel ${t.leadName} van ${t.company}`
                        : `Stuur opvolgmail naar ${t.leadName} van ${t.company}`}
                    </div>
                    <div className="text-xs text-muted-foreground">{t.reason}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setTasks((cur) =>
                        cur.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)),
                      )
                    }
                  >
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    {t.done ? "Heropen" : "Klaar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setTasks((cur) => cur.filter((x) => x.id !== t.id))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FlowTimeline() {
  const steps = [
    {
      icon: Zap,
      title: "Stap 1",
      subtitle: "Lead toegevoegd",
      detail: "Website wordt gescand op branche & tone",
      tone: "slate",
    },
    {
      icon: Mail,
      title: "Stap 2",
      subtitle: "Gepersonaliseerde mail",
      detail: "AI genereert & verstuurt binnen 24 uur",
      tone: "blue",
    },
    {
      icon: Clock,
      title: "Stap 3",
      subtitle: "Wacht 3 dagen",
      detail: "Monitor kliks naar landingspagina",
      tone: "amber",
    },
    {
      icon: PhoneCall,
      title: "Stap 4",
      subtitle: "Automatische taak",
      detail: "Bellen bij klik · opvolgmail bij stilte",
      tone: "emerald",
    },
  ] as const;

  const toneClass = {
    slate: "border-slate-500/40 bg-slate-500/10 text-slate-300",
    blue: "border-blue-500/40 bg-blue-500/10 text-blue-300",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-5">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Campagne Flow Overzicht
      </h3>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-0">
        {steps.map((s, i) => (
          <div key={s.title} className="flex flex-1 items-stretch lg:flex-row">
            <div
              className={`flex flex-1 flex-col rounded-lg border p-3 transition-all hover:scale-[1.02] ${toneClass[s.tone]}`}
            >
              <div className="flex items-center gap-2">
                <s.icon className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                  {s.title}
                </span>
              </div>
              <div className="mt-1 text-sm font-semibold">{s.subtitle}</div>
              <div className="mt-1 text-[11px] opacity-80">{s.detail}</div>
            </div>
            {i < steps.length - 1 && (
              <div className="flex items-center justify-center px-2">
                <ArrowRight className="h-4 w-4 rotate-90 text-muted-foreground lg:rotate-0" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
