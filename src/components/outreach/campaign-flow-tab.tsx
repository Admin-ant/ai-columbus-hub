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
  Link2,
  Copy,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useServerFn } from "@tanstack/react-start";
import { askAssistant } from "@/lib/ai-assistant.functions";
import { scanWebsite, type WebsiteScanResult } from "@/lib/website-scan.functions";
import {
  createTrackingLink,
  listTrackingLinks,
  type TrackingLink,
} from "@/lib/tracking-links.functions";
import {
  createCampaignLead,
  listCampaignTasks,
  type CampaignFlowTask,
} from "@/lib/campaign-flow.functions";

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
  trackingToken?: string | null;
  trackingUrl?: string | null;
  clickCount?: number;
  lastVisitedAt?: string | null;
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

function normalizeUrl(u: string): string {
  const t = u.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export function CampaignFlowTab() {
  const ask = useServerFn(askAssistant);
  const scan = useServerFn(scanWebsite);
  const createLink = useServerFn(createTrackingLink);
  const listLinks = useServerFn(listTrackingLinks);
  const [refreshingStats, setRefreshingStats] = useState(false);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [scrape, setScrape] = useState<ScrapeResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
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

  // Reset scan wanneer de URL verandert.
  useEffect(() => {
    setScrape(null);
    setScanError(null);
  }, [website]);

  async function runScan(): Promise<ScrapeResult | null> {
    const url = normalizeUrl(website);
    if (!url) {
      toast.error("Vul eerst een website URL in");
      return null;
    }
    setScanning(true);
    setScanError(null);
    try {
      const result = await scan({ data: { url, company: company || undefined } });
      setScrape(result);
      toast.success("Website gescand");
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Scan mislukt";
      setScanError(msg);
      toast.error(msg);
      return null;
    } finally {
      setScanning(false);
    }
  }

  async function generateCampaign() {
    if (!name || !company || !email || !website) {
      toast.error("Vul alle velden in");
      return;
    }
    // Zorg dat we een verse scan hebben (of gebruik bestaande).
    let s = scrape;
    if (!s) {
      s = await runScan();
      if (!s) return;
    }
    setGenerating(true);
    try {
      const { reply } = await ask({
        data: {
          task: "generic",
          context: `Schrijf een korte, warme cold-outreach mail (max 130 woorden) in het Nederlands aan ${name} van ${company}. Verwerk subtiel dat ze actief zijn in ${s.industry} en gespecialiseerd zijn in ${s.specialisation}. Extra context over het bedrijf: ${s.summary}. Toon: ${s.tone}. Begin met een persoonlijke openingszin die refereert aan hun website (${website}). Sluit af met een concrete vraag voor een korte kennismaking. Geef ALLEEN de mailtekst terug, zonder onderwerpregel of markdown.`,
        },
      });
      const previewText = reply.trim();
      setPreview(previewText);
      const now = new Date().toISOString();
      const leadId = crypto.randomUUID();

      // Genereer unieke tracking-link voor deze lead
      let trackingToken: string | null = null;
      let trackingUrl: string | null = null;
      try {
        const link = await createLink({
          data: {
            leadRef: leadId,
            leadName: name,
            company,
            destinationUrl: normalizeUrl(website),
          },
        });
        trackingToken = link.token;
        trackingUrl = `${window.location.origin}/api/public/l/${link.token}`;
      } catch (err) {
        console.warn("Tracking link kon niet worden gemaakt", err);
      }

      const lead: FlowLead = {
        id: leadId,
        name,
        company,
        email,
        website: normalizeUrl(website),
        scrape: s,
        emailPreview: previewText,
        sentAt: now,
        clicked: false,
        stage: 2,
        createdAt: now,
        trackingToken,
        trackingUrl,
        clickCount: 0,
        lastVisitedAt: null,
      };
      setLeads((cur) => [lead, ...cur]);
      toast.success(
        trackingUrl
          ? "Campagne gestart · unieke landingslink aangemaakt"
          : "Campagne gestart (zonder tracking-link)",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI genereren mislukt";
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }

  async function refreshStats() {
    const refs = leads.map((l) => l.id).filter(Boolean);
    if (refs.length === 0) {
      toast.info("Geen leads om te verversen");
      return;
    }
    setRefreshingStats(true);
    try {
      const links = await listLinks({ data: { leadRefs: refs } });
      const byRef = new Map<string, TrackingLink>();
      for (const l of links) if (l.lead_ref) byRef.set(l.lead_ref, l);
      let newClicks = 0;
      setLeads((cur) =>
        cur.map((l) => {
          const match = byRef.get(l.id);
          if (!match) return l;
          const clicked = match.click_count > 0;
          if (clicked && !l.clicked) newClicks++;
          return {
            ...l,
            clickCount: match.click_count,
            lastVisitedAt: match.last_visited_at,
            clicked: l.clicked || clicked,
            stage: clicked ? 4 : l.stage,
          };
        }),
      );
      if (newClicks > 0) {
        // Maak automatisch bel-taken aan voor nieuwe klikkers
        setTasks((cur) => {
          const extra: FlowTask[] = [];
          for (const l of leads) {
            const match = byRef.get(l.id);
            if (match && match.click_count > 0 && !l.clicked) {
              extra.push({
                id: crypto.randomUUID(),
                leadName: l.name,
                company: l.company,
                action: "call",
                reason: "Heeft landingspagina bezocht",
                createdAt: new Date().toISOString(),
                done: false,
              });
            }
          }
          return [...extra, ...cur];
        });
        toast.success(`${newClicks} nieuwe kliks gedetecteerd`);
      } else {
        toast.info("Stats bijgewerkt · geen nieuwe kliks");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verversen mislukt");
    } finally {
      setRefreshingStats(false);
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
          <div className="mt-4 rounded-md border border-brand/30 bg-brand/5 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
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
            {scrape.summary && (
              <p className="mt-2 text-muted-foreground italic">{scrape.summary}</p>
            )}
          </div>
        )}

        {scanError && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {scanError}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={runScan}
            disabled={scanning || !website.trim()}
          >
            {scanning ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Globe className="mr-2 h-4 w-4" />
            )}
            {scanning ? "Scannen…" : scrape ? "Opnieuw scannen" : "Scan website"}
          </Button>
          <Button
            onClick={generateCampaign}
            disabled={generating || scanning}
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
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Leads in flow ({leads.length})
          </h3>
          {leads.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={refreshStats}
              disabled={refreshingStats}
            >
              {refreshingStats ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              Ververs klikstats
            </Button>
          )}
        </div>
        {leads.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nog geen leads. Start hierboven een campagne.
          </p>
        ) : (
          <div className="space-y-2">
            {leads.map((l) => (
              <div
                key={l.id}
                className="flex flex-col gap-2 rounded-md border border-border bg-background/50 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{l.name}</span>
                      <span className="text-xs text-muted-foreground">· {l.company}</span>
                      {l.clicked && (
                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
                          Geklikt
                        </Badge>
                      )}
                      {(l.clickCount ?? 0) > 0 && (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px]">
                          {l.clickCount}× bezocht
                        </Badge>
                      )}
                      <Badge variant="outline" className="border-border text-[10px]">
                        Stap {l.stage}/4
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{l.email} · {l.website}</div>
                    {l.lastVisitedAt && (
                      <div className="text-[10px] text-muted-foreground/80">
                        Laatst bezocht: {new Date(l.lastVisitedAt).toLocaleString("nl-NL")}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                {l.trackingUrl && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-brand/5 p-2 text-xs">
                    <Link2 className="h-3 w-3 text-brand" />
                    <span className="text-muted-foreground">Unieke landingslink:</span>
                    <code className="truncate max-w-[320px] text-brand">{l.trackingUrl}</code>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2"
                      onClick={() => {
                        navigator.clipboard.writeText(l.trackingUrl!);
                        toast.success("Link gekopieerd");
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <a
                      href={l.trackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand underline text-[10px]"
                    >
                      Test klik ↗
                    </a>
                  </div>
                )}
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
