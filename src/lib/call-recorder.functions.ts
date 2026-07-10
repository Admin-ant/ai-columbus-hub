import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LOVABLE_CHAT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_STT = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";
const STT_MODEL = "openai/gpt-4o-mini-transcribe";
const CHAT_MODEL = "google/gemini-2.5-flash";
const VALID_STAGES = ["nieuw", "in_gesprek", "voorstel", "onderhandeling", "gewonnen", "verloren"];

/* ============================================================ create row */

export const createCallRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organization_id: z.string().uuid(),
        lead_id: z.string().uuid().nullable().optional(),
        client_id: z.string().uuid().nullable().optional(),
        workflow_stage: z.string().max(200).nullable().optional(),
        title: z.string().max(300).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("call_recordings" as never)
      .insert({
        organization_id: data.organization_id,
        lead_id: data.lead_id ?? null,
        client_id: data.client_id ?? null,
        workflow_stage: data.workflow_stage ?? null,
        title: data.title ?? null,
        status: "draft",
        progress_stage: "draft",
        created_by: userId,
      } as never)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { id: (row as unknown as { id: string }).id };
  });

/* ============================================================ process */

function extFromMime(mime: string): string {
  const m = mime.split(";")[0].trim().toLowerCase();
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("ogg")) return "ogg";
  return "webm";
}

export const processCallRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        recording_id: z.string().uuid(),
        audio_path: z.string().min(1),
        audio_mime: z.string().min(1),
        duration_seconds: z.number().int().min(0).max(60 * 60 * 4),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ontbreekt");

    const { data: recRaw, error: recErr } = await supabase
      .from("call_recordings" as never)
      .select("id, organization_id, lead_id, client_id, workflow_stage, title")
      .eq("id", data.recording_id)
      .maybeSingle();
    if (recErr) throw new Error(recErr.message);
    if (!recRaw) throw new Error("Opname niet gevonden");
    const rec = recRaw as unknown as {
      id: string; organization_id: string; lead_id: string | null; client_id: string | null;
      workflow_stage: string | null; title: string | null;
    };

    await supabase
      .from("call_recordings" as never)
      .update({
        status: "processing",
        progress_stage: "transcribing",
        audio_path: data.audio_path,
        audio_mime: data.audio_mime,
        duration_seconds: data.duration_seconds,
        error: null,
      } as never)
      .eq("id", rec.id);

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const dl = await supabaseAdmin.storage.from("call-recordings").download(data.audio_path);
      if (dl.error || !dl.data) throw new Error(`Audio niet gevonden: ${dl.error?.message}`);
      const blob = dl.data;
      if (blob.size < 1024) throw new Error("Opname is leeg of te kort");

      // 1. Transcribe
      const form = new FormData();
      form.append("model", STT_MODEL);
      form.append("language", "nl");
      form.append("file", blob, `opname.${extFromMime(data.audio_mime)}`);
      const sttRes = await fetch(LOVABLE_STT, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!sttRes.ok) {
        const t = await sttRes.text();
        throw new Error(`Transcriptie mislukt (${sttRes.status}): ${t.slice(0, 200)}`);
      }
      const transcript = (((await sttRes.json()) as { text?: string }).text ?? "").trim();
      if (!transcript) throw new Error("Geen tekst gedetecteerd in opname");

      await supabase
        .from("call_recordings" as never)
        .update({ progress_stage: "analyzing", transcript } as never)
        .eq("id", rec.id);

      // 2. Analyze
      const system = `Je bent een senior sales/CS-analist voor een Nederlands MKB. Antwoord UITSLUITEND met geldige JSON:
{
  "summary": string,
  "report_markdown": string,
  "tasks": [{ "title": string, "body": string, "due_in_days": number }],
  "suggested_stage": string | null
}
report_markdown moet EXACT deze secties bevatten:
### 🏢 1. Kern van het gesprek
### 🎯 2. Wat wil de klant specifiek?
### 🤝 3. Gemaakte afspraken & Vervolgacties
### 💰 4. Commerciële kansen & Workflow-advies

suggested_stage moet zijn: nieuw, in_gesprek, voorstel, onderhandeling, gewonnen, verloren of null. Max 6 tasks. Alles NL. Geen markdown-fences.`;

      const chatRes = await fetch(LOVABLE_CHAT, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: `Context: klant/lead = ${rec.title ?? "—"}, workflow-fase = ${rec.workflow_stage ?? "—"}.\n\nTranscript:\n${transcript.slice(0, 24000)}`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!chatRes.ok) {
        const t = await chatRes.text();
        throw new Error(`AI-rapport mislukt (${chatRes.status}): ${t.slice(0, 200)}`);
      }
      const chatJson = (await chatRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = chatJson.choices?.[0]?.message?.content ?? "{}";
      let parsed: {
        summary?: string; report_markdown?: string;
        tasks?: Array<{ title?: string; body?: string; due_in_days?: number }>;
        suggested_stage?: string | null;
      };
      try { parsed = JSON.parse(raw); }
      catch { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; }

      const summary = (parsed.summary ?? "").slice(0, 300);
      const report = parsed.report_markdown ?? "";
      const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.slice(0, 6).map((t) => ({
        title: (t.title ?? "").slice(0, 200),
        body: (t.body ?? "").slice(0, 1000),
        due_in_days: typeof t.due_in_days === "number" ? t.due_in_days : 3,
      })) : [];
      const stage = parsed.suggested_stage && VALID_STAGES.includes(parsed.suggested_stage) ? parsed.suggested_stage : null;

      await supabase
        .from("call_recordings" as never)
        .update({
          status: "review",
          progress_stage: "review",
          transcript,
          final_transcript: transcript,
          report_markdown: report,
          summary,
          suggested_stage: stage,
          pending_tasks: tasks,
          error: null,
        } as never)
        .eq("id", rec.id);

      return { ok: true, recording_id: rec.id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("call_recordings" as never)
        .update({ status: "error", progress_stage: "error", error: msg } as never)
        .eq("id", data.recording_id);
      throw new Error(msg);
    }
  });

