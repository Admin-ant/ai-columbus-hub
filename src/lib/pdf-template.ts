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

const KEY = (orgId: string) => `pdf-template:${orgId}`;

export function loadTemplate(orgId: string): PdfTemplate {
  if (typeof window === "undefined") return DEFAULT_TEMPLATE;
  try {
    const raw = localStorage.getItem(KEY(orgId));
    if (!raw) return DEFAULT_TEMPLATE;
    return { ...DEFAULT_TEMPLATE, ...(JSON.parse(raw) as Partial<PdfTemplate>) };
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

export function saveTemplate(orgId: string, tpl: PdfTemplate) {
  localStorage.setItem(KEY(orgId), JSON.stringify(tpl));
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
