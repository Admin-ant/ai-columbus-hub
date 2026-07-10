import { createFileRoute, Link, useServerFn } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Pause, Play, Square, Loader2, CheckCircle2, AlertCircle, Plus, ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  createCallRecording,
  processCallRecording,
  listCallRecordings,
  quickCreateLead,
} from "@/lib/call-recorder.functions";

export const Route = createFileRoute("/_authenticated/opname")({
  head: () => ({ meta: [{ title: "AI Gesprek Recorder" }] }),
  component: OpnamePage,
});

type TargetKind = "lead" | "client";
type Target = { kind: TargetKind; id: string; label: string; sublabel?: string };

type RecState = "idle" | "recording" | "paused" | "uploading" | "processing" | "done" | "error";

const WORKFLOW_STAGES = [
  { value: "nieuw", label: "Nieuw" },
  { value: "in_gesprek", label: "In gesprek" },
  { value: "voorstel", label: "Voorstel gedaan" },
  { value: "onderhandeling", label: "Onderhandeling" },
  { value: "gewonnen", label: "Gewonnen" },
  { value: "verloren", label: "Verloren" },
];

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function pickMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "audio/webm";
}

function OpnamePage() {
  const { currentOrganizationId, currentOrganization } = useWorkspace();

  const [leads, setLeads] = useState<Target[]>([]);
  const [clients, setClients] = useState<Target[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [workflowStage, setWorkflowStage] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [newLeadOpen, setNewLeadOpen] = useState(false);

  const [recState, setRecState] = useState<RecState>("idle");
  const [durationSec, setDurationSec] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [report, setReport] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [tasksCreated, setTasksCreated] = useState<number>(0);
  const [suggestedStage, setSuggestedStage] = useState<string | null>(null);

  const [history, setHistory] = useState<Awaited<ReturnType<typeof listCallRecordings>>["rows"]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const accumulatedMsRef = useRef<number>(0);
  const mimeRef = useRef<string>("audio/webm");

  const createRec = useServerFn(createCallRecording);
  const processRec = useServerFn(processCallRecording);
  const listRec = useServerFn(listCallRecordings);
  const createLead = useServerFn(quickCreateLead);

  // Load leads + clients + history
  useEffect(() => {
    if (!currentOrganizationId) return;
    let alive = true;
    (async () => {
      setLoadingTargets(true);
      const [leadsRes, clientsRes, histRes] = await Promise.all([
        supabase
          .from("leads")
          .select("id, name, company")
          .eq("organization_id", currentOrganizationId)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("clients")
          .select("id, name, contact_person")
          .eq("organization_id", currentOrganizationId)
          .order("name")
          .limit(200),
        listRec({ data: { organization_id: currentOrganizationId, limit: 10 } }).catch(() => ({ rows: [] })),
      ]);
      if (!alive) return;
      setLeads(
        (leadsRes.data ?? []).map((l) => ({
          kind: "lead" as const,
          id: l.id,
          label: l.name,
          sublabel: l.company ?? undefined,
        })),
      );
      setClients(
        (clientsRes.data ?? []).map((c) => ({
          kind: "client" as const,
          id: c.id,
          label: c.name,
          sublabel: c.contact_person ?? undefined,
        })),
      );
      setHistory(histRes.rows ?? []);
      setLoadingTargets(false);
    })();
    return () => {
      alive = false;
    };
  }, [currentOrganizationId, listRec]);

  const selectedTarget: Target | null = useMemo(() => {
    if (!selectedKey) return null;
    const [kind, id] = selectedKey.split(":");
    const pool = kind === "lead" ? leads : clients;
    return pool.find((t) => t.id === id) ?? null;
  }, [selectedKey, leads, clients]);

  function cleanupStream() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  useEffect(() => cleanupStream, []);

  async function startRecording() {
    setErrorMsg(null);
    setReport(null);
    setTranscript(null);
    setTasksCreated(0);
    setSuggestedStage(null);

    if (!currentOrganizationId) {
      toast.error("Geen actieve organisatie");
      return;
    }
    if (!selectedTarget) {
      toast.error("Selecteer eerst een klant of lead");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Audio level meter
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setAudioLevel(Math.min(1, rms * 3));
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();

      const mime = pickMimeType();
      mimeRef.current = mime;
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = mr;
      mr.start();

      accumulatedMsRef.current = 0;
      startedAtRef.current = Date.now();
      setDurationSec(0);
      timerRef.current = setInterval(() => {
        const elapsed = accumulatedMsRef.current + (Date.now() - startedAtRef.current);
        setDurationSec(Math.floor(elapsed / 1000));
      }, 250);

      setRecState("recording");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Microfoon kon niet worden geopend";
      setErrorMsg(msg);
      setRecState("error");
      cleanupStream();
      toast.error(msg);
    }
  }

  function pauseRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    if (mr.state === "recording") {
      mr.pause();
      accumulatedMsRef.current += Date.now() - startedAtRef.current;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setRecState("paused");
    }
  }

  function resumeRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    if (mr.state === "paused") {
      mr.resume();
      startedAtRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = accumulatedMsRef.current + (Date.now() - startedAtRef.current);
        setDurationSec(Math.floor(elapsed / 1000));
      }, 250);
      setRecState("recording");
    }
  }

  async function stopRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr) return;

    if (mr.state !== "inactive") {
      const finalDuration = Math.max(
        1,
        Math.floor(
          (accumulatedMsRef.current + (mr.state === "recording" ? Date.now() - startedAtRef.current : 0)) /
            1000,
        ),
      );

      const stopped: Promise<Blob> = new Promise((resolve) => {
        mr.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeRef.current });
          resolve(blob);
        };
        mr.stop();
      });

      setRecState("uploading");
      cleanupStream();
      try {
        const blob = await stopped;
        if (blob.size < 2048) {
          throw new Error("Opname is te kort of leeg — probeer opnieuw");
        }
        await uploadAndProcess(blob, finalDuration);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMsg(msg);
        setRecState("error");
        toast.error(msg);
      }
    }
  }

  async function uploadAndProcess(blob: Blob, duration: number) {
    if (!currentOrganizationId || !selectedTarget) {
      throw new Error("Geen klant/lead geselecteerd");
    }

    // 1. Create DB row
    const { id } = await createRec({
      data: {
        organization_id: currentOrganizationId,
        lead_id: selectedTarget.kind === "lead" ? selectedTarget.id : null,
        client_id: selectedTarget.kind === "client" ? selectedTarget.id : null,
        workflow_stage: workflowStage || null,
        title: title || `Gesprek — ${selectedTarget.label}`,
      },
    });

    // 2. Upload audio to storage
    const mime = blob.type || mimeRef.current || "audio/webm";
    const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
    const path = `${currentOrganizationId}/${id}.${ext}`;
    const up = await supabase.storage.from("call-recordings").upload(path, blob, {
      contentType: mime,
      upsert: true,
    });
    if (up.error) throw new Error(`Upload mislukt: ${up.error.message}`);

    // 3. Process
    setRecState("processing");
    const res = await processRec({
      data: {
        recording_id: id,
        audio_path: path,
        audio_mime: mime,
        duration_seconds: duration,
      },
    });

    setReport(res.report_markdown);
    setTranscript(res.transcript);
    setTasksCreated(res.tasks_created);
    setSuggestedStage(res.suggested_stage ?? null);
    setRecState("done");
    toast.success("Verslag klaar");

    // Refresh history
    const hist = await listRec({ data: { organization_id: currentOrganizationId, limit: 10 } });
    setHistory(hist.rows);
  }

  function reset() {
    setRecState("idle");
    setDurationSec(0);
    setReport(null);
    setTranscript(null);
    setErrorMsg(null);
    setAudioLevel(0);
  }

  const isRecording = recState === "recording";
  const isPaused = recState === "paused";
  const isBusy = recState === "uploading" || recState === "processing";
  const canStart = recState === "idle" && selectedTarget && currentOrganizationId;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-24">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link to="/" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="h-3 w-3" />
              Terug
            </Link>
          </div>
          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight sm:text-3xl">
            AI Gesprek Recorder
          </h1>
          <p className="text-sm text-muted-foreground">
            Live opname, transcript en gestructureerd verslag voor{" "}
            {currentOrganization?.name ?? "je organisatie"}.
          </p>
        </div>
      </div>

      {/* Selectie */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1. Klant of lead koppelen</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-2">
            <Label>Klant / Lead</Label>
            <Select
              value={selectedKey}
              onValueChange={setSelectedKey}
              disabled={loadingTargets || isRecording || isBusy}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingTargets ? "Laden..." : "Selecteer klant of lead"} />
              </SelectTrigger>
              <SelectContent className="max-h-[50vh]">
                {leads.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                      Leads
                    </div>
                    {leads.map((l) => (
                      <SelectItem key={`lead:${l.id}`} value={`lead:${l.id}`}>
                        {l.label}
                        {l.sublabel ? ` — ${l.sublabel}` : ""}
                      </SelectItem>
                    ))}
                  </>
                )}
                {clients.length > 0 && (
                  <>
                    <div className="mt-1 px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                      Klanten
                    </div>
                    {clients.map((c) => (
                      <SelectItem key={`client:${c.id}`} value={`client:${c.id}`}>
                        {c.label}
                        {c.sublabel ? ` — ${c.sublabel}` : ""}
                      </SelectItem>
                    ))}
                  </>
                )}
                {!loadingTargets && leads.length === 0 && clients.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">Nog geen klanten of leads.</div>
                )}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setNewLeadOpen(true)}
              disabled={isRecording || isBusy}
            >
              <Plus className="mr-1 h-4 w-4" />
              Nieuwe lead aanmaken
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Workflow / dealfase</Label>
              <Select
                value={workflowStage}
                onValueChange={setWorkflowStage}
                disabled={isRecording || isBusy}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Geen" />
                </SelectTrigger>
                <SelectContent>
                  {WORKFLOW_STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Titel (optioneel)</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="bv. Kennismakingsgesprek"
                disabled={isRecording || isBusy}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recorder */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">2. Opname</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:p-6">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {isRecording && (
                  <span className="relative flex h-3 w-3 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                  </span>
                )}
                <div className="min-w-0">
                  <div className="text-xs uppercase text-muted-foreground">
                    {recState === "idle" && "Klaar om op te nemen"}
                    {recState === "recording" && "Opnemen..."}
                    {recState === "paused" && "Gepauzeerd"}
                    {recState === "uploading" && "Uploaden..."}
                    {recState === "processing" && "AI analyseert..."}
                    {recState === "done" && "Verslag klaar"}
                    {recState === "error" && "Fout"}
                  </div>
                  <div className="font-mono text-3xl tabular-nums sm:text-4xl">
                    {formatDuration(durationSec)}
                  </div>
                </div>
              </div>
              {isBusy && <Loader2 className="h-6 w-6 shrink-0 animate-spin text-muted-foreground" />}
            </div>

            {/* Wave / level */}
            <div className="flex h-14 items-center justify-center gap-1 rounded-lg bg-background/60 px-3">
              {Array.from({ length: 32 }).map((_, i) => {
                const center = 16;
                const dist = Math.abs(i - center) / center;
                const active = isRecording || isPaused;
                const base = active ? 0.15 : 0.08;
                const noise = active ? audioLevel * (1 - dist * 0.6) : 0;
                const h = Math.max(0.08, base + noise + (active ? Math.random() * audioLevel * 0.3 : 0));
                return (
                  <span
                    key={i}
                    className={
                      "w-1.5 rounded-full transition-all " +
                      (active ? "bg-primary" : "bg-muted-foreground/30")
                    }
                    style={{ height: `${Math.min(100, h * 100)}%` }}
                  />
                );
              })}
            </div>

            {/* Controls */}
            {recState === "idle" && (
              <Button
                size="lg"
                className="h-16 w-full text-lg"
                onClick={startRecording}
                disabled={!canStart}
              >
                <Mic className="mr-2 h-6 w-6" />
                Start gesprek
              </Button>
            )}

            {(isRecording || isPaused) && (
              <div className="grid grid-cols-2 gap-3">
                {isRecording ? (
                  <Button size="lg" variant="outline" className="h-14" onClick={pauseRecording}>
                    <Pause className="mr-2 h-5 w-5" />
                    Pauze
                  </Button>
                ) : (
                  <Button size="lg" variant="outline" className="h-14" onClick={resumeRecording}>
                    <Play className="mr-2 h-5 w-5" />
                    Hervat
                  </Button>
                )}
                <Button
                  size="lg"
                  variant="destructive"
                  className="h-14"
                  onClick={stopRecording}
                >
                  <Square className="mr-2 h-5 w-5" />
                  Stop gesprek
                </Button>
              </div>
            )}

            {(recState === "done" || recState === "error") && (
              <Button variant="outline" size="lg" className="w-full" onClick={reset}>
                Nieuwe opname
              </Button>
            )}

            {errorMsg && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Verslag */}
      {(isBusy || report) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              3. AI-verslag
              {report && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {isBusy && !report && (
              <div className="space-y-2">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-10/12" />
                <div className="text-xs text-muted-foreground">
                  {recState === "uploading" ? "Audio uploaden..." : "Transcriberen en analyseren..."}
                </div>
              </div>
            )}
            {report && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {tasksCreated} {tasksCreated === 1 ? "taak" : "taken"} aangemaakt
                  </Badge>
                  {suggestedStage && (
                    <Badge variant="outline">Voorgestelde fase: {suggestedStage}</Badge>
                  )}
                </div>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{report}</ReactMarkdown>
                </div>
                {transcript && (
                  <details className="rounded-md border p-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      Volledig transcript
                    </summary>
                    <Textarea
                      className="mt-3 min-h-[200px] font-mono text-xs"
                      value={transcript}
                      readOnly
                    />
                  </details>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recente opnames */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recente opnames</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nog geen opnames.</div>
          ) : (
            <ul className="divide-y">
              {history.map((h) => (
                <li key={h.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {h.title ?? "Gesprek"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {h.summary ?? "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">
                      {new Date(h.created_at).toLocaleString("nl-NL", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <Badge
                      variant={
                        h.status === "ready"
                          ? "secondary"
                          : h.status === "error"
                            ? "destructive"
                            : "outline"
                      }
                      className="mt-1 text-[10px]"
                    >
                      {h.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <QuickLeadDialog
        open={newLeadOpen}
        onOpenChange={setNewLeadOpen}
        orgId={currentOrganizationId}
        onCreated={(lead) => {
          const t: Target = { kind: "lead", id: lead.id, label: lead.name, sublabel: lead.company ?? undefined };
          setLeads((prev) => [t, ...prev]);
          setSelectedKey(`lead:${lead.id}`);
        }}
        createLead={createLead}
      />
    </div>
  );
}

function QuickLeadDialog({
  open,
  onOpenChange,
  orgId,
  onCreated,
  createLead,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string | null;
  onCreated: (lead: { id: string; name: string; company: string | null }) => void;
  createLead: ReturnType<typeof useServerFn<typeof quickCreateLead>>;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!orgId) return;
    if (!name.trim()) {
      toast.error("Naam is verplicht");
      return;
    }
    setSaving(true);
    try {
      const row = await createLead({
        data: {
          organization_id: orgId,
          name: name.trim(),
          company: company.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
        },
      });
      onCreated(row);
      toast.success("Lead aangemaakt");
      setName("");
      setCompany("");
      setEmail("");
      setPhone("");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kon lead niet aanmaken");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nieuwe lead</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label>Naam contact *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid gap-2">
            <Label>Bedrijf</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Telefoon</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuleren
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