/* ============================================================ finalize */

export const finalizeCallRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        recording_id: z.string().uuid(),
        transcript: z.string().min(1),
        report_markdown: z.string(),
        summary: z.string().max(300).optional().nullable(),
        tasks: z.array(z.object({
          title: z.string().min(1).max(200),
          body: z.string().max(2000).optional().nullable(),
          due_in_days: z.number().int().min(0).max(365).default(3),
        })).max(30),
        suggested_stage: z.string().nullable().optional(),
        apply_stage: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: recRaw, error: recErr } = await supabase
      .from("call_recordings" as never)
      .select("id, organization_id, lead_id, client_id")
      .eq("id", data.recording_id)
      .maybeSingle();
    if (recErr) throw new Error(recErr.message);
    if (!recRaw) throw new Error("Opname niet gevonden");
    const rec = recRaw as unknown as { id: string; organization_id: string; lead_id: string | null; client_id: string | null };

    // Load enabled rules and apply against transcript
    const { data: rulesRaw } = await supabase
      .from("call_recorder_rules" as never)
      .select("id, name, keywords, action_kind, task_title, task_body, task_due_days, target_stage, priority")
      .eq("organization_id", rec.organization_id)
      .eq("enabled", true)
      .order("priority", { ascending: true });
    const rules = (rulesRaw ?? []) as unknown as Array<{
      id: string; name: string; keywords: string[]; action_kind: string;
      task_title: string | null; task_body: string | null; task_due_days: number;
      target_stage: string | null; priority: number;
    }>;

    const haystack = (data.transcript + "\n" + data.report_markdown).toLowerCase();
    const extraTasks: Array<{ title: string; body: string | null; due_in_days: number }> = [];
    let ruleStage: string | null = null;
    for (const r of rules) {
      const hit = (r.keywords ?? []).some((k) => k && haystack.includes(k.toLowerCase()));
      if (!hit) continue;
      if (r.action_kind === "create_task" && r.task_title) {
        extraTasks.push({
          title: r.task_title,
          body: r.task_body ?? `Automatisch aangemaakt door regel: ${r.name}`,
          due_in_days: r.task_due_days ?? 3,
        });
      } else if (r.action_kind === "set_stage" && r.target_stage && VALID_STAGES.includes(r.target_stage) && !ruleStage) {
        ruleStage = r.target_stage;
      }
    }

    const allTasks = [...data.tasks, ...extraTasks];
    let tasksCreated = 0;
    for (const t of allTasks) {
      const dueAt = new Date(Date.now() + t.due_in_days * 86400000).toISOString();
      const { error: tErr } = await supabase.from("crm_activities").insert({
        organization_id: rec.organization_id,
        target_id: null,
        client_id: rec.client_id,
        kind: "task",
        title: t.title,
        body: t.body ?? null,
        due_at: dueAt,
        done: false,
        created_by: userId,
      } as never);
      if (!tErr) tasksCreated += 1;
    }

    const finalStage = data.apply_stage
      ? (ruleStage ?? (data.suggested_stage && VALID_STAGES.includes(data.suggested_stage) ? data.suggested_stage : null))
      : null;
    if (rec.lead_id) {
      const upd: Record<string, unknown> = { last_contact_at: new Date().toISOString() };
      if (finalStage) upd.stage = finalStage;
      await supabase.from("leads").update(upd as never).eq("id", rec.lead_id);
    }

    await supabase
      .from("call_recordings" as never)
      .update({
        status: "ready",
        progress_stage: "done",
        transcript: data.transcript,
        final_transcript: data.transcript,
        report_markdown: data.report_markdown,
        summary: data.summary ?? null,
        suggested_stage: finalStage,
        tasks_created: tasksCreated,
        pending_tasks: [],
        finalized_at: new Date().toISOString(),
      } as never)
      .eq("id", rec.id);

    return { ok: true, tasks_created: tasksCreated, applied_stage: finalStage };
  });

