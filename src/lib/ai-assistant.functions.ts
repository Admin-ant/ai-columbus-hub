import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

const InputSchema = z.object({
  task: z.enum([
    "lead_to_quote",
    "verify_invoice",
    "summarize_lead",
    "generic",
  ]),
  context: z.string().max(8000),
  messages: z.array(MessageSchema).max(20).optional(),
});

const SYSTEM_PROMPTS: Record<string, string> = {
  lead_to_quote:
    "Je bent een verkoopassistent. Stel op basis van de lead-notities een gestructureerde offerte-concept voor met line items (omschrijving, aantal, prijs in EUR ex BTW). Antwoord in markdown.",
  verify_invoice:
    "Je bent een boekhoud-controleur. Controleer factuurregels op consistentie, BTW-percentages en rekensommen. Wijs duidelijk afwijkingen aan.",
  summarize_lead:
    "Vat de lead kort samen (max 5 bullets): wie, wens, budget, urgentie, volgende stap.",
  generic:
    "Je bent een behulpzame zakelijke assistent voor een Nederlands MKB. Antwoord helder en concreet.",
};

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY ontbreekt");
    }

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPTS[data.task] },
      ...(data.messages ?? []),
      { role: "user" as const, content: data.context },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
      }),
    });

    if (res.status === 429) {
      throw new Error("Rate limit bereikt. Probeer het zo opnieuw.");
    }
    if (res.status === 402) {
      throw new Error("AI credits op. Voeg credits toe in Lovable AI.");
    }
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`AI gateway error: ${res.status} ${txt.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = json.choices?.[0]?.message?.content ?? "";
    return { reply };
  });
