import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildDefaultSections,
  SECTION_DEFS,
  type StudioPackage,
  type StudioSection,
  type StudioSectionKey,
} from "@/lib/offerte-studio";

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callAI(opts: {
  system: string;
  user: string;
  json?: boolean;
  model?: string;
}): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ontbreekt");

  const res = await fetch(LOVABLE_GATEWAY, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (res.status === 429) throw new Error("AI rate-limit bereikt — probeer zo opnieuw");
  if (res.status === 402) throw new Error("AI credits op — vul je workspace bij");
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway error ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? "";
}

function safeJsonParse<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}

/* -------------------------------------------------------------------------- */
/* 1. AI Offerte-generator                                                    */
/* -------------------------------------------------------------------------- */

const QUOTE_BRIEF_SCHEMA = z.object({
  brief: z.string().min(5).max(4000),
  client: z.string().max(200).optional(),
});

const SECTION_KEYS = SECTION_DEFS.map((s) => s.key);

export const generateQuoteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => QUOTE_BRIEF_SCHEMA.parse(d))
  .handler(async ({ data }) => {
    const system = `Je bent een senior offerte-copywriter voor een Nederlands MKB.
Genereer een complete premium offerte op basis van een korte brief.
Antwoord UITSLUITEND met geldige JSON, exact dit schema:

{
  "title": string,
  "client": string,
  "sections": [
    { "key": "<een van: ${SECTION_KEYS.join(", ")}>", "heading": string, "body": string }
  ],
  "packages": [
    { "name": string, "price_eur": number, "billing": "eenmalig"|"per maand"|"per jaar", "features": [string], "highlighted": boolean }
  ]
}

Regels:
- Lever ALLE secties: ${SECTION_KEYS.join(", ")}.
- "body" mag meerdere regels bevatten (\\n toegestaan), helder en concreet.
- Maak 2 of 3 pakketten met realistische prijzen. Markeer er één als highlighted.
- Schrijf in het Nederlands. Persoonlijke, zelfverzekerde toon, geen clichés.
- Geen markdown, geen toelichting, alleen JSON.`;

    const user = `Brief: ${data.brief}\nKlant: ${data.client ?? "(onbekend)"}`;

    const raw = await callAI({ system, user, json: true });
    type AIQuote = {
      title?: string;
      client?: string;
      sections?: Array<{ key: string; heading: string; body: string }>;
      packages?: Array<Partial<StudioPackage>>;
    };
    let parsed: AIQuote;
    try {
      parsed = safeJsonParse<AIQuote>(raw);
    } catch {
      throw new Error("AI antwoord kon niet worden gelezen — probeer opnieuw");
    }

    // Merge into our canonical section list to ensure all keys present.
    const defaults = buildDefaultSections();
    const sections: StudioSection[] = defaults.map((def) => {
      const match = parsed.sections?.find((s) => s.key === def.key);
      return match
        ? { ...def, heading: match.heading || def.heading, body: match.body || def.body }
        : def;
    });

    const packages: StudioPackage[] = (parsed.packages ?? []).slice(0, 4).map((p, i) => ({
      id: cryptoId(),
      name: p.name ?? `Pakket ${i + 1}`,
      price_eur: Number(p.price_eur) || 0,
      billing:
        p.billing === "per maand" || p.billing === "per jaar" ? p.billing : "eenmalig",
      features: Array.isArray(p.features) ? p.features.filter(Boolean) : [],
      highlighted: !!p.highlighted,
    }));

    return {
      title: parsed.title?.trim() || "Nieuwe offerte",
      client: parsed.client?.trim() || data.client || "",
      sections,
      packages,
    };
  });

/* -------------------------------------------------------------------------- */
/* 2. Auto-research per lead                                                  */
/* -------------------------------------------------------------------------- */

const RESEARCH_SCHEMA = z.object({
  target_id: z.string().uuid(),
  website: z.string().url().optional(),
});

