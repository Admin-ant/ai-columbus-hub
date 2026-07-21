import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Mic, Pause, Play, Square, Loader2, CheckCircle2, AlertCircle, Plus, ArrowLeft,
  Settings, Download, RefreshCw, X, ChevronDown, ChevronRight, Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  createCallRecording, processCallRecording, finalizeCallRecording,
  listCallRecordings, quickCreateLead, quickCreateClient, getRecordingAudioUrl,
} from "@/lib/call-recorder.functions";
import { exportCallRecordingPdf, exportCallRecordingsBundle } from "@/lib/call-recording-pdf";
import { splitAudioIntoChunks } from "@/lib/wav-encoder";

const CHUNK_SECONDS = 300; // 5 minutes per STT chunk

export const Route = createFileRoute("/_authenticated/opname")({
  head: () => ({ meta: [{ title: "AI Gesprek Recorder" }] }),
  component: OpnamePage,
});

type TargetKind = "lead" | "client";
type Target = { kind: TargetKind; id: string; label: string; sublabel?: string };
type RecState = "idle" | "recording" | "paused" | "uploading" | "transcribing" | "analyzing" | "review" | "finalizing" | "done" | "error";
type Task = { title: string; body: string; due_in_days: number };
type AudioChunk = { path: string; mime: string };
type HistoryRow = Awaited<ReturnType<typeof listCallRecordings>>["rows"][number];

const WORKFLOW_STAGES = [
  { value: "nieuwe", label: "Nieuw" },
  { value: "contact_opgenomen", label: "Contact opgenomen" },
  { value: "op_afspraak", label: "Op afspraak" },
  { value: "in_contact", label: "In gesprek" },
  { value: "in_afwachting", label: "In afwachting" },
  { value: "even_on_hold", label: "Even on hold" },
  { value: "offerte_verzonden", label: "Offerte verzonden" },
  { value: "gewonnen", label: "Gewonnen" },
  { value: "verloren", label: "Verloren" },
];

