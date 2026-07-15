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
  History,
  Play,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  XCircle,
  RotateCcw,
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
  updateCampaignTask,
  listCampaignTaskEvents,
  type CampaignFlowTask,
  type CampaignTaskEvent,
} from "@/lib/campaign-flow.functions";

type ScrapeResult = WebsiteScanResult;

type TaskStatus = "pending" | "in_progress" | "done" | "failed" | "cancelled";

type FlowTask = {
  id: string;
  serverId?: string | null;
  leadName: string;
  company: string;
  action: "call" | "followup";
  reason: string;
  createdAt: string;
  done: boolean;
  status: TaskStatus;
  result?: string | null;
  error?: string | null;
  startedAt?: string | null;
  doneAt?: string | null;
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
  serverLeadId?: string | null;
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

function validateWebsiteUrl(raw: string): { url: string; error: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { url: "", error: "Vul een website URL in." };
  if (trimmed.length > 2048) return { url: "", error: "URL is te lang." };
  if (/\s/.test(trimmed)) return { url: "", error: "URL mag geen spaties bevatten." };
  const withProto = normalizeUrl(trimmed);
  let parsed: URL;
  try {
    parsed = new URL(withProto);
  } catch {
    return { url: "", error: "Dit is geen geldige URL. Voorbeeld: https://voorbeeld.nl" };
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return { url: "", error: "Alleen http:// of https:// URLs worden ondersteund." };
  }
  const host = parsed.hostname.toLowerCase();
  if (!host.includes(".")) {
    return { url: "", error: "Vul een volledig domein in, bijv. voorbeeld.nl" };
  }
  if (host === "localhost" || host.endsWith(".local")) {
    return { url: "", error: "Lokale adressen kunnen niet worden gescand." };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return { url: "", error: "IP-adressen worden niet ondersteund; gebruik een domeinnaam." };
  }
  const tld = host.split(".").pop() ?? "";
  if (tld.length < 2 || !/^[a-z]{2,}$/i.test(tld)) {
    return { url: "", error: "De domeinextensie lijkt ongeldig." };
  }
  return { url: parsed.toString().replace(/\/$/, ""), error: null };
}

export function CampaignFlowTab() {
  const ask = useServerFn(askAssistant);
  const scan = useServerFn(scanWebsite);
  const createLink = useServerFn(createTrackingLink);
  const listLinks = useServerFn(listTrackingLinks);
  const createServerLead = useServerFn(createCampaignLead);
  const fetchServerTasks = useServerFn(listCampaignTasks);
  const [refreshingStats, setRefreshingStats] = useState(false);
  const [runningAutomation, setRunningAutomation] = useState(false);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [scrape, setScrape] = useState<ScrapeResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanAttempts, setScanAttempts] = useState(0);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [preview, setPreview] = useState("");
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<
    { label: string; angle: string; body: string }[]
  >([]);
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);
  const [launching, setLaunching] = useState(false);

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
    setVariants([]);
    setSelectedVariant(null);
    setPreview("");
  }, [website]);

  const websiteValidation = validateWebsiteUrl(website);
  const websiteTouched = website.trim().length > 0;
  const inlineUrlError = websiteTouched ? websiteValidation.error : null;

  async function runScan(): Promise<ScrapeResult | null> {
    const { url, error } = validateWebsiteUrl(website);
    if (error || !url) {
      const msg = error ?? "Ongeldige URL";
      setScanError(msg);
      toast.error(msg);
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

  async function generateVariants() {
    if (!name || !company || !email || !website) {
      toast.error("Vul alle velden in");
      return;
    }
    let s = scrape;
    if (!s) {
      s = await runScan();
      if (!s) return;
    }
    setGenerating(true);
    setVariants([]);
    setSelectedVariant(null);
    setPreview("");
    try {
      const angles: { label: string; angle: string; instruction: string }[] = [
        {
          label: "Warm & persoonlijk",
          angle: "persoonlijke connectie",
          instruction:
            "Zet in op een warme, persoonlijke openingszin die refereert aan iets specifieks van hun website. Toon oprechte interesse in hun werk, geen sales-praat.",
        },
        {
          label: "Zakelijk & resultaatgericht",
          angle: "concrete ROI en efficiëntie",
          instruction:
            "Focus op meetbare resultaten en tijdwinst. Noem 1 concreet cijfer of belofte (bijv. 'halveer je screeningstijd') dat aansluit bij hun specialisatie.",
        },
        {
          label: "Nieuwsgierig & kort",
          angle: "korte vraag-gedreven pitch",
          instruction:
            "Houd het ultra-kort (max 80 woorden). Open met een prikkelende vraag over een uitdaging in hun branche en sluit direct af met een concrete vraag voor 10 minuten sparren.",
        },
      ];

      const results = await Promise.all(
        angles.map(async (a) => {
          const { reply } = await ask({
            data: {
              task: "generic",
              context: `Schrijf een cold-outreach mail in het Nederlands aan ${name} van ${company}. Hoek: ${a.angle}. ${a.instruction} Verwerk subtiel dat ze actief zijn in ${s!.industry} en gespecialiseerd zijn in ${s!.specialisation}. Extra bedrijfscontext: ${s!.summary}. Toon: ${s!.tone}. Refereer natuurlijk aan hun website (${website}). Sluit af met een concrete vraag voor een korte kennismaking. Geef ALLEEN de mailtekst terug — geen onderwerpregel, geen markdown, geen labels.`,
            },
          });
          return { label: a.label, angle: a.angle, body: reply.trim() };
        }),
      );
      setVariants(results);
      setSelectedVariant(0);
      toast.success("3 concepten gegenereerd — kies er één");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI genereren mislukt");
    } finally {
      setGenerating(false);
    }
  }

  async function launchCampaign() {
    if (selectedVariant === null || !variants[selectedVariant]) {
      toast.error("Kies eerst een concept");
      return;
    }
    const chosen = variants[selectedVariant];
    const s = scrape;
    if (!s) {
      toast.error("Scan ontbreekt");
      return;
    }
    setLaunching(true);
    try {
      const previewText = chosen.body;
      setPreview(previewText);
      const now = new Date().toISOString();
      const leadId = crypto.randomUUID();

      let trackingToken: string | null = null;
      let trackingUrl: string | null = null;
      let trackingLinkId: string | null = null;
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
        trackingLinkId = link.id;
        trackingUrl = `${window.location.origin}/api/public/l/${link.token}`;
      } catch (err) {
        console.warn("Tracking link kon niet worden gemaakt", err);
      }

      let serverLeadId: string | null = null;
      try {
        const saved = await createServerLead({
          data: {
            name,
            company,
            email,
            website: normalizeUrl(website),
            emailPreview: previewText,
            trackingLinkId: trackingLinkId ?? undefined,
            trackingToken: trackingToken ?? undefined,
          },
        });
        serverLeadId = saved.id;
      } catch (err) {
        console.warn("Server-side lead opslaan mislukt", err);
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
        serverLeadId,
      };
      setLeads((cur) => [lead, ...cur]);
      toast.success(
        `Campagne gestart met concept "${chosen.label}"${trackingUrl && serverLeadId ? " · automation actief" : ""}`,
      );
      // Reset voor volgende lead
      setVariants([]);
      setSelectedVariant(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Campagne starten mislukt");
    } finally {
      setLaunching(false);
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
                status: "pending",
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

  async function runAutomation() {
    setRunningAutomation(true);
    try {
      const res = await fetch("/api/public/hooks/campaign-flow-tick", {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Tick faalde (${res.status})`);
      const result = (await res.json()) as {
        scanned: number;
        callTasksCreated: number;
        followupTasksCreated: number;
      };

      // Haal server-side taken op en merge in de lokale takenlijst
      const serverTasks: CampaignFlowTask[] = await fetchServerTasks();
      setTasks((cur) => {
        const existingKeys = new Set(
          cur.map((t) => `${t.leadName}|${t.company}|${t.action}`),
        );
        const extra: FlowTask[] = [];
        for (const st of serverTasks) {
          const key = `${st.lead_name}|${st.company}|${st.action}`;
          if (existingKeys.has(key)) continue;
          extra.push({
            id: st.id,
            serverId: st.id,
            leadName: st.lead_name ?? "Onbekend",
            company: st.company ?? "",
            action: st.action,
            reason: st.reason,
            createdAt: st.created_at,
            done: st.done,
            status: st.status,
            result: st.result,
            error: st.error,
            startedAt: st.started_at,
            doneAt: st.done_at,
          });
        }
        return [...extra, ...cur];
      });

      const total = result.callTasksCreated + result.followupTasksCreated;
      if (total > 0) {
        toast.success(
          `Automation actief · ${result.callTasksCreated} bel-taken, ${result.followupTasksCreated} opvolg-taken`,
        );
      } else {
        toast.info(
          `Automation liep · ${result.scanned} leads gecontroleerd, geen nieuwe taken`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Automation faalde");
    } finally {
      setRunningAutomation(false);
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
      status: "pending",
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
      status: "pending",
    };
    setTasks((cur) => [task, ...cur]);
    toast.info(`Opvolgtaak aangemaakt voor ${lead.company}`);
  }

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status !== "done" && t.status !== "cancelled"),
    [tasks],
  );
  const updateTask = useServerFn(updateCampaignTask);
  const fetchEvents = useServerFn(listCampaignTaskEvents);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [eventsByTask, setEventsByTask] = useState<Record<string, CampaignTaskEvent[]>>({});
  const [loadingEventsFor, setLoadingEventsFor] = useState<string | null>(null);

  async function changeTaskStatus(
    task: FlowTask,
    status: TaskStatus,
    opts?: { result?: string; error?: string },
  ) {
    const now = new Date().toISOString();
    // Optimistic local update
    setTasks((cur) =>
      cur.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status,
              done: status === "done",
              doneAt: status === "done" ? now : null,
              startedAt: status === "in_progress" ? now : t.startedAt,
              result: status === "done" ? opts?.result ?? t.result ?? null : t.result,
              error: status === "failed" ? opts?.error ?? t.error ?? null : status === "done" ? null : t.error,
            }
          : t,
      ),
    );
    if (task.serverId) {
      try {
        await updateTask({
          data: {
            id: task.serverId,
            status,
            result: opts?.result,
            error: opts?.error,
          },
        });
        // Refresh events if open
        if (expandedTaskId === task.id) loadEvents(task);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Bijwerken mislukt");
      }
    }
  }

  async function loadEvents(task: FlowTask) {
    if (!task.serverId) return;
    setLoadingEventsFor(task.id);
    try {
      const rows = await fetchEvents({ data: { taskId: task.serverId } });
      setEventsByTask((cur) => ({ ...cur, [task.id]: rows }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Log ophalen mislukt");
    } finally {
      setLoadingEventsFor(null);
    }
  }

  function toggleEvents(task: FlowTask) {
    if (expandedTaskId === task.id) {
      setExpandedTaskId(null);
      return;
    }
    setExpandedTaskId(task.id);
    if (!eventsByTask[task.id]) loadEvents(task);
  }


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
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://flexpro.nl"
              aria-invalid={inlineUrlError ? true : undefined}
              className={inlineUrlError ? "border-destructive focus-visible:ring-destructive" : undefined}
            />
            {inlineUrlError ? (
              <p className="mt-1 text-xs text-destructive">{inlineUrlError}</p>
            ) : websiteTouched ? (
              <p className="mt-1 text-xs text-muted-foreground">Ziet er goed uit — klik op "Scan website".</p>
            ) : null}
          </div>
        </div>

        {scrape && (
          <div className="mt-4 rounded-md border border-brand/30 bg-brand/5 p-3 text-xs space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-brand" />
              <span className="font-medium text-foreground">Website scan resultaat</span>
              <Badge variant="outline" className="ml-auto border-brand/40 text-brand">
                Geverifieerd
              </Badge>
            </div>

            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Branche</dt>
                <dd className="mt-0.5 text-foreground">{scrape.industry || "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Specialisatie</dt>
                <dd className="mt-0.5 text-foreground">{scrape.specialisation || "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Toon</dt>
                <dd className="mt-0.5 text-foreground">{scrape.tone || "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Gescand op</dt>
                <dd className="mt-0.5 text-foreground">
                  {scrape.scanned_at
                    ? new Date(scrape.scanned_at).toLocaleString("nl-NL", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : "—"}
                </dd>
              </div>
            </dl>

            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Samenvatting</dt>
              <dd className="mt-0.5 italic text-muted-foreground">
                {scrape.summary || "Geen samenvatting beschikbaar."}
              </dd>
            </div>

            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Bron URL</dt>
              <dd className="mt-0.5 truncate">
                <a
                  href={scrape.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand underline underline-offset-2 hover:text-brand/80"
                >
                  {scrape.source_url}
                </a>
              </dd>
            </div>
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
            disabled={scanning || !website.trim() || !!inlineUrlError}
          >
            {scanning ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Globe className="mr-2 h-4 w-4" />
            )}
            {scanning ? "Scannen…" : scrape ? "Opnieuw scannen" : "Scan website"}
          </Button>
          <Button
            onClick={generateVariants}
            disabled={generating || scanning || launching}
            className="bg-brand text-white hover:bg-brand/90"
          >
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {generating
              ? "3 concepten genereren…"
              : variants.length > 0
                ? "Genereer opnieuw"
                : "Genereer 3 concepten"}
          </Button>
        </div>

        {variants.length > 0 && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Kies één van de 3 concepten
              </Label>
              <span className="text-[10px] text-muted-foreground">
                Alleen de gekozen versie wordt verstuurd
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {variants.map((v, idx) => {
                const active = selectedVariant === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedVariant(idx)}
                    className={`text-left rounded-md border p-3 transition-all ${
                      active
                        ? "border-brand bg-brand/10 ring-2 ring-brand/40"
                        : "border-border bg-background/40 hover:border-brand/60"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{v.label}</span>
                      {active && (
                        <Badge className="bg-brand text-white text-[9px]">Gekozen</Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mb-2">
                      Hoek: {v.angle}
                    </div>
                    <pre className="whitespace-pre-wrap text-[11px] leading-snug text-foreground/90 max-h-56 overflow-auto font-sans">
                      {v.body}
                    </pre>
                  </button>
                );
              })}
            </div>
            {selectedVariant !== null && (
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Bewerk indien nodig
                </Label>
                <Textarea
                  value={variants[selectedVariant].body}
                  onChange={(e) => {
                    const val = e.target.value;
                    setVariants((cur) =>
                      cur.map((x, i) => (i === selectedVariant ? { ...x, body: val } : x)),
                    );
                  }}
                  rows={8}
                  className="mt-1 font-mono text-xs"
                />
              </div>
            )}
            <div className="flex justify-end">
              <Button
                onClick={launchCampaign}
                disabled={launching || selectedVariant === null}
                className="bg-brand text-white hover:bg-brand/90"
              >
                {launching ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="mr-2 h-4 w-4" />
                )}
                {launching ? "Campagne starten…" : "Start campagne met gekozen concept"}
              </Button>
            </div>
          </div>
        )}

        {preview && variants.length === 0 && (
          <div className="mt-5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Laatst verstuurde concept
            </Label>
            <Textarea
              value={preview}
              readOnly
              rows={8}
              className="mt-1 font-mono text-xs"
            />
          </div>
        )}
      </div>


      {/* Actieve leads in flow */}
      <div className="rounded-lg border border-border bg-muted/30 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Leads in flow ({leads.length})
            </h3>
            <p className="text-[10px] text-muted-foreground/80">
              Achtergrondjob draait automatisch elke 15 min · bel-taak bij klik, opvolg-taak na 3 dagen stilte
            </p>
          </div>
          <div className="flex gap-2">
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
            <Button
              size="sm"
              variant="outline"
              onClick={runAutomation}
              disabled={runningAutomation}
            >
              {runningAutomation ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Zap className="mr-1 h-3 w-3" />
              )}
              Run automation nu
            </Button>
          </div>
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
              <TaskCard
                key={t.id}
                task={t}
                expanded={expandedTaskId === t.id}
                events={eventsByTask[t.id] ?? null}
                loadingEvents={loadingEventsFor === t.id}
                onToggleEvents={() => toggleEvents(t)}
                onStart={() => changeTaskStatus(t, "in_progress")}
                onComplete={(result) => changeTaskStatus(t, "done", { result })}
                onFail={(error) => changeTaskStatus(t, "failed", { error })}
                onCancel={() => changeTaskStatus(t, "cancelled")}
                onReopen={() => changeTaskStatus(t, "pending")}
                onDelete={() => setTasks((cur) => cur.filter((x) => x.id !== t.id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_META: Record<TaskStatus, { label: string; className: string }> = {
  pending: {
    label: "Openstaand",
    className: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  },
  in_progress: {
    label: "In behandeling",
    className: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  },
  done: {
    label: "Uitgevoerd",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  failed: {
    label: "Mislukt",
    className: "border-destructive/50 bg-destructive/10 text-destructive",
  },
  cancelled: {
    label: "Geannuleerd",
    className: "border-border/60 bg-background/40 text-muted-foreground",
  },
};

function formatDT(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return v;
  }
}

function TaskCard(props: {
  task: FlowTask;
  expanded: boolean;
  events: CampaignTaskEvent[] | null;
  loadingEvents: boolean;
  onToggleEvents: () => void;
  onStart: () => void;
  onComplete: (result: string) => void;
  onFail: (error: string) => void;
  onCancel: () => void;
  onReopen: () => void;
  onDelete: () => void;
}) {
  const { task: t } = props;
  const [resultDraft, setResultDraft] = useState("");
  const [errorDraft, setErrorDraft] = useState("");
  const [mode, setMode] = useState<"idle" | "complete" | "fail">("idle");
  const meta = STATUS_META[t.status];
  const isClosed = t.status === "done" || t.status === "cancelled";

  return (
    <div
      className={`rounded-md border p-3 transition-all ${
        isClosed
          ? "border-border/50 bg-background/30"
          : t.status === "failed"
            ? "border-destructive/40 bg-destructive/5"
            : t.action === "call"
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-amber-500/40 bg-amber-500/5"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {t.action === "call" ? (
            <PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">
                {t.action === "call"
                  ? `Bel ${t.leadName} van ${t.company}`
                  : `Stuur opvolgmail naar ${t.leadName} van ${t.company}`}
              </span>
              <Badge variant="outline" className={`text-[10px] ${meta.className}`}>
                {meta.label}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">{t.reason}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground/80">
              <span>Aangemaakt: {formatDT(t.createdAt)}</span>
              {t.startedAt && <span>Gestart: {formatDT(t.startedAt)}</span>}
              {t.doneAt && <span>Afgerond: {formatDT(t.doneAt)}</span>}
            </div>
            {t.result && (
              <div className="mt-2 rounded border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                  Resultaat
                </div>
                <div className="whitespace-pre-wrap text-emerald-100/90">{t.result}</div>
              </div>
            )}
            {t.error && (
              <div className="mt-2 flex gap-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-destructive">
                    Foutmelding
                  </div>
                  <div className="whitespace-pre-wrap text-destructive/90">{t.error}</div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {t.status === "pending" && (
            <Button size="sm" variant="outline" onClick={props.onStart}>
              <Play className="mr-1 h-3 w-3" /> Start
            </Button>
          )}
          {(t.status === "pending" || t.status === "in_progress") && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMode(mode === "complete" ? "idle" : "complete")}
              >
                <CheckCircle2 className="mr-1 h-3 w-3" /> Klaar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMode(mode === "fail" ? "idle" : "fail")}
              >
                <AlertTriangle className="mr-1 h-3 w-3" /> Mislukt
              </Button>
              <Button size="sm" variant="ghost" onClick={props.onCancel}>
                <XCircle className="h-3 w-3" />
              </Button>
            </>
          )}
          {isClosed && (
            <Button size="sm" variant="outline" onClick={props.onReopen}>
              <RotateCcw className="mr-1 h-3 w-3" /> Heropen
            </Button>
          )}
          {t.serverId && (
            <Button size="sm" variant="ghost" onClick={props.onToggleEvents}>
              {props.expanded ? (
                <ChevronDown className="mr-1 h-3 w-3" />
              ) : (
                <ChevronRight className="mr-1 h-3 w-3" />
              )}
              <History className="mr-1 h-3 w-3" /> Log
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={props.onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {mode === "complete" && (
        <div className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/5 p-3">
          <Label className="text-[10px] uppercase text-muted-foreground">
            Resultaat (bijv. "Gesprek gepland op 22 juli")
          </Label>
          <Textarea
            value={resultDraft}
            onChange={(e) => setResultDraft(e.target.value)}
            rows={2}
            className="mt-1 text-xs"
            placeholder="Beschrijf de uitkomst…"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
              Annuleer
            </Button>
            <Button
              size="sm"
              onClick={() => {
                props.onComplete(resultDraft.trim() || "Uitgevoerd");
                setResultDraft("");
                setMode("idle");
              }}
            >
              Markeer als klaar
            </Button>
          </div>
        </div>
      )}

      {mode === "fail" && (
        <div className="mt-3 rounded border border-destructive/40 bg-destructive/5 p-3">
          <Label className="text-[10px] uppercase text-destructive">Foutmelding</Label>
          <Textarea
            value={errorDraft}
            onChange={(e) => setErrorDraft(e.target.value)}
            rows={2}
            className="mt-1 text-xs"
            placeholder="Waarom is de taak mislukt?"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
              Annuleer
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                props.onFail(errorDraft.trim() || "Onbekende fout");
                setErrorDraft("");
                setMode("idle");
              }}
            >
              Registreer fout
            </Button>
          </div>
        </div>
      )}

      {props.expanded && (
        <div className="mt-3 rounded border border-border bg-background/40 p-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <History className="h-3 w-3" /> Geschiedenis
          </div>
          {props.loadingEvents ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Log laden…
            </div>
          ) : !props.events || props.events.length === 0 ? (
            <div className="text-xs text-muted-foreground">Nog geen loginvoer.</div>
          ) : (
            <ol className="relative ml-3 space-y-2 border-l border-border pl-3">
              {props.events.map((ev) => (
                <li key={ev.id} className="text-xs">
                  <div className="absolute -left-[5px] mt-1 h-2 w-2 rounded-full bg-brand" />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">
                      {ev.event_type === "created"
                        ? "Taak aangemaakt"
                        : ev.event_type === "status_changed"
                          ? `Status → ${STATUS_META[(ev.to_status as TaskStatus) ?? "pending"]?.label ?? ev.to_status}`
                          : ev.event_type}
                    </span>
                    <span className="text-muted-foreground">· {formatDT(ev.created_at)}</span>
                  </div>
                  {ev.message && (
                    <div className="mt-0.5 whitespace-pre-wrap text-muted-foreground/90">
                      {ev.message}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
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