export const researchLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RESEARCH_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: target, error } = await supabase
      .from("outreach_targets")
      .select("id, company, contact_name, linkedin_url, notes")
      .eq("id", data.target_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!target) throw new Error("Prospect niet gevonden");

    let scraped = "";
    const url = data.website;
    if (url) {
      try {
        const r = await fetch(url, {
          headers: { "user-agent": "Mozilla/5.0 (compatible; LovableResearchBot)" },
          signal: AbortSignal.timeout(8000),
        });
        if (r.ok) {
          const html = await r.text();
          scraped = html
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 4000);
        }
      } catch {
        // ignore scrape failures, AI can still work from company name
      }
    }

    const system = `Je bent een B2B-research analist. Geef bondige insights waarmee een verkoper een
gepersonaliseerd openingsbericht kan schrijven. Antwoord in markdown.

Schema:
## Wie ze zijn
(2-3 zinnen)

## Pijnpunten / kansen
- bullet
- bullet
- bullet

## Persoonlijke openingszin
(1 zin die in een cold email of LinkedIn-bericht kan)

## Voorgestelde pitch (max 80 woorden)
(direct bruikbaar bericht in jij-vorm)`;

    const user = `Bedrijf: ${target.company}
Contact: ${target.contact_name ?? "—"}
LinkedIn: ${target.linkedin_url ?? "—"}
Bestaande notities: ${target.notes ?? "—"}

Website tekst (eerste 4000 chars):
${scraped || "(geen website beschikbaar)"}`;

    const summary = await callAI({ system, user });

    await supabase
      .from("outreach_targets")
      .update({
        research_summary: summary,
        research_at: new Date().toISOString(),
      })
      .eq("id", data.target_id);

    return { summary };
  });

/* -------------------------------------------------------------------------- */
/* 3. A/B pitch varianten                                                     */
/* -------------------------------------------------------------------------- */

const VARIANT_SCHEMA = z.object({ campaign_id: z.string().uuid() });

export type PitchVariant = {
  id: string;
  label: string;
  angle: string;
  subject: string;
  body: string;
};

export const generatePitchVariants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => VARIANT_SCHEMA.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: c, error } = await supabase
      .from("outreach_campaigns")
      .select("id, name, channel, goal, ai_pitch, notes")
      .eq("id", data.campaign_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) throw new Error("Campagne niet gevonden");

    const system = `Je bent een conversie-copywriter. Genereer 3 verschillende A/B-pitchvarianten
voor cold outreach. Elke variant gebruikt een andere invalshoek (bv. pijnpunt, social proof, curiosity, ROI, persoonlijk).
Antwoord UITSLUITEND met geldige JSON-array, exact:
[
  { "label": string, "angle": string, "subject": string, "body": string }
]
Schrijf in het Nederlands. Body max 120 woorden, direct en persoonlijk, geen clichés.`;

    const user = `Campagne: ${c.name}
Kanaal: ${c.channel}
Doel: ${c.goal ?? "afspraak inplannen"}
Bestaande pitch: ${c.ai_pitch ?? "—"}
Notities: ${c.notes ?? "—"}`;

    const raw = await callAI({ system, user, json: true });
    let arr: Array<Omit<PitchVariant, "id">>;
    try {
      const parsed = safeJsonParse<unknown>(raw);
      arr = Array.isArray(parsed)
        ? (parsed as Array<Omit<PitchVariant, "id">>)
        : ((parsed as { variants?: Array<Omit<PitchVariant, "id">> }).variants ?? []);
    } catch {
      throw new Error("AI antwoord kon niet worden gelezen");
    }

    const variants: PitchVariant[] = arr.slice(0, 4).map((v, i) => ({
      id: cryptoId(),
      label: v.label || `Variant ${String.fromCharCode(65 + i)}`,
      angle: v.angle || "",
      subject: v.subject || "",
      body: v.body || "",
    }));

    const { error: updErr } = await supabase
      .from("outreach_campaigns")
      .update({ pitch_variants: variants as never })
      .eq("id", data.campaign_id);
    if (updErr) throw new Error(updErr.message);

    return { variants };
  });

function cryptoId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

// keep linter happy about unused import
export type _StudioSectionKey = StudioSectionKey;
