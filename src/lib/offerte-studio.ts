// Gedeelde types en defaults voor de Offerte Studio.

export type StudioSectionKey =
  | "cover"
  | "details"
  | "introductie"
  | "voorstel"
  | "plan-van-aanpak"
  | "investering"
  | "over-ons"
  | "contact"
  | "reviews"
  | "sfeer-impressie"
  | "afsluiter";

export type StudioSection = {
  key: StudioSectionKey;
  label: string;
  heading: string;
  body: string;
  image_url?: string | null;
};

export type StudioTheme = {
  accent: string; // neon accent
  bg: string;
  fg: string;
};

export const DEFAULT_THEME: StudioTheme = {
  accent: "#ff2bd6",
  bg: "#0a0a0a",
  fg: "#ffffff",
};

export const SECTION_DEFS: { key: StudioSectionKey; label: string }[] = [
  { key: "cover", label: "Cover" },
  { key: "details", label: "Details" },
  { key: "introductie", label: "Introductie" },
  { key: "voorstel", label: "Het voorstel" },
  { key: "plan-van-aanpak", label: "Plan van aanpak" },
  { key: "investering", label: "Investering" },
  { key: "over-ons", label: "Over ons" },
  { key: "contact", label: "Contact" },
  { key: "reviews", label: "Reviews" },
  { key: "sfeer-impressie", label: "Sfeer impressie" },
  { key: "afsluiter", label: "Afsluiter" },
];

export function buildDefaultSections(): StudioSection[] {
  return SECTION_DEFS.map(({ key, label }) => ({
    key,
    label,
    heading: defaultHeading(key),
    body: defaultBody(key),
    image_url: null,
  }));
}

function defaultHeading(key: StudioSectionKey): string {
  switch (key) {
    case "cover": return "Offerte voor [Klant]";
    case "details": return "Offerte details";
    case "introductie": return "Welkom";
    case "voorstel": return "Ons voorstel";
    case "plan-van-aanpak": return "Plan van aanpak";
    case "investering": return "Investering";
    case "over-ons": return "Over ons";
    case "contact": return "Contact";
    case "reviews": return "Wat klanten zeggen";
    case "sfeer-impressie": return "Sfeer impressie";
    case "afsluiter": return "Tot ziens";
  }
}

function defaultBody(key: StudioSectionKey): string {
  switch (key) {
    case "cover": return "Een voorstel op maat — gemaakt met aandacht.";
    case "details": return "Offertenummer, datum en geldigheid worden hier samengevat.";
    case "introductie": return "Bedankt voor je interesse. In dit document delen we ons voorstel.";
    case "voorstel": return "Beschrijf de scope, deliverables en doelen van het voorstel.";
    case "plan-van-aanpak": return "Fase 1 — Discovery\nFase 2 — Ontwerp\nFase 3 — Realisatie\nFase 4 — Oplevering";
    case "investering": return "Een transparant overzicht van de investering en betalingsvoorwaarden.";
    case "over-ons": return "Korte introductie van het team en de aanpak.";
    case "contact": return "Heb je vragen? Wij staan klaar om mee te denken.";
    case "reviews": return "“Strakke samenwerking en bovenverwachts resultaat.” — Tevreden klant";
    case "sfeer-impressie": return "Een visuele indruk van eerder werk en stijl.";
    case "afsluiter": return "We kijken ernaar uit van je te horen.";
  }
}
