import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LOVABLE_CHAT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_STT = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";

/* -------------------------------------------------------------------------- */
/* Create recording row                                                       */
/* -------------------------------------------------------------------------- */

const CreateSchema = z.object({
  organization_id: z.string().uuid(),
  lead_id: z.string().uuid().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  workflow_stage: z.string().max(200).nullable().optional(),
  title: z.string().max(300).nullable().optional(),
});

export const createCallRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const insert = {
      organization_id: data.organization_id,
      lead_id: data.lead_id ?? null,
      client_id: data.client_id ?? null,
      workflow_stage: data.workflow_stage ?? null,
      title: data.title ?? null,
      status: "draft",
      created_by: userId,
    };
    const { data: row, error } = await supabase
      .from("call_recordings" as never)
      .insert(insert as never)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

/* -------------------------------------------------------------------------- */
/* Process (transcribe + analyze)                                             */
/* -------------------------------------------------------------------------- */

const ProcessSchema = z.object({
  recording_id: z.string().uuid(),
  audio_path: z.string().min(1),
  audio_mime: z.string().min(1),
  duration_seconds: z.number().int().min(0).max(60 * 60 * 4),
});

const STT_MODEL = "openai/gpt-4o-mini-transcribe";
const CHAT_MODEL = "google/gemini-2.5-flash";

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
  .inputValidator((d) => ProcessSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ontbreekt");

    // Load recording (auth via RLS)
    const { data: recRaw, error: recErr } = await supabase
      .from("call_recordings" as never)
      .select("id, organization_id, lead_id, client_id, workflow_stage, title")
      .eq("id", data.recording_id)
      .maybeSingle();
    if (recErr) throw new Error(recErr.message);
    if (!recRaw) throw new Error("Opname niet gevonden");
    const rec = recRaw as unknown as {
      id: string;
      organization_id: string;
      lead_id: string | null;
      client_id: string | null;
      workflow_stage: string | null;
      title: string | null;
    };

    // Mark as processing + persist metadata
    await supabase
      .from("call_recordings" as never)
      .update({
        status: "processing",
        audio_path: data.audio_path,
        audio_mime: data.audio_mime,
        duration_seconds: data.duration_seconds,
      } as never)
      .eq("id", rec.id);

    try {
      // 1. Fetch audio from storage (service-role bypass for reliability)
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const dl = await supabaseAdmin.storage
        .from("call-recordings")
        .download(data.audio_path);
      if (dl.error || !dl.data) throw new Error(`Audio niet gevonden: ${dl.error?.message}`);
      const blob = dl.data;
      if (blob.size < 1024) throw new Error("Opname is leeg of te kort");

      // 2. Speech-to-text
      const form = new FormData();
      form.append("model", STT_MODEL);
      form.append("language", "nl");
      form.append(
        "file",
        blob,
        `opname.${extFromMime(data.audio_mime)}`,
      );
      const sttRes = await fetch(LOVABLE_STT, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!sttRes.ok) {
        const t = await sttRes.text();
        throw new Error(`Transcriptie mislukt (${sttRes.status}): ${t.slice(0, 200)}`);
      }
      const sttJson = (await sttRes.json()) as { text?: string };
      const transcript = (sttJson.text ?? "").trim();
      if (!transcript) throw new Error("Geen tekst gedetecteerd in opname");

      // 3. Chat: rapport + gestructureerde acties
      const system = `Je bent een senior sales/CS-analist voor een Nederlands MKB. Analyseer een gesprekstranscript en produceer een gestructureerd verslag EN een acties-plan.

Antwoord UITSLUITEND met geldige JSON in dit schema:
{
  "summary": string,              // 1 zin, max 160 tekens
  "report_markdown": string,      // volledige markdown met EXACT deze secties:
                                  // ### 🏢 1. Kern van het gesprek
                                  // ### 🎯 2. Wat wil de klant specifiek?
                                  // ### 🤝 3. Gemaakte afspraken & Vervolgacties
                                  // ### 💰 4. Commerciële kansen & Workflow-advies
  "tasks": [                      // vervolgacties voor ons team
    { "title": string, "body": string, "due_in_days": number }
  ],
  "suggested_stage": string | null // een van: nieuw, in_gesprek, voorstel, onderhandeling, gewonnen, verloren
}

Regels:
- Alles in het Nederlands.
- report_markdown moet exact de vier bovenstaande headers bevatten met inhoud eronder.
- Sectie 3 splitst acties duidelijk in "Voor ons" en "Voor de klant".
- tasks: alleen concrete acties voor ons (bv. offerte sturen, demo plannen, contract opstellen). Max 6.
- suggested_stage: schat de meest passende dealfase op basis van het gesprek, of null als onduidelijk.
- Geen markdown-fences om de JSON, alleen puur JSON.`;

      const chatRes = await fetch(LOVABLE_CHAT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: `Context: klant/lead titel = ${rec.title ?? "—"}, workflow-fase = ${rec.workflow_stage ?? "—"}.\n\nTranscript:\n${transcript.slice(0, 24000)}`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!chatRes.ok) {
        const t = await chatRes.text();
        throw new Error(`AI-rapport mislukt (${chatRes.status}): ${t.slice(0, 200)}`);
      }
      const chatJson = (await chatRes.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = chatJson.choices?.[0]?.message?.content ?? "{}";
      let parsed: {
        summary?: string;
        report_markdown?: string;
        tasks?: Array<{ title?: string; body?: string; due_in_days?: number }>;
        suggested_stage?: string | null;
      };
      try {
        parsed = JSON.parse(raw);
      } catch {
        const m = raw.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : {};
      }

      const summary = (parsed.summary ?? "").slice(0, 300);
      const report = parsed.report_markdown ?? "";
      const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.slice(0, 6) : [];
      const stage = parsed.suggested_stage ?? null;

      // 4. Create CRM tasks
      let tasksCreated = 0;
      for (const t of tasks) {
        const title = (t.title ?? "").trim();
        if (!title) continue;
        const due = typeof t.due_in_days === "number" ? t.due_in_days : 3;
        const dueAt = new Date(Date.now() + due * 24 * 60 * 60 * 1000).toISOString();
        const { error: taskErr } = await supabase
          .from("crm_activities")
          .insert({
            organization_id: rec.organization_id,
            target_id: null,
            client_id: rec.client_id,
            kind: "task",
            title,
            body: t.body ?? null,
            due_at: dueAt,
            done: false,
            created_by: userId,
          } as never);
        if (!taskErr) tasksCreated += 1;
      }

      // 5. Optionally update lead stage
      const validStages = ["nieuw", "in_gesprek", "voorstel", "onderhandeling", "gewonnen", "verloren"];
      if (rec.lead_id && stage && validStages.includes(stage)) {
        await supabase
          .from("leads")
          .update({ stage, last_contact_at: new Date().toISOString() } as never)
          .eq("id", rec.lead_id);
      } else if (rec.lead_id) {
        await supabase
          .from("leads")
          .update({ last_contact_at: new Date().toISOString() } as never)
          .eq("id", rec.lead_id);
      }

      // 6. Save results
      await supabase
        .from("call_recordings" as never)
        .update({
          status: "ready",
          transcript,
          report_markdown: report,
          summary,
          suggested_stage: stage,
          tasks_created: tasksCreated,
          error: null,
        } as never)
        .eq("id", rec.id);

      return {
        ok: true,
        summary,
        report_markdown: report,
        transcript,
        tasks_created: tasksCreated,
        suggested_stage: stage,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("call_recordings" as never)
        .update({ status: "error", error: msg } as never)
        .eq("id", data.recording_id);
      throw new Error(msg);
    }
  });

/* -------------------------------------------------------------------------- */
/* List recordings                                                            */
/* -------------------------------------------------------------------------- */

const ListSchema = z.object({
  organization_id: z.string().uuid(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const listCallRecordings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ListSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("call_recordings" as never)
      .select(
        "id, title, summary, status, duration_seconds, tasks_created, suggested_stage, workflow_stage, lead_id, client_id, created_at",
      )
      .eq("organization_id", data.organization_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as unknown as Array<{
      id: string;
      title: string | null;
      summary: string | null;
      status: string;
      duration_seconds: number | null;
      tasks_created: number;
      suggested_stage: string | null;
      workflow_stage: string | null;
      lead_id: string | null;
      client_id: string | null;
      created_at: string;
    }> };
  });

/* -------------------------------------------------------------------------- */
/* Quick create lead                                                          */
/* -------------------------------------------------------------------------- */

const QuickLeadSchema = z.object({
  organization_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
});

export const quickCreateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => QuickLeadSchema.parse(d))
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
