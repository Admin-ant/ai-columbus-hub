import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  text: z.string().min(1).max(8000),
});

const ALLOWED_SOURCES = [
  "handmatig",
  "website",
  "referral",
  "cold_outreach",
  "linkedin",
  "evenement",
  "aanbesteding",
  "anders",
] as const;

const SYSTEM_PROMPT = `Je bent een assistent die uit vrije tekst (e-mail, LinkedIn-bericht, notitie, visitekaartje) gestructureerde lead-informatie haalt voor een Nederlands CRM.

Antwoord UITSLUITEND met geldig JSON in dit exacte formaat (geen uitleg, geen markdown):
{
  "name": string | null,           // volledige naam van contactpersoon
  "company": string | null,        // bedrijfsnaam
  "contact_person": string | null, // idem als name, tenzij anders
  "email": string | null,
  "phone": string | null,          // Nederlandse notatie indien mogelijk
  "source": string | null,         // exact één van: handmatig, website, referral, cold_outreach, linkedin, evenement, aanbesteding, anders — of null
  "estimated_value_eur": number | null, // geschatte maandelijkse waarde in hele euro's, indien genoemd
  "notes": string | null           // korte samenvatting (max 2 zinnen) van de aanleiding/vraag
}

Regels:
- Verzin niets. Als iets niet in de tekst staat, gebruik null.
- Als er alleen een bedrijf staat en geen persoon, laat name/contact_person null.
- "source" mag ALLEEN uit de opgegeven lijst komen; anders null.`;

export const extractLeadFromText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ontbreekt");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: data.text.slice(0, 8000) },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) throw new Error("AI is druk, probeer het zo opnieuw.");
    if (res.status === 402) throw new Error("AI-credits op. Voeg credits toe in Instellingen.");
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`AI-fout: ${res.status} ${txt.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          parsed = {};
        }
      }
    }

    const str = (v: unknown) =>
      typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
    const num = (v: unknown) => {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string") {
        const n = Number(v.replace(/[^\d.,-]/g, "").replace(",", "."));
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };

    const sourceRaw = str(parsed.source)?.toLowerCase() ?? null;
    const source = (ALLOWED_SOURCES as readonly string[]).includes(sourceRaw ?? "")
      ? sourceRaw
      : null;

    return {
      name: str(parsed.name),
      company: str(parsed.company),
      contact_person: str(parsed.contact_person) ?? str(parsed.name),
      email: str(parsed.email),
      phone: str(parsed.phone),
      source,
      estimated_value_eur: num(parsed.estimated_value_eur),
      notes: str(parsed.notes),
    };
  });