/* ============================================================ list */

export const listCallRecordings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organization_id: z.string().uuid(),
        lead_id: z.string().uuid().nullable().optional(),
        client_id: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("call_recordings" as never)
      .select("id, title, summary, status, progress_stage, duration_seconds, tasks_created, suggested_stage, workflow_stage, lead_id, client_id, transcript, report_markdown, created_at, finalized_at")
      .eq("organization_id", data.organization_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.lead_id) q = q.eq("lead_id", data.lead_id);
    if (data.client_id) q = q.eq("client_id", data.client_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return {
      rows: (rows ?? []) as unknown as Array<{
        id: string; title: string | null; summary: string | null; status: string;
        progress_stage: string | null; duration_seconds: number | null; tasks_created: number;
        suggested_stage: string | null; workflow_stage: string | null;
        lead_id: string | null; client_id: string | null; transcript: string | null;
        report_markdown: string | null;
        created_at: string; finalized_at: string | null;
      }>,
    };
  });

/* ============================================================ signed url */

export const getRecordingAudioUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rec, error } = await supabase
      .from("call_recordings" as never)
      .select("audio_path, audio_mime, title")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!rec) throw new Error("Opname niet gevonden");
    const r = rec as unknown as { audio_path: string | null; audio_mime: string | null; title: string | null };
    if (!r.audio_path) throw new Error("Nog geen audio beschikbaar");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const filename = `${(r.title ?? "opname").replace(/[^\w\-]+/g, "_")}.${(r.audio_path.split(".").pop() ?? "webm")}`;
    const play = await supabaseAdmin.storage.from("call-recordings").createSignedUrl(r.audio_path, 3600);
    const dl = await supabaseAdmin.storage.from("call-recordings").createSignedUrl(r.audio_path, 3600, { download: filename });
    if (play.error || !play.data) throw new Error(play.error?.message ?? "Kon URL niet maken");
    return {
      play_url: play.data.signedUrl,
      download_url: dl.data?.signedUrl ?? play.data.signedUrl,
      mime: r.audio_mime ?? "audio/webm",
      filename,
    };
  });

/* ============================================================ rules CRUD */

export type CallRecorderRule = {
  id: string;
  organization_id: string;
  name: string;
  keywords: string[];
  action_kind: "create_task" | "set_stage";
  task_title: string | null;
  task_body: string | null;
  task_due_days: number;
  target_stage: string | null;
  priority: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export const listCallRecorderRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organization_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ rows: CallRecorderRule[] }> => {
    const { data: rows, error } = await context.supabase
      .from("call_recorder_rules" as never)
      .select("*")
      .eq("organization_id", data.organization_id)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as unknown as CallRecorderRule[] };
  });


export const upsertCallRecorderRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        organization_id: z.string().uuid(),
        name: z.string().min(1).max(200),
        keywords: z.array(z.string().min(1).max(200)).max(50),
        action_kind: z.enum(["create_task", "set_stage"]),
        task_title: z.string().max(200).nullable().optional(),
        task_body: z.string().max(2000).nullable().optional(),
        task_due_days: z.number().int().min(0).max(365).default(3),
        target_stage: z.string().max(50).nullable().optional(),
        priority: z.number().int().min(0).max(9999).default(100),
        enabled: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      organization_id: data.organization_id,
      name: data.name,
      keywords: data.keywords,
      action_kind: data.action_kind,
      task_title: data.task_title ?? null,
      task_body: data.task_body ?? null,
      task_due_days: data.task_due_days,
      target_stage: data.target_stage ?? null,
      priority: data.priority,
      enabled: data.enabled,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("call_recorder_rules" as never)
        .update(payload as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("call_recorder_rules" as never)
      .insert({ ...payload, created_by: context.userId } as never)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { id: (row as unknown as { id: string }).id };
  });

export const deleteCallRecorderRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("call_recorder_rules" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================================================ quick lead */

export const quickCreateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organization_id: z.string().uuid(),
        name: z.string().min(1).max(200),
        company: z.string().max(200).optional().nullable(),
        email: z.string().max(200).optional().nullable(),
        phone: z.string().max(50).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("leads")
      .insert({
        organization_id: data.organization_id,
        name: data.name,
        company: data.company ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        stage: "nieuw",
        source: "handmatig",
        created_by: userId,
      } as never)
      .select("id, name, company")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as { id: string; name: string; company: string | null };
  });

/* ============================================================ quick client */

export const quickCreateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organization_id: z.string().uuid(),
        name: z.string().min(1).max(200),
        contact_person: z.string().max(200).optional().nullable(),
        email: z.string().max(200).optional().nullable(),
        phone: z.string().max(50).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("clients")
      .insert({
        organization_id: data.organization_id,
        name: data.name,
        contact_person: data.contact_person ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        created_by: userId,
      } as never)
      .select("id, name, contact_person")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as { id: string; name: string; contact_person: string | null };
  });
