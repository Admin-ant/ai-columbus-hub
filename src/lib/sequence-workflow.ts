import type { SequenceStep } from "@/components/outreach/sequence-builder";

export type StepIssue = { index: number; field: string; message: string };

export function validateSequence(steps: SequenceStep[]): StepIssue[] {
  const issues: StepIssue[] = [];
  if (!steps || steps.length === 0) {
    issues.push({ index: -1, field: "steps", message: "Voeg minimaal 1 stap toe" });
    return issues;
  }
  let prevDay = -1;
  steps.forEach((s, i) => {
    if (typeof s.day !== "number" || Number.isNaN(s.day) || s.day < 0) {
      issues.push({ index: i, field: "day", message: `Stap ${i + 1}: dag moet ≥ 0 zijn` });
    }
    if (s.day < prevDay) {
      issues.push({
        index: i,
        field: "day",
        message: `Stap ${i + 1}: dag (${s.day}) ligt vóór vorige stap (dag ${prevDay})`,
      });
    }
    prevDay = s.day;

    if (!s.channel) {
      issues.push({ index: i, field: "channel", message: `Stap ${i + 1}: kies een kanaal` });
    }
    if (s.channel !== "wait") {
      if (s.channel === "email" && !(s.subject && s.subject.trim())) {
        issues.push({ index: i, field: "subject", message: `Stap ${i + 1}: onderwerp is verplicht` });
      }
      if (!s.body || !s.body.trim()) {
        issues.push({ index: i, field: "body", message: `Stap ${i + 1}: body mag niet leeg zijn` });
      }
    }
    if (!s.condition) {
      issues.push({
        index: i,
        field: "condition",
        message: `Stap ${i + 1}: kies een overgang / conditie`,
      });
    }
  });
  return issues;
}

export function computeSchedule(
  steps: SequenceStep[],
  startAt: Date = new Date(),
): Array<{ index: number; step: SequenceStep; sendAt: Date }> {
  const baseDay = steps[0]?.day ?? 0;
  return steps.map((step, index) => {
    const offsetDays = Math.max(0, step.day - baseDay);
    const sendAt = new Date(startAt.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    return { index, step, sendAt };
  });
}

/* ------------------ Template opslag (per user, via Supabase) --------------------- */

import { supabase } from "@/integrations/supabase/client";

const LEGACY_KEY = "columbus.outreach.sequence-templates.v1";

export type SequenceTemplate = {
  id: string;
  name: string;
  savedAt: string;
  steps: SequenceStep[];
};

type Row = {
  id: string;
  name: string;
  steps: unknown;
  created_at: string;
  updated_at: string;
};

function rowToTemplate(r: Row): SequenceTemplate {
  return {
    id: r.id,
    name: r.name,
    savedAt: r.updated_at ?? r.created_at,
    steps: Array.isArray(r.steps) ? (r.steps as SequenceStep[]) : [],
  };
}

/** Legacy read — alleen gebruikt voor eenmalige migratie naar Supabase. */
function readLegacyTemplates(): SequenceTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SequenceTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function migrateLegacyIfAny(userId: string) {
  const legacy = readLegacyTemplates();
  if (legacy.length === 0) return;
  const rows = legacy.map((t) => ({
    user_id: userId,
    name: t.name,
    steps: t.steps as never,
  }));
  const { error } = await supabase.from("sequence_templates").insert(rows);
  if (!error && typeof window !== "undefined") {
    window.localStorage.removeItem(LEGACY_KEY);
  }
}

export async function loadTemplates(): Promise<SequenceTemplate[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  await migrateLegacyIfAny(userId);

  const { data, error } = await supabase
    .from("sequence_templates")
    .select("id, name, steps, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return (data as Row[]).map(rowToTemplate);
}

export async function saveTemplate(
  name: string,
  steps: SequenceStep[],
): Promise<SequenceTemplate> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Je moet ingelogd zijn om templates op te slaan");

  const { data, error } = await supabase
    .from("sequence_templates")
    .insert({ user_id: userId, name, steps: steps as never })
    .select("id, name, steps, created_at, updated_at")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Opslaan mislukt");
  return rowToTemplate(data as Row);
}

export async function deleteTemplate(id: string): Promise<SequenceTemplate[]> {
  const { error } = await supabase.from("sequence_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return loadTemplates();
}

/* ------------------ Export / Import (JSON) --------------------- */

const EXPORT_KIND = "columbus.outreach.sequence-templates";
const EXPORT_VERSION = 1;

export type SequenceTemplateExport = {
  kind: typeof EXPORT_KIND;
  version: number;
  exportedAt: string;
  templates: Array<Pick<SequenceTemplate, "name" | "steps"> & { savedAt?: string }>;
};

export function serializeTemplates(templates: SequenceTemplate[]): string {
  const payload: SequenceTemplateExport = {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    templates: templates.map((t) => ({ name: t.name, steps: t.steps, savedAt: t.savedAt })),
  };
  return JSON.stringify(payload, null, 2);
}

export function downloadTemplatesJson(templates: SequenceTemplate[], filename?: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([serializeTemplates(templates)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = filename ?? `sequence-templates-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function parseTemplatesJson(
  raw: string,
): Array<Pick<SequenceTemplate, "name" | "steps">> {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Bestand is geen geldige JSON");
  }

  // Accept either the export envelope, a bare array of templates, or a single template.
  const list: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { templates?: unknown[] })?.templates)
      ? ((data as { templates: unknown[] }).templates)
      : data && typeof data === "object" && "steps" in (data as object)
        ? [data]
        : [];

  if (list.length === 0) throw new Error("Geen templates gevonden in bestand");

  const out: Array<Pick<SequenceTemplate, "name" | "steps">> = [];
  list.forEach((raw, i) => {
    const t = raw as { name?: unknown; steps?: unknown };
    if (!Array.isArray(t.steps)) {
      throw new Error(`Template ${i + 1}: 'steps' ontbreekt of is geen array`);
    }
    const name = typeof t.name === "string" && t.name.trim() ? t.name.trim() : `Import ${i + 1}`;
    out.push({ name, steps: t.steps as SequenceStep[] });
  });
  return out;
}

export async function importTemplatesFromJson(raw: string): Promise<SequenceTemplate[]> {
  const parsed = parseTemplatesJson(raw);
  const results: SequenceTemplate[] = [];
  for (const t of parsed) {
    results.push(await saveTemplate(t.name, t.steps));
  }
  return results;
}


