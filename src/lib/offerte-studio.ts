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

export type StudioPackageFeature = string;

export type StudioPackage = {
  id: string;
  name: string;
  price_eur: number;
  billing: "eenmalig" | "per maand" | "per jaar";
  features: StudioPackageFeature[];
  highlighted?: boolean;
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

export function newPackage(name = "Pakket"): StudioPackage {
  return {
    id: cryptoId(),
    name,
    price_eur: 0,
    billing: "eenmalig",
    features: ["Feature 1", "Feature 2"],
  };
}

function cryptoId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export function toEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    // YouTube
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "");
      return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (u.pathname.startsWith("/embed/")) return url;
    }
    // Loom
    if (u.hostname.includes("loom.com")) {
      const m = u.pathname.match(/\/share\/([a-z0-9]+)/i);
      if (m) return `https://www.loom.com/embed/${m[1]}`;
      return url;
    }
    // Vimeo
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.replace(/\//g, "");
      if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    return url;
  } catch {
    return null;
  }
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
    case "reviews": return "\"Strakke samenwerking en bovenverwachts resultaat.\" — Tevreden klant";
    case "sfeer-impressie": return "Een visuele indruk van eerder werk en stijl.";
    case "afsluiter": return "We kijken ernaar uit van je te horen.";
  }
}
