import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  client_name: z.string().nullable().optional(),
  invoice_number: z.string().nullable().optional(),
  total: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  issue_date: z.string().nullable().optional(),
  organization_name: z.string().nullable().optional(),
  line_descriptions: z.array(z.string()).max(30).optional(),
  extra_context: z.string().max(1000).optional(),
  tone: z.enum(["vriendelijk", "zakelijk", "kort"]).optional(),
});

const SYSTEM_PROMPT = `Je bent een assistent die begeleidende e-mails schrijft bij facturen voor een Nederlands MKB-bedrijf.

Doel: de klant weet direct waar de factuur voor is, wat het bedrag is en wanneer betaald moet worden. Kort, duidelijk en persoonlijk. Geen marketing-taal.

Regels:
- Nederlands (tenzij invoice_number of client_name duidelijk anderstalig is).
- Gebruik ALTIJD de placeholders letterlijk: {{client_name}}, {{invoice_number}}, {{total}}, {{due_date}}, {{issue_date}}, {{payment_link}}.
  Verzin geen bedragen, nummers of datums; gebruik de placeholder.
- Noem waar de factuur voor is op basis van de regelomschrijvingen, in maximaal 1 zin.
- Voeg {{payment_link}} NIET zelf toe — dat doet het systeem.
- Sluit af met een vriendelijke groet zonder naam (systeem vult ondertekening aan).
- Antwoord UITSLUITEND met geldig JSON in dit formaat, zonder markdown of uitleg:
{ "subject": string, "body": string }`;

export const suggestInvoiceEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ontbreekt");

    const userPayload = {
      klant: data.client_name ?? null,
      factuurnummer: data.invoice_number ?? null,
      bedrag: data.total ?? null,
      vervaldatum: data.due_date ?? null,
      factuurdatum: data.issue_date ?? null,
      afzender: data.organization_name ?? null,
      regels: data.line_descriptions ?? [],
      extra: data.extra_context ?? "",
      toon: data.tone ?? "vriendelijk",
    };

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
          { role: "user", content: JSON.stringify(userPayload) },
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
    let parsed: { subject?: unknown; body?: unknown } = {};
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

    const subject =
      typeof parsed.subject === "string" && parsed.subject.trim().length > 0
        ? parsed.subject.trim()
        : `Factuur {{invoice_number}}`;
    const body =
      typeof parsed.body === "string" && parsed.body.trim().length > 0
        ? parsed.body.trim()
        : `Beste {{client_name}},\n\nBijgevoegd vind je factuur {{invoice_number}} van {{total}}. De vervaldatum is {{due_date}}.\n\nMet vriendelijke groet`;

    return { subject, body };
  });
