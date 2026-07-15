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
  Download,
  Pencil,

  RefreshCw,
  History,
  Play,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  XCircle,
  RotateCcw,
  Upload,
  Search,
  ArrowUpDown,
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
const LS_SCAN_EDITS = "campaign-flow-scan-edits";

type SavedScanEdit = {
  sourceUrl: string;
  website: string;
  company?: string;
  edited: ScrapeResult;
  original: ScrapeResult;
  savedAt: string;
};

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
  const [originalScrape, setOriginalScrape] = useState<ScrapeResult | null>(null);

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
  const [savedScanEdits, setSavedScanEdits] = useState<Record<string, SavedScanEdit>>(
    () => loadLS<Record<string, SavedScanEdit>>(LS_SCAN_EDITS, {}),
  );
  const [openDiffUrl, setOpenDiffUrl] = useState<string | null>(null);
  const [openDiffFields, setOpenDiffFields] = useState<Record<string, string[]>>({});
  const [scanEditSearch, setScanEditSearch] = useState("");
  const [scanEditSort, setScanEditSort] = useState<"dateDesc" | "dateAsc" | "urlAsc" | "urlDesc">("dateDesc");

  function toggleDiffField(url: string, fieldKey: string) {
    setOpenDiffFields((prev) => {
      const current = prev[url] ?? [];
      const next = current.includes(fieldKey)
        ? current.filter((k) => k !== fieldKey)
        : [...current, fieldKey];
      return { ...prev, [url]: next };
    });
  }

  function setAllDiffFields(url: string, keys: string[]) {
    setOpenDiffFields((prev) => ({ ...prev, [url]: keys }));
  }

  function computeScanDiff(original: ScrapeResult, edited: ScrapeResult) {
    const fields = [
      { key: "industry", label: "Branche" },
      { key: "specialisation", label: "Specialisatie" },
      { key: "tone", label: "Toon" },
      { key: "summary", label: "Samenvatting" },
    ] as const;
    const out: { key: string; label: string; from: string; to: string }[] = [];
    for (const { key, label } of fields) {
      const from = (original[key] ?? "") || "";
      const to = (edited[key] ?? "") || "";
      if (from !== to) out.push({ key, label, from, to });
    }
    return { changes: out, total: fields.length };
  }

  async function copyDiffAsText(entry: SavedScanEdit) {
    const { changes } = computeScanDiff(entry.original, entry.edited);
    if (changes.length === 0) {
      toast.info("Geen verschillen om te kopiëren");
      return;
    }
    const header = `Verschiloverzicht — ${entry.company || entry.sourceUrl}\n${entry.sourceUrl}\n`;
    const body = changes
      .map((c) => `• ${c.label}\n  scan: ${c.from || "—"}\n  opgeslagen: ${c.to || "—"}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(`${header}\n${body}\n`);
      toast.success("Verschil gekopieerd naar klembord");
    } catch {
      toast.error("Kopiëren mislukt");
    }
  }

  useEffect(() => {
    localStorage.setItem(LS_LEADS, JSON.stringify(leads));
  }, [leads]);
  useEffect(() => {
    localStorage.setItem(LS_TASKS, JSON.stringify(tasks));
  }, [tasks]);
  useEffect(() => {
    localStorage.setItem(LS_SCAN_EDITS, JSON.stringify(savedScanEdits));
  }, [savedScanEdits]);

  const scanChanges = useMemo(() => {
    if (!scrape || !originalScrape) return [];
    const fields = [
      { key: "industry", label: "Branche" },
      { key: "specialisation", label: "Specialisatie" },
      { key: "tone", label: "Toon" },
      { key: "summary", label: "Samenvatting" },
    ] as const;
    const out: { label: string; from: string; to: string; key: string }[] = [];
    for (const { key, label } of fields) {
      const from = (originalScrape[key] ?? "") || "";
      const to = (scrape[key] ?? "") || "";
      if (from !== to) out.push({ label, from, to, key });
    }
    return out;
  }, [scrape, originalScrape]);

  const livePreviews = useMemo(() => {
    if (!scrape) return [];
    const displayName = name.trim() || "[naam]";
    const displayCompany = company.trim() || "[bedrijf]";
    const industry = (scrape.industry ?? "").trim() || "jullie branche";
    const specialisation = (scrape.specialisation ?? "").trim() || "jullie specialisatie";
    const tone = (scrape.tone ?? "").trim() || "neutraal";
    const summary = (scrape.summary ?? "").trim() || "jullie werk";
    return [
      {
        label: "Warm & persoonlijk",
        body: `Hi ${displayName},\n\nIk kwam ${displayCompany} tegen en werd nieuwsgierig — vooral omdat jullie in ${industry} echt inzetten op ${specialisation}. ${summary.slice(0, 140)}${summary.length > 140 ? "…" : ""}\n\nZou je openstaan voor een korte kennismaking?`,
      },
      {
        label: "Zakelijk & resultaatgericht",
        body: `Hi ${displayName},\n\nBinnen ${industry} zien we dat organisaties zoals ${displayCompany} — met focus op ${specialisation} — hun screeningstijd flink kunnen terugbrengen. Op basis van ${summary.slice(0, 100)}${summary.length > 100 ? "…" : ""} denk ik dat er concreet ruimte zit.\n\nHeb je 15 minuten om te sparren?`,
      },
      {
        label: "Nieuwsgierig & kort",
        body: `Hi ${displayName},\n\nSnelle vraag: wat is momenteel jullie grootste uitdaging binnen ${specialisation}? Ik zag bij ${displayCompany} dat ${summary.slice(0, 90)}${summary.length > 90 ? "…" : ""}\n\n10 minuten sparren volgende week?`,
      },
    ].map((p) => ({ ...p, tone }));
  }, [scrape, name, company]);

  const filteredScanEdits = useMemo(() => {
    const q = scanEditSearch.trim().toLowerCase();
    const entries = Object.values(savedScanEdits);
    const filtered = q
      ? entries.filter((e) => {
          const saved = new Date(e.savedAt).toLocaleString("nl-NL", {
            dateStyle: "short",
            timeStyle: "short",
          });
          return (
            e.sourceUrl.toLowerCase().includes(q) ||
            (e.company?.toLowerCase() ?? "").includes(q) ||
            saved.toLowerCase().includes(q)
          );
        })
      : entries;
    return filtered.sort((a, b) => {
      switch (scanEditSort) {
        case "dateAsc":
          return a.savedAt.localeCompare(b.savedAt);
        case "urlAsc":
          return a.sourceUrl.localeCompare(b.sourceUrl);
        case "urlDesc":
          return b.sourceUrl.localeCompare(a.sourceUrl);
        case "dateDesc":
        default:
          return b.savedAt.localeCompare(a.savedAt);
      }
    });
  }, [savedScanEdits, scanEditSearch, scanEditSort]);


  // Reset scan wanneer de URL verandert.

  useEffect(() => {
    setScrape(null);
    setOriginalScrape(null);
    setScanError(null);
    setScanAttempts(0);
    setLastScanAt(null);
    setVariants([]);
    setSelectedVariant(null);
    setPreview("");
  }, [website]);


  const websiteValidation = validateWebsiteUrl(website);
  const websiteTouched = website.trim().length > 0;
  const inlineUrlError = websiteTouched ? websiteValidation.error : null;

  function resetScanArtifacts() {
    setScrape(null);
    setOriginalScrape(null);
    setScanError(null);
    setScanAttempts(0);
    setLastScanAt(null);
    setVariants([]);
    setSelectedVariant(null);
    setPreview("");
  }

  function resetToOriginalScan() {
    if (!originalScrape) return;
    setScrape(originalScrape);
    toast.info("Teruggezet naar originele scan-waarden");
  }

  // Autosave manual edits per scan (keyed by source_url)
  useEffect(() => {
    if (!scrape || !originalScrape) return;
    const key = scrape.source_url;
    if (!key) return;
    const hasChanges =
      (scrape.industry ?? "") !== (originalScrape.industry ?? "") ||
      (scrape.specialisation ?? "") !== (originalScrape.specialisation ?? "") ||
      (scrape.tone ?? "") !== (originalScrape.tone ?? "") ||
      (scrape.summary ?? "") !== (originalScrape.summary ?? "");
    if (!hasChanges) return;
    const t = setTimeout(() => {
      setSavedScanEdits((prev) => ({
        ...prev,
        [key]: {
          sourceUrl: key,
          website: website.trim(),
          company: company.trim() || undefined,
          edited: scrape,
          original: originalScrape,
          savedAt: new Date().toISOString(),
        },
      }));
    }, 600);
    return () => clearTimeout(t);
  }, [scrape, originalScrape, website, company]);

  function applySavedScanEdit(entry: SavedScanEdit) {
    setWebsite(entry.website);
    // Defer scrape/original set so the website-change effect (which clears them) runs first.
    setTimeout(() => {
      setOriginalScrape(entry.original);
      setScrape(entry.edited);
      setLastScanAt(entry.savedAt);
      setScanError(null);
    }, 0);
    toast.success("Opgeslagen aanpassingen geladen");
  }

  function commitSavedScanEdit(entry: SavedScanEdit) {
    if (scrape?.source_url !== entry.sourceUrl) {
      toast.error("Laad deze scan eerst voordat je toepast");
      return;
    }
    setOriginalScrape(entry.edited);
    setScrape(entry.edited);
    toast.success("Opgeslagen waarden definitief toegepast");
  }

  function deleteSavedScanEdit(sourceUrl: string) {
    setSavedScanEdits((prev) => {
      const next = { ...prev };
      delete next[sourceUrl];
      return next;
    });
    toast.info("Opgeslagen aanpassingen verwijderd");
  }

  function isScrapeShape(x: unknown): x is ScrapeResult {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return (
      typeof o.industry === "string" &&
      typeof o.specialisation === "string" &&
      typeof o.tone === "string" &&
      typeof o.summary === "string" &&
      typeof o.source_url === "string"
    );
  }

  function coerceSavedEdit(raw: unknown): SavedScanEdit | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const edited = o.edited;
    const original = o.original;
    if (!isScrapeShape(edited) || !isScrapeShape(original)) return null;
    const sourceUrl =
      (typeof o.sourceUrl === "string" && o.sourceUrl) ||
      edited.source_url ||
      original.source_url;
    if (!sourceUrl) return null;
    return {
      sourceUrl,
      website: typeof o.website === "string" && o.website ? o.website : sourceUrl,
      company: typeof o.company === "string" ? o.company : undefined,
      edited: { ...edited, source_url: sourceUrl },
      original: { ...original, source_url: sourceUrl },
      savedAt: typeof o.savedAt === "string" ? o.savedAt : new Date().toISOString(),
    };
  }

  function exportSavedScanEdits() {
    const entries = Object.values(savedScanEdits);
    if (entries.length === 0) {
      toast.info("Geen opgeslagen aanpassingen om te exporteren");
      return;
    }
    const blob = new Blob(
      [JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scan-aanpassingen_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${entries.length} aanpassing(en) geëxporteerd`);
  }

  async function importSavedScanEdits(file: File) {
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const rawList: unknown[] = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { entries?: unknown }).entries)
          ? ((parsed as { entries: unknown[] }).entries)
          : [parsed];
      const valid: SavedScanEdit[] = [];
      for (const r of rawList) {
        const c = coerceSavedEdit(r);
        if (c) valid.push(c);
      }
      if (valid.length === 0) {
        toast.error("Geen geldige scan-aanpassingen gevonden in dit bestand");
        return;
      }
      let added = 0;
      let updated = 0;
      setSavedScanEdits((prev) => {
        const next = { ...prev };
        for (const entry of valid) {
          if (next[entry.sourceUrl]) updated++;
          else added++;
          next[entry.sourceUrl] = entry;
        }
        return next;
      });
      toast.success(
        `Import gelukt: ${added} nieuw, ${updated} bijgewerkt (gekoppeld aan bron-URL)`,
      );
    } catch (err) {
      toast.error("Kon bestand niet lezen", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }




  async function rescanWebsite() {
    resetScanArtifacts();
    return runScan();
  }

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
    setScanAttempts((n) => n + 1);
    try {
      const result = await scan({ data: { url, company: company || undefined } });
      setOriginalScrape(result);
      const saved = savedScanEdits[result.source_url];
      if (saved) {
        setScrape(saved.edited);
        toast.success("Website gescand — opgeslagen aanpassingen toegepast");
      } else {
        setScrape(result);
        toast.success("Website gescand");
      }
      setLastScanAt(new Date().toISOString());
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Scan mislukt";
      setScanError(msg);
      setLastScanAt(new Date().toISOString());
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={async () => {
                  try {
                    const { jsPDF } = await import("jspdf");
                    const doc = new jsPDF({ unit: "pt", format: "a4" });
                    const marginX = 48;
                    const maxWidth = 595 - marginX * 2;
                    let y = 56;

                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(18);
                    doc.text("Website scan rapport", marginX, y);
                    y += 24;

                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(10);
                    doc.setTextColor(120);
                    doc.text(
                      `Gegenereerd op ${new Date().toLocaleString("nl-NL")}`,
                      marginX,
                      y,
                    );
                    y += 24;
                    doc.setTextColor(0);

                    const rows: Array<[string, string]> = [
                      ["Bedrijf", company || "—"],
                      ["Contact", name || "—"],
                      ["E-mail", email || "—"],
                      ["Bron URL", scrape.source_url || "—"],
                      [
                        "Gescand op",
                        scrape.scanned_at
                          ? new Date(scrape.scanned_at).toLocaleString("nl-NL")
                          : "—",
                      ],
                      ["Branche", scrape.industry || "—"],
                      ["Specialisatie", scrape.specialisation || "—"],
                      ["Toon", scrape.tone || "—"],
                    ];

                    for (const [label, value] of rows) {
                      doc.setFont("helvetica", "bold");
                      doc.setFontSize(10);
                      doc.text(label, marginX, y);
                      doc.setFont("helvetica", "normal");
                      const lines = doc.splitTextToSize(String(value), maxWidth - 110);
                      doc.text(lines, marginX + 110, y);
                      y += Math.max(16, lines.length * 14) + 4;
                      if (y > 780) {
                        doc.addPage();
                        y = 56;
                      }
                    }

                    y += 8;
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(11);
                    doc.text("Samenvatting", marginX, y);
                    y += 16;
                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(10);
                    const summaryLines = doc.splitTextToSize(
                      scrape.summary || "Geen samenvatting beschikbaar.",
                      maxWidth,
                    );
                    doc.text(summaryLines, marginX, y);

                    const safeHost = (() => {
                      try {
                        return new URL(scrape.source_url).hostname.replace(/[^a-z0-9.-]/gi, "_");
                      } catch {
                        return "scan";
                      }
                    })();
                    const stamp = new Date().toISOString().slice(0, 10);
                    doc.save(`website-scan_${safeHost}_${stamp}.pdf`);
                    toast.success("PDF-rapport gedownload");
                  } catch (err) {
                    toast.error("PDF genereren mislukt", {
                      description: err instanceof Error ? err.message : String(err),
                    });
                  }
                }}
              >
                <Download className="mr-1 h-3 w-3" />
                PDF
              </Button>
            </div>

            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">
                Controleer en pas de scan-output hieronder aan voordat je e-mails genereert.
              </p>
              {originalScrape && scanChanges.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetToOriginalScan}
                  className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Terugzetten naar scan
                </Button>
              )}
            </div>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Branche</dt>
                <Input
                  value={scrape.industry ?? ""}
                  onChange={(e) => setScrape({ ...scrape, industry: e.target.value })}
                  placeholder="Bijv. Uitzendbureau"
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Specialisatie</dt>
                <Input
                  value={scrape.specialisation ?? ""}
                  onChange={(e) => setScrape({ ...scrape, specialisation: e.target.value })}
                  placeholder="Bijv. Techniek & Logistiek"
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Toon</dt>
                <Input
                  value={scrape.tone ?? ""}
                  onChange={(e) => setScrape({ ...scrape, tone: e.target.value })}
                  placeholder="Bijv. Professioneel & vriendelijk"
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Gescand op</dt>
                <dd className="mt-2 text-foreground">
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
              <Textarea
                value={scrape.summary ?? ""}
                onChange={(e) => setScrape({ ...scrape, summary: e.target.value })}
                placeholder="Korte samenvatting van het bedrijf"
                rows={3}
                className="mt-1 text-xs"
              />
            </div>

            {scanChanges.length > 0 && (
              <div className="rounded-md border border-border bg-muted/50 p-3 text-xs">
                <div className="mb-2 flex items-center gap-1.5 text-muted-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="font-medium">Handmatig aangepast ten opzichte van scan</span>
                </div>
                <ul className="space-y-2">
                  {scanChanges.map((change) => (
                    <li key={change.key}>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {change.label}
                      </span>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="truncate text-muted-foreground line-through" title={change.from}>
                          {change.from || "—"}
                        </span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium text-foreground" title={change.to}>
                          {change.to || "—"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {livePreviews.length > 0 && (
              <div className="rounded-md border border-dashed border-border bg-background/60 p-3 text-xs">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">Live voorbeeld e-mailconcepten</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    template · past aan tijdens typen
                  </span>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  {livePreviews.map((p) => (
                    <div
                      key={p.label}
                      className="rounded-md border border-border bg-muted/30 p-2"
                    >
                      <div className="mb-1 flex items-center justify-between gap-1">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {p.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">toon: {p.tone}</span>
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-foreground/90">
                        {p.body}
                      </pre>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Dit is een indicatief sjabloon. De definitieve concepten worden door AI gegenereerd op basis van deze velden.
                </p>
              </div>
            )}



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
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="flex-1 space-y-1">
                <div className="font-medium text-destructive">Scan mislukt</div>
                <p className="text-destructive/90">{scanError}</p>
                <p className="text-[11px] text-muted-foreground">
                  {scanAttempts > 1 ? `Poging ${scanAttempts}` : "Poging 1"}
                  {lastScanAt
                    ? ` · ${new Date(lastScanAt).toLocaleTimeString("nl-NL", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}`
                    : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={rescanWebsite}
                disabled={scanning || !!inlineUrlError}
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                {scanning ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-3.5 w-3.5" />
                )}
                Probeer opnieuw
              </Button>
            </div>
          </div>
        )}

        {scrape && lastScanAt && !scanError && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Laatste succesvolle scan om{" "}
            {new Date(lastScanAt).toLocaleTimeString("nl-NL", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {scanAttempts > 1 ? ` (na ${scanAttempts} pogingen)` : ""}.
          </p>
        )}

        <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium text-foreground">
              Opgeslagen scan-aanpassingen{" "}
              {Object.keys(savedScanEdits).length > 0
                ? `(${filteredScanEdits.length}/${Object.keys(savedScanEdits).length})`
                : `(${Object.keys(savedScanEdits).length})`}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px]"
                onClick={exportSavedScanEdits}
                disabled={Object.keys(savedScanEdits).length === 0}
              >
                <Download className="mr-1 h-3 w-3" />
                Exporteer
              </Button>
              <Label
                htmlFor="scan-edits-import"
                className="inline-flex h-7 cursor-pointer items-center rounded-md border border-input bg-background px-2.5 text-[11px] font-medium hover:bg-accent hover:text-accent-foreground"
              >
                <Upload className="mr-1 h-3 w-3" />
                Importeer
              </Label>
              <input
                id="scan-edits-import"
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importSavedScanEdits(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          <p className="mb-2 text-[10px] text-muted-foreground">
            Automatisch opgeslagen per bron-URL. Importeer een eerder geëxporteerd JSON-bestand om
            aanpassingen terug te zetten — gekoppeld aan dezelfde bron-URL.
          </p>
          {Object.keys(savedScanEdits).length === 0 ? (
            <p className="text-[11px] italic text-muted-foreground">
              Nog geen aanpassingen opgeslagen.
            </p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[12rem] flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Zoek op URL, bedrijf of datum..."
                    value={scanEditSearch}
                    onChange={(e) => setScanEditSearch(e.target.value)}
                    className="h-8 pl-8 text-[11px]"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                  <select
                    value={scanEditSort}
                    onChange={(e) => setScanEditSort(e.target.value as typeof scanEditSort)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-[11px] text-foreground hover:bg-accent"
                    aria-label="Sorteer op"
                  >
                    <option value="dateDesc">Nieuwste eerst</option>
                    <option value="dateAsc">Oudste eerst</option>
                    <option value="urlAsc">URL A-Z</option>
                    <option value="urlDesc">URL Z-A</option>
                  </select>
                </div>
              </div>
              {filteredScanEdits.length === 0 ? (
                <p className="text-[11px] italic text-muted-foreground">
                  Geen resultaten voor je zoekopdracht.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {filteredScanEdits.map((entry) => {
                  const isCurrent = scrape?.source_url === entry.sourceUrl;
                  const isDiffOpen = openDiffUrl === entry.sourceUrl;
                  const { changes, total } = computeScanDiff(entry.original, entry.edited);
                  return (
                    <li
                      key={entry.sourceUrl}
                      className="rounded border border-border/60 bg-background p-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground" title={entry.sourceUrl}>
                            {entry.company || entry.sourceUrl}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {entry.sourceUrl} · opgeslagen{" "}
                            {new Date(entry.savedAt).toLocaleString("nl-NL", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                            {isCurrent ? " · huidige" : ""}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() =>
                            setOpenDiffUrl(isDiffOpen ? null : entry.sourceUrl)
                          }
                          aria-expanded={isDiffOpen}
                        >
                          {isDiffOpen ? (
                            <ChevronDown className="mr-1 h-3 w-3" />
                          ) : (
                            <ChevronRight className="mr-1 h-3 w-3" />
                          )}
                          Verschil
                          {changes.length > 0 ? ` (${changes.length})` : ""}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => applySavedScanEdit(entry)}
                          disabled={isCurrent}
                        >
                          Laden
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px] text-muted-foreground hover:text-destructive"
                          onClick={() => deleteSavedScanEdit(entry.sourceUrl)}
                        >
                          Verwijder
                        </Button>
                      </div>
                      {isDiffOpen && (
                        <div className="mt-2 rounded-md border border-border bg-muted/40 p-2">
                          {changes.length === 0 ? (
                            <p className="text-[11px] italic text-muted-foreground">
                              Geen verschillen — opgeslagen waarden zijn identiek aan de scan.
                            </p>
                          ) : (
                            <>
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  Origineel vs Opgeslagen
                                </span>
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[10px]"
                                    onClick={() =>
                                      setAllDiffFields(
                                        entry.sourceUrl,
                                        changes.map((c) => c.key),
                                      )
                                    }
                                  >
                                    Alles uitklappen
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[10px]"
                                    onClick={() => setAllDiffFields(entry.sourceUrl, [])}
                                  >
                                    Inklappen
                                  </Button>
                                </div>
                              </div>
                              <ul className="space-y-1.5">
                                {changes.map((change) => {
                                  const openFields = openDiffFields[entry.sourceUrl] ?? [];
                                  const fieldOpen = openFields.includes(change.key);
                                  const delta =
                                    (change.to?.length ?? 0) - (change.from?.length ?? 0);
                                  return (
                                    <li
                                      key={change.key}
                                      className="rounded border border-border/60 bg-background"
                                    >
                                      <button
                                        type="button"
                                        onClick={() =>
                                          toggleDiffField(entry.sourceUrl, change.key)
                                        }
                                        aria-expanded={fieldOpen}
                                        className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/40"
                                      >
                                        {fieldOpen ? (
                                          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                                        ) : (
                                          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                        )}
                                        <span className="text-[11px] font-medium text-foreground">
                                          {change.label}
                                        </span>
                                        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                          <span
                                            className={
                                              delta > 0
                                                ? "text-emerald-600 dark:text-emerald-400"
                                                : delta < 0
                                                  ? "text-destructive"
                                                  : ""
                                            }
                                          >
                                            {delta > 0 ? `+${delta}` : delta} tekens
                                          </span>
                                        </span>
                                      </button>
                                      {fieldOpen ? (
                                        <div className="grid gap-2 border-t border-border/60 p-2 sm:grid-cols-2">
                                          <div>
                                            <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
                                              Origineel
                                            </div>
                                            <div className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-destructive/30 bg-destructive/5 p-1.5 text-[11px] leading-relaxed text-foreground">
                                              {change.from || (
                                                <span className="italic text-muted-foreground">
                                                  (leeg)
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <div>
                                            <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                              Opgeslagen
                                            </div>
                                            <div className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-emerald-500/30 bg-emerald-500/5 p-1.5 text-[11px] leading-relaxed text-foreground">
                                              {change.to || (
                                                <span className="italic text-muted-foreground">
                                                  (leeg)
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2 border-t border-border/60 px-2 py-1">
                                          <span
                                            className="min-w-0 flex-1 truncate text-[11px] text-destructive line-through"
                                            title={change.from}
                                          >
                                            {change.from || "—"}
                                          </span>
                                          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                          <span
                                            className="min-w-0 flex-1 truncate text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
                                            title={change.to}
                                          >
                                            {change.to || "—"}
                                          </span>
                                        </div>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                              <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                                <span className="text-[10px] text-muted-foreground">
                                  {changes.length} van {total} velden aangepast
                                </span>
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[11px]"
                                    onClick={() => void copyDiffAsText(entry)}
                                  >
                                    Kopieer als tekst
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="default"
                                    size="sm"
                                    className="h-6 text-[11px]"
                                    onClick={() => commitSavedScanEdit(entry)}
                                    disabled={scrape?.source_url !== entry.sourceUrl}
                                    title={
                                      scrape?.source_url === entry.sourceUrl
                                        ? "Vervang de originele scanwaarden door de opgeslagen versie"
                                        : "Laad deze scan eerst om toe te passen"
                                    }
                                  >
                                    Toepassen op scan
                                  </Button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
            </ul>
            </>
          )}
        </div>




        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={scrape || scanError ? rescanWebsite : runScan}
            disabled={scanning || !website.trim() || !!inlineUrlError}
          >
            {scanning ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : scanError ? (
              <RotateCcw className="mr-2 h-4 w-4" />
            ) : scrape ? (
              <RefreshCw className="mr-2 h-4 w-4" />
            ) : (
              <Globe className="mr-2 h-4 w-4" />
            )}
            {scanning
              ? "Scannen…"
              : scanError
                ? "Scan opnieuw"
                : scrape
                  ? "Scan opnieuw"
                  : "Scan website"}
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
