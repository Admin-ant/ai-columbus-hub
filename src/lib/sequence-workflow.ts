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

/* ------------------ Template opslag (localStorage) --------------------- */

const TEMPLATE_KEY = "columbus.outreach.sequence-templates.v1";

export type SequenceTemplate = {
  id: string;
  name: string;
  savedAt: string;
  steps: SequenceStep[];
};

export function loadTemplates(): SequenceTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TEMPLATE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SequenceTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTemplate(name: string, steps: SequenceStep[]): SequenceTemplate {
  const list = loadTemplates();
  const template: SequenceTemplate = {
    id: (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `tpl_${Date.now()}`),
    name,
    savedAt: new Date().toISOString(),
    steps,
  };
  list.unshift(template);
  window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(list.slice(0, 25)));
  return template;
}

export function deleteTemplate(id: string): SequenceTemplate[] {
  const list = loadTemplates().filter((t) => t.id !== id);
  window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(list));
  return list;
}
