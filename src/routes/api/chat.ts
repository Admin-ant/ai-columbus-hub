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

async function writeAudit(entry: {
  user_id: string;
  agent: string | null;
  prompt: string;
  reply: string | null;
  status: "success" | "failed";
  error: string | null;
  source: string | null;
  model: string | null;
  duration_ms: number;
  message_count: number;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Beperk lengte om DB-bloat te voorkomen
    const trim = (s: string | null, max: number) =>
      s == null ? null : s.length > max ? s.slice(0, max) : s;
    await supabaseAdmin.from("chat_audit_log").insert({
      user_id: entry.user_id,
      agent: entry.agent,
      prompt: trim(entry.prompt, 8000) ?? "",
      reply: trim(entry.reply, 8000),
      status: entry.status,
      error: trim(entry.error, 2000),
      source: entry.source,
      model: entry.model,
      duration_ms: entry.duration_ms,
      message_count: entry.message_count,
    } as never);
  } catch (e) {
    console.error("[columbus-chat] audit log write failed", e);
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
        const agent = typeof body.agent === "string" ? body.agent : null;
        if (messages.length === 0) {
          return Response.json({ error: "messages is required" }, { status: 400 });
        }
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const promptText = lastUser?.content ?? "";
        const startedAt = Date.now();

        // Resolve AI backend at request-time (Cloudflare Workers bind env per request).
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

        const auditBase = {
          user_id: verified.userId,
          agent,
          prompt: promptText,
          source,
          model,
          message_count: messages.length,
        };

        if (!apiKey) {
          console.error(
            "[columbus-chat] No AI backend configured. Set COLUMBUS_API_KEY (custom) or ensure LOVABLE_API_KEY is provisioned.",
          );
          await writeAudit({
            ...auditBase,
            reply: null,
            status: "failed",
            error: "AI-backend niet geconfigureerd",
            duration_ms: Date.now() - startedAt,
          });
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
              stream: true,
              messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
            }),
          });

          if (!upstream.ok || !upstream.body) {
            const text = await upstream.text().catch(() => "");
            const errMsg =
              upstream.status === 429
                ? "Te veel verzoeken, probeer het later opnieuw."
                : upstream.status === 402
                  ? "AI-credits op."
                  : `AI backend fout (${upstream.status}): ${text.slice(0, 300)}`;
            await writeAudit({
              ...auditBase,
              reply: null,
              status: "failed",
              error: errMsg,
              duration_ms: Date.now() - startedAt,
            });
            if (upstream.status === 429) {
              return Response.json({ error: errMsg }, { status: 429 });
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

          // Transform OpenAI-compatible SSE into our own compact SSE stream.
          // We also accumulate the full reply for the audit log.
          const encoder = new TextEncoder();
          const decoder = new TextDecoder();
          let accumulated = "";
          let buffered = "";

          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              const send = (obj: unknown) =>
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

              // Meta event zodat de client 'source' en 'model' meteen kent
              send({ type: "meta", source, model });

              const reader = upstream.body!.getReader();
              try {
                while (true) {
                  const { value, done } = await reader.read();
                  if (done) break;
                  buffered += decoder.decode(value, { stream: true });

                  // Verwerk complete SSE-events (gescheiden door lege regel)
                  let sep: number;
                  while ((sep = buffered.indexOf("\n\n")) !== -1) {
                    const raw = buffered.slice(0, sep);
                    buffered = buffered.slice(sep + 2);
                    for (const line of raw.split("\n")) {
                      const trimmed = line.trim();
                      if (!trimmed.startsWith("data:")) continue;
                      const payload = trimmed.slice(5).trim();
                      if (!payload || payload === "[DONE]") continue;
                      try {
                        const j = JSON.parse(payload) as {
                          choices?: Array<{ delta?: { content?: string } }>;
                        };
                        const delta = j.choices?.[0]?.delta?.content;
                        if (delta) {
                          accumulated += delta;
                          send({ type: "delta", text: delta });
                        }
                      } catch {
                        // sla onparseerbare fragmenten over
                      }
                    }
                  }
                }
                send({ type: "done", source });
                controller.close();
                await writeAudit({
                  ...auditBase,
                  reply: accumulated,
                  status: "success",
                  error: null,
                  duration_ms: Date.now() - startedAt,
                });
              } catch (e) {
                const errMsg = e instanceof Error ? e.message : "Streamfout";
                send({ type: "error", error: errMsg });
                controller.close();
                await writeAudit({
                  ...auditBase,
                  reply: accumulated || null,
                  status: "failed",
                  error: errMsg,
                  duration_ms: Date.now() - startedAt,
                });
              }
            },
          });

          return new Response(stream, {
            headers: {
              "content-type": "text/event-stream; charset=utf-8",
              "cache-control": "no-cache, no-transform",
              "x-accel-buffering": "no",
              connection: "keep-alive",
            },
          });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : "Onbekende fout";
          await writeAudit({
            ...auditBase,
            reply: null,
            status: "failed",
            error: errMsg,
            duration_ms: Date.now() - startedAt,
          });
          return Response.json({ error: errMsg }, { status: 500 });
        }

      },

    },
  },
});
