import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  url: z
    .string()
    .trim()
    .min(4, "URL is te kort")
    .max(2048, "URL is te lang")
    .refine((v) => {
      try {
        const u = new URL(v);
        if (!/^https?:$/.test(u.protocol)) return false;
        const host = u.hostname.toLowerCase();
        if (!host.includes(".")) return false;
        if (host === "localhost" || host.endsWith(".local")) return false;
        // block raw IPs
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
        // private ranges / metadata
        if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
        return true;
      } catch {
        return false;
      }
    }, "Ongeldige of niet-publieke URL"),
  company: z.string().max(200).optional(),
});

export type WebsiteScanResult = {
  industry: string;
  specialisation: string;
  tone: string;
  summary: string;
  scanned_at: string;
  source_url: string;
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const scanWebsite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<WebsiteScanResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ontbreekt");

    // 1. Fetch de website (met timeout & UA)
    let html = "";
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(data.url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; AIQloudBot/1.0; +https://aiqloud.nl)",
          accept: "text/html,application/xhtml+xml",
        },
        signal: ctrl.signal,
      });
      clearTimeout(to);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      html = await resp.text();
    } catch (e) {
      throw new Error(
        `Website niet bereikbaar: ${e instanceof Error ? e.message : "onbekend"}`,
      );
    }

    const text = stripHtml(html).slice(0, 6000);
    if (text.length < 40) {
      throw new Error("Geen leesbare tekst gevonden op deze pagina.");
    }

    // 2. Laat AI branche/specialisatie/tone extraheren als JSON
    const prompt = `Je krijgt de zichtbare tekst van een bedrijfswebsite${
      data.company ? ` (${data.company})` : ""
    }. Analyseer en retourneer UITSLUITEND geldige JSON met dit exacte schema:
{
  "industry": "korte branche (max 6 woorden, in het Nederlands)",
  "specialisation": "wat dit bedrijf specifiek doet/aanbiedt (max 20 woorden, Nederlands)",
  "tone": "toon & merkgevoel in 3-6 woorden (bv. 'professioneel, warm, no-nonsense')",
  "summary": "1 zin samenvatting van het bedrijf (max 30 woorden, Nederlands)"
}

Website tekst:
"""${text}"""

Antwoord met alleen JSON, geen markdown, geen toelichting.`;

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "Je bent een B2B-analist die websites classificeert. Antwoord altijd met geldige JSON.",
            },
            { role: "user", content: prompt },
          ],
        }),
      },
    );

    if (aiRes.status === 429) throw new Error("Rate limit bereikt.");
    if (aiRes.status === 402) throw new Error("AI credits op.");
    if (!aiRes.ok) throw new Error(`AI fout (${aiRes.status})`);

    const payload = (await aiRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = payload.choices?.[0]?.message?.content ?? "";
    const cleaned = raw
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed: Partial<WebsiteScanResult>;
    try {
      parsed = JSON.parse(cleaned) as Partial<WebsiteScanResult>;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("AI gaf geen geldige JSON terug.");
      parsed = JSON.parse(match[0]) as Partial<WebsiteScanResult>;
    }

    return {
      industry: String(parsed.industry ?? "onbekend").trim(),
      specialisation: String(parsed.specialisation ?? "").trim(),
      tone: String(parsed.tone ?? "professioneel").trim(),
      summary: String(parsed.summary ?? "").trim(),
      scanned_at: new Date().toISOString(),
      source_url: data.url,
    };
  });
