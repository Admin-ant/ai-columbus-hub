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
    let contentType = "";
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
        redirect: "follow",
      });
      clearTimeout(to);
      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          throw new Error(
            "Deze website blokkeert geautomatiseerde bezoekers en kan niet worden gescand.",
          );
        }
        if (resp.status === 404) {
          throw new Error("Pagina niet gevonden (404). Controleer de URL.");
        }
        if (resp.status >= 500) {
          throw new Error(
            `De website is tijdelijk niet beschikbaar (${resp.status}). Probeer het later opnieuw.`,
          );
        }
        throw new Error(`De website gaf een fout terug (HTTP ${resp.status}).`);
      }
      contentType = resp.headers.get("content-type") ?? "";
      if (contentType && !/text\/html|xhtml|application\/xml/i.test(contentType)) {
        throw new Error(
          "Deze URL wijst niet naar een gewone webpagina en kan niet worden gescand.",
        );
      }
      html = await resp.text();
    } catch (e) {
      const raw = e instanceof Error ? e.message : "onbekend";
      // If we already produced a friendly message above, re-throw as-is
      if (/gescand|beschikbaar|niet gevonden|fout terug|blokkeert|webpagina/i.test(raw)) {
        throw e;
      }
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError" || /timeout|timed out/i.test(raw)) {
        throw new Error(
          "De website reageerde niet binnen 8 seconden. Controleer of de site online is.",
        );
      }
      if (/ENOTFOUND|getaddrinfo|dns/i.test(raw)) {
        throw new Error(
          "Deze website bestaat niet of het domein kan niet worden gevonden.",
        );
      }
      if (/ECONNREFUSED|ECONNRESET|network|fetch failed/i.test(raw)) {
        throw new Error(
          "Kon geen verbinding maken met de website. Controleer de URL en probeer opnieuw.",
        );
      }
      throw new Error(`Website niet bereikbaar: ${raw}`);
    }

    const text = stripHtml(html).slice(0, 6000);
    if (text.length < 40) {
      throw new Error(
        "Op deze pagina staat te weinig leesbare tekst om te analyseren.",
      );
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
