import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const SYSTEM_PROMPT =
  "Je bent de Columbus AI Recruiter Agent voor aiVanColumbus. Beantwoord vragen over dit CRM, AI-recruitment en demo-aanvragen. Wees kort, vriendelijk en concreet. Antwoord in het Nederlands tenzij de gebruiker anders schrijft.";

async function verifyUser(request: Request): Promise<{ userId: string } | { error: string; status: number }> {
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization");
  const token = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { error: "Log in om de Columbus AI chat te gebruiken.", status: 401 };

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { error: "Auth backend niet geconfigureerd.", status: 503 };

  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return { error: "Ongeldige of verlopen sessie. Log opnieuw in.", status: 401 };
    return { userId: data.user.id };
  } catch {
    return { error: "Kon sessie niet valideren.", status: 401 };
  }
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const verified = await verifyUser(request);
        if ("error" in verified) {
          return Response.json({ error: verified.error }, { status: verified.status });
        }

        let body: { messages?: ChatMessage[]; agent?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (messages.length === 0) {
          return Response.json({ error: "messages is required" }, { status: 400 });
        }


        // Resolve AI backend at request-time (Cloudflare Workers bind env per request).
        // Priority:
        //   1) COLUMBUS_API_KEY (+ optional COLUMBUS_API_URL) — customer/aiVanColumbus key
        //   2) LOVABLE_API_KEY  — built-in Lovable AI Gateway fallback
        const customKey = process.env.COLUMBUS_API_KEY?.trim() || undefined;
        const customUrl = process.env.COLUMBUS_API_URL?.trim() || undefined;
        const customModel = process.env.COLUMBUS_API_MODEL?.trim() || undefined;
        const lovableKey = process.env.LOVABLE_API_KEY?.trim() || undefined;

        const useCustom = Boolean(customKey);
        const apiKey = customKey ?? lovableKey;
        const apiUrl =
          (useCustom ? customUrl : undefined) ??
          "https://ai.gateway.lovable.dev/v1/chat/completions";
        const model =
          (useCustom ? customModel : undefined) ?? "google/gemini-2.5-flash";
        const source: "columbus" | "lovable" | "none" = useCustom
          ? "columbus"
          : lovableKey
            ? "lovable"
            : "none";

        if (!apiKey) {
          console.error(
            "[columbus-chat] No AI backend configured. Set COLUMBUS_API_KEY (custom) or ensure LOVABLE_API_KEY is provisioned.",
          );
          return Response.json(
            {
              error:
                "AI-backend niet geconfigureerd. Stel COLUMBUS_API_KEY in of activeer Lovable AI.",
              source,
            },
            { status: 503 },
          );
        }

        if (useCustom && !customUrl) {
          console.warn(
            "[columbus-chat] COLUMBUS_API_KEY set without COLUMBUS_API_URL — routing custom key through Lovable AI Gateway URL.",
          );
        }

        const headers: Record<string, string> = {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        };

        try {
          const upstream = await fetch(apiUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
              model,
              messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
            }),
          });

          if (!upstream.ok) {
            const text = await upstream.text().catch(() => "");
            if (upstream.status === 429) {
              return Response.json(
                { error: "Te veel verzoeken, probeer het later opnieuw." },
                { status: 429 },
              );
            }
            if (upstream.status === 402) {
              return Response.json(
                { error: "AI-credits op. Voeg credits toe in je workspace." },
                { status: 402 },
              );
            }
            return Response.json(
              { error: `AI backend fout (${upstream.status})`, detail: text.slice(0, 500) },
              { status: 502 },
            );
          }

          const data = (await upstream.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const reply = data.choices?.[0]?.message?.content?.trim() ?? "";
          return Response.json({ reply, source });
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "Onbekende fout" },
            { status: 500 },
          );
        }
      },
    },
  },
});
