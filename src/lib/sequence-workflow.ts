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

