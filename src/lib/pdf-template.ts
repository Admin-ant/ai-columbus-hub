export type PdfTheme = "slate" | "indigo" | "emerald" | "rose" | "mono";

export interface PdfTemplate {
  title: string;
  footerText: string;
  logoDataUrl: string | null;
  showPageNumbers: boolean;
  theme: PdfTheme;
}

export const DEFAULT_TEMPLATE: PdfTemplate = {
  title: "Journaalpost",
  footerText: "",
  logoDataUrl: null,
  showPageNumbers: true,
  theme: "slate",
};

export const THEMES: Record<PdfTheme, { label: string; head: [number, number, number]; accent: [number, number, number] }> = {
  slate:   { label: "Slate",   head: [30, 41, 59],   accent: [51, 65, 85] },
  indigo:  { label: "Indigo",  head: [49, 46, 129],  accent: [79, 70, 229] },
  emerald: { label: "Emerald", head: [6, 78, 59],    accent: [16, 122, 87] },
  rose:    { label: "Rose",    head: [136, 19, 55],  accent: [190, 18, 60] },
  mono:    { label: "Mono",    head: [24, 24, 27],   accent: [63, 63, 70] },
};

export type TemplateScope = "user" | "org";

const ORG_KEY = (orgId: string) => `pdf-template:org:${orgId}`;
const USER_KEY = (userId: string) => `pdf-template:user:${userId}`;

function safeParse(raw: string | null): Partial<PdfTemplate> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<PdfTemplate>;
  } catch {
    return null;
  }
}

/**
 * Resolve effective template: user override > organization default > built-in default.
 */
export function loadTemplate(orgId: string, userId?: string | null): PdfTemplate {
  if (typeof window === "undefined") return DEFAULT_TEMPLATE;
  const user = userId ? safeParse(localStorage.getItem(USER_KEY(userId))) : null;
  const org = orgId ? safeParse(localStorage.getItem(ORG_KEY(orgId))) : null;
  return { ...DEFAULT_TEMPLATE, ...(org ?? {}), ...(user ?? {}) };
}

export function saveTemplate(scope: TemplateScope, id: string, tpl: PdfTemplate) {
  if (typeof window === "undefined") return;
  const key = scope === "user" ? USER_KEY(id) : ORG_KEY(id);
  localStorage.setItem(key, JSON.stringify(tpl));
}

export function clearTemplate(scope: TemplateScope, id: string) {
  if (typeof window === "undefined") return;
  const key = scope === "user" ? USER_KEY(id) : ORG_KEY(id);
  localStorage.removeItem(key);
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