const PROGRESS_STEPS: { key: RecState; label: string }[] = [
  { key: "uploading", label: "Upload" },
  { key: "transcribing", label: "Transcriberen" },
  { key: "analyzing", label: "AI-analyse" },
  { key: "review", label: "Nakijken" },
  { key: "done", label: "Klaar" },
];

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
function pickMimeType(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const t of types) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
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
  const [newClientOpen, setNewClientOpen] = useState(false);

  const [recState, setRecState] = useState<RecState>("idle");
  const [durationSec, setDurationSec] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Review data
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [editTranscript, setEditTranscript] = useState("");
  const [editReport, setEditReport] = useState("");
  const [editTasks, setEditTasks] = useState<Task[]>([]);
  const [editStage, setEditStage] = useState<string | null>(null);
  const [applyStage, setApplyStage] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  // Last processed context (for retry)
  const [lastAudio, setLastAudio] = useState<{ path: string; mime: string; duration: number; chunks?: AudioChunk[] } | null>(null);
  const [chunkProgress, setChunkProgress] = useState<{ current: number; total: number } | null>(null);

  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyFilter, setHistoryFilter] = useState<"all" | "current">("all");
  const [detailOpen, setDetailOpen] = useState<string | null>(null);

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
  const finalizeRec = useServerFn(finalizeCallRecording);
  const listRec = useServerFn(listCallRecordings);
  const createLead = useServerFn(quickCreateLead);
  const createClient = useServerFn(quickCreateClient);

  const selectedTarget: Target | null = useMemo(() => {
    if (!selectedKey) return null;
    const [kind, id] = selectedKey.split(":");
    const pool = kind === "lead" ? leads : clients;
    return pool.find((t) => t.id === id) ?? null;
  }, [selectedKey, leads, clients]);

  const refreshHistory = useCallback(async () => {
    if (!currentOrganizationId) return;
    const filter =
      historyFilter === "current" && selectedTarget
        ? selectedTarget.kind === "lead"
          ? { lead_id: selectedTarget.id }
          : { client_id: selectedTarget.id }
        : {};
    try {
      const hist = await listRec({ data: { organization_id: currentOrganizationId, limit: 30, ...filter } });
      setHistory(hist.rows);
    } catch { /* noop */ }
  }, [currentOrganizationId, historyFilter, selectedTarget, listRec]);

  useEffect(() => {
    if (!currentOrganizationId) return;
    let alive = true;
    (async () => {
      setLoadingTargets(true);
      const [leadsRes, clientsRes] = await Promise.all([
        supabase.from("leads").select("id, name, company").eq("organization_id", currentOrganizationId).order("created_at", { ascending: false }).limit(200),
        supabase.from("clients").select("id, name, contact_person").eq("organization_id", currentOrganizationId).order("name").limit(200),
      ]);
      if (!alive) return;
      setLeads((leadsRes.data ?? []).map((l: { id: string; name: string; company: string | null }) => ({ kind: "lead" as const, id: l.id, label: l.name, sublabel: l.company ?? undefined })));
      setClients((clientsRes.data ?? []).map((c: { id: string; name: string; contact_person: string | null }) => ({ kind: "client" as const, id: c.id, label: c.name, sublabel: c.contact_person ?? undefined })));
      setLoadingTargets(false);
    })();
    return () => { alive = false; };
  }, [currentOrganizationId]);

  useEffect(() => { void refreshHistory(); }, [refreshHistory]);

  function cleanupStream() {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; analyserRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }
  useEffect(() => cleanupStream, []);

  async function startRecording() {
    setErrorMsg(null); setRecordingId(null); setEditTranscript(""); setEditReport(""); setEditTasks([]); setEditStage(null); setLastAudio(null);
    if (!currentOrganizationId) { toast.error("Geen actieve organisatie"); return; }
    if (!selectedTarget) { toast.error("Selecteer eerst een klant of lead"); return; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
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
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        setAudioLevel(Math.min(1, Math.sqrt(sum / data.length) * 3));
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();

      const mime = pickMimeType();
      mimeRef.current = mime;
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorderRef.current = mr;
      mr.start();

      accumulatedMsRef.current = 0;
      startedAtRef.current = Date.now();
      setDurationSec(0);
      timerRef.current = setInterval(() => {
        setDurationSec(Math.floor((accumulatedMsRef.current + (Date.now() - startedAtRef.current)) / 1000));
      }, 250);
      setRecState("recording");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Microfoon kon niet worden geopend";
      setErrorMsg(msg); setRecState("error"); cleanupStream(); toast.error(msg);
    }
  }

  function pauseRecording() {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === "recording") {
      mr.pause();
      accumulatedMsRef.current += Date.now() - startedAtRef.current;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setRecState("paused");
    }
  }
  function resumeRecording() {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === "paused") {
      mr.resume();
      startedAtRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setDurationSec(Math.floor((accumulatedMsRef.current + (Date.now() - startedAtRef.current)) / 1000));
      }, 250);
      setRecState("recording");
    }
  }

  async function stopRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;
    const finalDuration = Math.max(1, Math.floor(
      (accumulatedMsRef.current + (mr.state === "recording" ? Date.now() - startedAtRef.current : 0)) / 1000,
    ));
    const stopped: Promise<Blob> = new Promise((resolve) => {
      mr.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeRef.current }));
      mr.stop();
    });
    setRecState("uploading");
    cleanupStream();
    try {
      const blob = await stopped;
      if (blob.size < 2048) throw new Error("Opname is te kort of leeg — probeer opnieuw");
      await uploadAndProcess(blob, finalDuration);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg); setRecState("error"); toast.error(msg);
    }
  }

  async function uploadAndProcess(blob: Blob, duration: number) {
    if (!currentOrganizationId || !selectedTarget) throw new Error("Geen klant/lead geselecteerd");

    const { id } = await createRec({
      data: {
        organization_id: currentOrganizationId,
        lead_id: selectedTarget.kind === "lead" ? selectedTarget.id : null,
        client_id: selectedTarget.kind === "client" ? selectedTarget.id : null,
        workflow_stage: workflowStage || null,
        title: title || `Gesprek — ${selectedTarget.label}`,
      },
    });
    setRecordingId(id);

    const mime = blob.type || mimeRef.current || "audio/webm";
    const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
    const path = `${currentOrganizationId}/${id}.${ext}`;
    const up = await supabase.storage.from("call-recordings").upload(path, blob, { contentType: mime, upsert: true });
    if (up.error) throw new Error(`Upload mislukt: ${up.error.message}`);

    setLastAudio({ path, mime, duration });
    await runProcess(id, path, mime, duration);
  }

  async function runProcess(id: string, path: string, mime: string, duration: number) {
    setRecState("transcribing");
    // Poll progress in background
    const poll = setInterval(async () => {
      const { data: rp } = await supabase
        .from("call_recordings" as never)
        .select("progress_stage,status")
        .eq("id", id)
        .maybeSingle();
      const row = rp as unknown as { progress_stage: string | null; status: string } | null;
      if (row?.progress_stage === "analyzing") setRecState((s) => (s === "transcribing" ? "analyzing" : s));
    }, 1500);

    try {
      await processRec({ data: { recording_id: id, audio_path: path, audio_mime: mime, duration_seconds: duration } });
      clearInterval(poll);
      // Load review data
      const { data: rd } = await supabase
        .from("call_recordings" as never)
        .select("transcript,report_markdown,summary,pending_tasks,suggested_stage")
        .eq("id", id)
        .maybeSingle();
      const rec = rd as unknown as {
        transcript: string | null; report_markdown: string | null; summary: string | null;
        pending_tasks: Task[] | null; suggested_stage: string | null;
      } | null;
      setEditTranscript(rec?.transcript ?? "");
      setEditReport(rec?.report_markdown ?? "");
      setEditTasks(Array.isArray(rec?.pending_tasks) ? rec!.pending_tasks : []);
      setEditStage(rec?.suggested_stage ?? null);
      setRecState("review");
      toast.success("Verslag klaar — controleer en bevestig");
    } catch (e) {
      clearInterval(poll);
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg); setRecState("error"); toast.error(msg);
    }
  }

  async function retryProcess() {
    if (!recordingId || !lastAudio) return;
    setErrorMsg(null);
    await runProcess(recordingId, lastAudio.path, lastAudio.mime, lastAudio.duration);
  }

  async function finalize() {
    if (!recordingId) return;
    if (!editTranscript.trim()) { toast.error("Transcript is leeg"); return; }
    setRecState("finalizing");
    try {
      const res = await finalizeRec({
        data: {
          recording_id: recordingId,
          transcript: editTranscript,
          report_markdown: editReport,
          summary: editReport.split("\n").find((l) => l.trim())?.slice(0, 200) ?? null,
          tasks: editTasks.filter((t) => t.title.trim()),
          suggested_stage: editStage,
          apply_stage: applyStage,
        },
      });
      setRecState("done");
      toast.success(`Opgeslagen — ${res.tasks_created} taken aangemaakt${res.applied_stage ? `, lead-fase → ${res.applied_stage}` : ""}`);
      await refreshHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg); setRecState("review"); toast.error(msg);
    }
  }

  function reset() {
    setRecState("idle"); setDurationSec(0); setEditTranscript(""); setEditReport("");
    setEditTasks([]); setEditStage(null); setErrorMsg(null); setAudioLevel(0);
    setRecordingId(null); setLastAudio(null);
  }

  const isRecording = recState === "recording";
  const isPaused = recState === "paused";
  const isBusy = recState === "uploading" || recState === "transcribing" || recState === "analyzing" || recState === "finalizing";
  const canStart = recState === "idle" && selectedTarget && currentOrganizationId;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-24">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Terug
          </Link>
          <h1 className="mt-1 truncate text-2xl font-bold sm:text-3xl">AI Gesprek Recorder</h1>
          <p className="text-sm text-muted-foreground">
            Live opname, transcript en verslag voor {currentOrganization?.name ?? "je organisatie"}.
          </p>
        </div>
        <Link to="/opname/regels">
          <Button variant="outline" size="sm"><Settings className="mr-1 h-4 w-4" /> Regels</Button>
        </Link>
      </div>

      {/* Selectie */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">1. Klant of lead koppelen</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-2">
            <Label>Klant / Lead</Label>
            <Select value={selectedKey} onValueChange={setSelectedKey} disabled={loadingTargets || isRecording || isBusy}>
              <SelectTrigger><SelectValue placeholder={loadingTargets ? "Laden..." : "Selecteer klant of lead"} /></SelectTrigger>
              <SelectContent className="max-h-[50vh]">
                {leads.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">Leads</div>
                    {leads.map((l) => (
                      <SelectItem key={`lead:${l.id}`} value={`lead:${l.id}`}>
                        {l.label}{l.sublabel ? ` — ${l.sublabel}` : ""}
                      </SelectItem>
                    ))}
                  </>
                )}
                {clients.length > 0 && (
                  <>
                    <div className="mt-1 px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">Klanten</div>
                    {clients.map((c) => (
                      <SelectItem key={`client:${c.id}`} value={`client:${c.id}`}>
                        {c.label}{c.sublabel ? ` — ${c.sublabel}` : ""}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setNewLeadOpen(true)} disabled={isRecording || isBusy}>
                <Plus className="mr-1 h-4 w-4" /> Nieuwe lead
              </Button>
              <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setNewClientOpen(true)} disabled={isRecording || isBusy}>
                <Plus className="mr-1 h-4 w-4" /> Nieuwe klant
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Workflow / dealfase</Label>
              <Select value={workflowStage} onValueChange={setWorkflowStage} disabled={isRecording || isBusy}>
                <SelectTrigger><SelectValue placeholder="Geen" /></SelectTrigger>
                <SelectContent>
                  {WORKFLOW_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Titel (optioneel)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="bv. Kennismakingsgesprek" disabled={isRecording || isBusy} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recorder */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">2. Opname</CardTitle></CardHeader>
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
                    {recState === "transcribing" && "Transcriberen..."}
                    {recState === "analyzing" && "AI analyseert..."}
                    {recState === "review" && "Klaar voor review"}
                    {recState === "finalizing" && "Opslaan..."}
                    {recState === "done" && "Definitief opgeslagen"}
                    {recState === "error" && "Fout"}
                  </div>
                  <div className="font-mono text-3xl tabular-nums sm:text-4xl">{formatDuration(durationSec)}</div>
                </div>
              </div>
              {isBusy && <Loader2 className="h-6 w-6 shrink-0 animate-spin text-muted-foreground" />}
            </div>

            <div className="flex h-14 items-center justify-center gap-1 rounded-lg bg-background/60 px-3">
              {Array.from({ length: 32 }).map((_, i) => {
                const center = 16;
                const dist = Math.abs(i - center) / center;
                const active = isRecording || isPaused;
                const base = active ? 0.15 : 0.08;
                const noise = active ? audioLevel * (1 - dist * 0.6) : 0;
                const h = Math.max(0.08, base + noise + (active ? Math.random() * audioLevel * 0.3 : 0));
                return (
                  <span key={i} className={"w-1.5 rounded-full transition-all " + (active ? "bg-primary" : "bg-muted-foreground/30")} style={{ height: `${Math.min(100, h * 100)}%` }} />
                );
              })}
            </div>

            {recState === "idle" && (
              <Button size="lg" className="h-16 w-full text-lg" onClick={startRecording} disabled={!canStart}>
                <Mic className="mr-2 h-6 w-6" /> Start gesprek
              </Button>
            )}
            {(isRecording || isPaused) && (
              <div className="grid grid-cols-2 gap-3">
                {isRecording ? (
                  <Button size="lg" variant="outline" className="h-14" onClick={pauseRecording}><Pause className="mr-2 h-5 w-5" /> Pauze</Button>
                ) : (
                  <Button size="lg" variant="outline" className="h-14" onClick={resumeRecording}><Play className="mr-2 h-5 w-5" /> Hervat</Button>
                )}
                <Button size="lg" variant="destructive" className="h-14" onClick={stopRecording}><Square className="mr-2 h-5 w-5" /> Stop gesprek</Button>
              </div>
            )}
            {recState === "done" && (
              <Button variant="outline" size="lg" className="w-full" onClick={reset}>Nieuwe opname</Button>
            )}
            {recState === "error" && (
              <div className="grid gap-2">
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {lastAudio && recordingId && (
                    <Button variant="default" onClick={retryProcess}>
                      <RefreshCw className="mr-1 h-4 w-4" /> Opnieuw proberen
                    </Button>
                  )}
                  <Button variant="outline" onClick={reset}>Nieuwe opname</Button>
                </div>
              </div>
            )}
          </div>

          {/* Progress stepper */}
          {(isBusy || recState === "review" || recState === "done") && (
            <div className="grid gap-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {PROGRESS_STEPS.map((step, i) => {
                  const stateIdx = PROGRESS_STEPS.findIndex((s) => s.key === recState);
                  const isDoneStep = recState === "done";
                  const done = isDoneStep || (stateIdx >= 0 && i < stateIdx);
                  const active = !isDoneStep && step.key === recState;
                  return (
                    <div key={step.key} className="flex items-center gap-2">
                      <span className={
                        "flex h-6 w-6 items-center justify-center rounded-full border text-[10px] " +
                        (done ? "border-emerald-500 bg-emerald-500 text-white" :
                         active ? "border-primary bg-primary text-primary-foreground" :
                         "border-muted-foreground/30 text-muted-foreground")
                      }>
                        {done ? <CheckCircle2 className="h-3 w-3" /> : active ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
                      </span>
                      <span className={active ? "font-medium" : done ? "text-muted-foreground" : "text-muted-foreground/60"}>{step.label}</span>
                      {i < PROGRESS_STEPS.length - 1 && <span className="text-muted-foreground/30">→</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review / Edit */}
      {recState === "review" && recordingId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">3. Nakijken & bewerken</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label>Transcript (bewerkbaar)</Label>
              <Textarea value={editTranscript} onChange={(e) => setEditTranscript(e.target.value)} className="min-h-[180px] font-mono text-xs" />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>AI-rapport (markdown, bewerkbaar)</Label>
                <Button variant="ghost" size="sm" onClick={() => setShowPreview((v) => !v)}>
                  {showPreview ? "Bewerk" : "Preview"}
                </Button>
              </div>
              {showPreview ? (
                <div className="prose prose-sm max-w-none rounded-md border p-3 dark:prose-invert">
                  <ReactMarkdown>{editReport}</ReactMarkdown>
                </div>
              ) : (
                <Textarea value={editReport} onChange={(e) => setEditReport(e.target.value)} className="min-h-[220px] font-mono text-xs" />
              )}
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Taken die worden aangemaakt</Label>
                <Button variant="outline" size="sm" onClick={() => setEditTasks([...editTasks, { title: "", body: "", due_in_days: 3 }])}>
                  <Plus className="mr-1 h-3 w-3" /> Taak toevoegen
                </Button>
              </div>
              {editTasks.length === 0 && <div className="text-xs text-muted-foreground">Geen taken. Regels kunnen automatisch extra taken toevoegen.</div>}
              <div className="grid gap-2">
                {editTasks.map((t, i) => (
                  <div key={i} className="grid gap-2 rounded-md border p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-2">
                      <Input value={t.title} onChange={(e) => setEditTasks(editTasks.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} placeholder="Titel" />
                      <Input type="number" className="w-20" value={t.due_in_days} onChange={(e) => setEditTasks(editTasks.map((x, j) => j === i ? { ...x, due_in_days: Number(e.target.value) || 0 } : x))} title="Deadline (dagen)" />
                      <Button variant="ghost" size="icon" onClick={() => setEditTasks(editTasks.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                    </div>
                    <Textarea value={t.body} onChange={(e) => setEditTasks(editTasks.map((x, j) => j === i ? { ...x, body: e.target.value } : x))} rows={2} placeholder="Details" />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Lead-fase (voorstel)</Label>
                <Select value={editStage ?? "none"} onValueChange={(v) => setEditStage(v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— niet wijzigen —</SelectItem>
                    {WORKFLOW_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={applyStage} onChange={(e) => setApplyStage(e.target.checked)} />
                  Lead-fase toepassen
                </label>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={reset}>Annuleren</Button>
              <Button onClick={finalize}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Bevestig & sla op in Gespreksverslagen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Done — with audio */}
      {recState === "done" && recordingId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Opgeslagen
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <RecordingAudio id={recordingId} />
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{editReport}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historie */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Gespreksgeschiedenis</CardTitle>
            <div className="flex flex-wrap gap-1">
              <Button variant={historyFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setHistoryFilter("all")}>Alle</Button>
              <Button variant={historyFilter === "current" ? "default" : "outline"} size="sm" onClick={() => setHistoryFilter("current")} disabled={!selectedTarget}>
                {selectedTarget ? selectedTarget.label : "Deze klant/lead"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={history.length === 0}
                onClick={() => {
                  const label = historyFilter === "current" && selectedTarget ? selectedTarget.label : "alle";
                  exportCallRecordingsBundle(history, label);
                }}
              >
                <Download className="mr-1 h-4 w-4" /> Export PDF ({history.length})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nog geen opnames.</div>
          ) : (
            <ul className="divide-y">
              {history.map((h) => {
                const open = detailOpen === h.id;
                return (
                  <li key={h.id} className="py-3">
                    <button className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-left" onClick={() => setDetailOpen(open ? null : h.id)}>
                      {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{h.title ?? "Gesprek"}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {h.summary ?? (h.transcript ? h.transcript.slice(0, 120) + "…" : "—")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">
                          {new Date(h.created_at).toLocaleString("nl-NL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <Badge variant={h.status === "ready" ? "secondary" : h.status === "error" ? "destructive" : "outline"} className="mt-1 text-[10px]">
                          {h.status}
                        </Badge>
                      </div>
                    </button>
                    {open && (
                      <div className="mt-3 grid gap-3 rounded-md border p-3 bg-muted/30">
                        <RecordingAudio id={h.id} />
                        {h.transcript && (
                          <details>
                            <summary className="cursor-pointer text-xs font-medium">Transcript</summary>
                            <div className="mt-2 whitespace-pre-wrap rounded bg-background p-2 font-mono text-xs">{h.transcript}</div>
                          </details>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">{h.tasks_created} taken</Badge>
                          {h.suggested_stage && <Badge variant="outline">fase: {h.suggested_stage}</Badge>}
                          {h.duration_seconds && <Badge variant="outline">{formatDuration(h.duration_seconds)}</Badge>}
                          <Button
                            variant="outline"
                            size="sm"
                            className="ml-auto h-7"
                            onClick={(e) => { e.stopPropagation(); exportCallRecordingPdf(h, selectedTarget?.label ?? null); }}
                          >
                            <Download className="mr-1 h-3 w-3" /> PDF
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
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
      <QuickClientDialog
        open={newClientOpen}
        onOpenChange={setNewClientOpen}
        orgId={currentOrganizationId}
        onCreated={(client) => {
          const t: Target = { kind: "client", id: client.id, label: client.name, sublabel: client.contact_person ?? undefined };
          setClients((prev) => [t, ...prev]);
          setSelectedKey(`client:${client.id}`);
        }}
        createClient={createClient}
      />
    </div>
  );
}

function RecordingAudio({ id }: { id: string }) {
  const getUrl = useServerFn(getRecordingAudioUrl);
  const [state, setState] = useState<{ loading: boolean; url?: string; dl?: string; filename?: string; error?: string }>({ loading: true });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await getUrl({ data: { id } });
        if (!alive) return;
        setState({ loading: false, url: r.play_url, dl: r.download_url, filename: r.filename });
      } catch (e) {
        if (!alive) return;
        setState({ loading: false, error: e instanceof Error ? e.message : "Kon audio niet laden" });
      }
    })();
    return () => { alive = false; };
  }, [id, getUrl]);

  if (state.loading) return <Skeleton className="h-12 w-full" />;
  if (state.error) return <div className="text-xs text-muted-foreground">🎧 {state.error}</div>;
  return (
    <div className="grid gap-2">
      <audio controls src={state.url} className="w-full" preload="metadata" />
      {state.dl && (
        <a href={state.dl} download={state.filename} className="inline-flex w-fit items-center gap-1 text-xs text-primary hover:underline">
          <Download className="h-3 w-3" /> Download audio
        </a>
      )}
    </div>
  );
}

function QuickLeadDialog({
  open, onOpenChange, orgId, onCreated, createLead,
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
    if (!name.trim()) { toast.error("Naam is verplicht"); return; }
    setSaving(true);
    try {
      const row = await createLead({
        data: { organization_id: orgId, name: name.trim(), company: company.trim() || null, email: email.trim() || null, phone: phone.trim() || null },
      });
      onCreated(row);
      toast.success("Lead aangemaakt");
      setName(""); setCompany(""); setEmail(""); setPhone("");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kon lead niet aanmaken");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Nieuwe lead</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2"><Label>Naam contact *</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div className="grid gap-2"><Label>Bedrijf</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} /></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2"><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Telefoon</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuleren</Button>
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickClientDialog({
  open, onOpenChange, orgId, onCreated, createClient,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string | null;
  onCreated: (client: { id: string; name: string; contact_person: string | null }) => void;
  createClient: ReturnType<typeof useServerFn<typeof quickCreateClient>>;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!orgId) return;
    if (!name.trim()) { toast.error("Bedrijfsnaam is verplicht"); return; }
    setSaving(true);
    try {
      const row = await createClient({
        data: { organization_id: orgId, name: name.trim(), contact_person: contact.trim() || null, email: email.trim() || null, phone: phone.trim() || null },
      });
      onCreated(row);
      toast.success("Klant aangemaakt");
      setName(""); setContact(""); setEmail(""); setPhone("");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kon klant niet aanmaken");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Nieuwe klant</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2"><Label>Bedrijfsnaam *</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="bv. Acme B.V." /></div>
          <div className="grid gap-2"><Label>Contactpersoon</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} /></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2"><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Telefoon</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuleren</Button>
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Suppress unused import warning
void Trash2;
