import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, LogIn, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";


/**
 * Floating "Columbus AI Recruiter Agent" chat widget.
 *
 * Extension points (all optional):
 *
 * 1) Externe web-widget van www.aivancolumbus.com
 *    Zet ergens vóór render — bijvoorbeeld in index.html of via een <script>-tag:
 *
 *    <script>
 *      window.__COLUMBUS_WIDGET__ = { scriptSrc: "https://www.aivancolumbus.com/widget.js" };
 *    </script>
 *
 *    Het opgegeven script wordt dan geladen; deze fallback-UI blijft verborgen.
 *
 * 2) Eigen REST endpoint (bv. je eigen agent-API of een Lovable server function URL)
 *
 *    <script>
 *      window.__COLUMBUS_WIDGET__ = {
 *        apiUrl: "https://api.aivancolumbus.com/chat",
 *        apiKey: "sk-...", // optioneel, wordt als Authorization: Bearer meegestuurd
 *      };
 *    </script>
 *
 *    De widget POST't dan { messages: [{role, content}] } en verwacht { reply: string }.
 */

type WidgetConfig = {
  scriptSrc?: string;
  apiUrl?: string;
  apiKey?: string;
};

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Wat kan dit CRM?",
  "Hoe helpt AI bij recruitment?",
  "Demo aanvragen",
];

const INTRO: Msg = {
  role: "assistant",
  content:
    "Hoi! Ik ben de Columbus AI Recruiter Agent. Vraag me alles over deze CRM, AI-recruitment of plan direct een demo in.",
};

function readConfig(): WidgetConfig {
  if (typeof window === "undefined") return {};
  return (window as unknown as { __COLUMBUS_WIDGET__?: WidgetConfig })
    .__COLUMBUS_WIDGET__ ?? {};
}

export function ColumbusChatWidget() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<WidgetConfig>({});
  const [messages, setMessages] = useState<Msg[]>([INTRO]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const injectedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    setConfig(readConfig());
    supabase.auth.getSession().then(({ data }) => setAuthed(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(Boolean(session));
    });
    return () => sub.subscription.unsubscribe();
  }, []);


  // Laad extern widget-script indien opgegeven.
  useEffect(() => {
    if (!mounted || injectedRef.current) return;
    if (!config.scriptSrc) return;
    injectedRef.current = true;
    const s = document.createElement("script");
    s.src = config.scriptSrc;
    s.async = true;
    s.dataset.columbusWidget = "true";
    document.body.appendChild(s);
  }, [mounted, config.scriptSrc]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, [open, messages, sending]);

  const usingExternalScript = Boolean(config.scriptSrc);
  // Default naar onze eigen server-route; extern config kan dit overschrijven.
  const effectiveApiUrl = config.apiUrl ?? "/api/chat";

  const placeholder = useMemo(
    () => "Stel je vraag aan Columbus…",
    [],
  );

  async function send(text: string) {
    const value = text.trim();
    if (!value || sending) return;
    if (!authed) {
      setMessages((cur) => [
        ...cur,
        {
          role: "assistant",
          content: "Je moet ingelogd zijn om de Columbus AI chat te gebruiken. Log in en probeer opnieuw.",
        },
      ]);
      return;
    }
    const next: Msg[] = [...messages, { role: "user", content: value }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const bearer = config.apiKey ?? sess.session?.access_token;
      const res = await fetch(effectiveApiUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        },
        body: JSON.stringify({
          agent: "columbus-recruiter",
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        message?: string;
        error?: string;
      };
      const reply =
        data.reply ??
        data.message ??
        (data.error ? `Fout: ${data.error}` : "Geen antwoord ontvangen.");
      setMessages((cur) => [...cur, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages((cur) => [
        ...cur,
        {
          role: "assistant",
          content: `Er ging iets mis: ${e instanceof Error ? e.message : "onbekende fout"}.`,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  if (!mounted) return null;
  // Extern script neemt het over — verberg onze fallback.
  if (usingExternalScript) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      {/* Panel */}
      {open && (
        <div className="pointer-events-auto absolute bottom-20 right-4 flex h-[520px] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border bg-gradient-to-br from-brand/20 via-background to-background px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/20">
                <Bot className="h-4 w-4 text-brand" aria-hidden />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-foreground">
                  Columbus AI Recruiter Agent
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Live · antwoordt meestal binnen enkele seconden
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Chat sluiten"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "bg-brand text-brand-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <Sparkles className="mr-1 inline h-3 w-3 animate-pulse" />
                  aan het typen…
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border px-3 py-2">
            {authed === false && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-100">
                <span>Log in om berichten te sturen naar de Columbus AI.</span>
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 font-medium text-amber-50 hover:bg-amber-500/30"
                >
                  <LogIn className="h-3 w-3" />
                  Log in
                </Link>
              </div>
            )}

            <div className="mb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={sending || !authed}
                  onClick={() => send(s)}
                  className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition hover:bg-muted disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder={placeholder}
                className="max-h-28 min-h-[36px] flex-1 resize-none rounded-md border border-border bg-muted/50 px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <Button
                type="submit"
                size="sm"
                disabled={sending || !input.trim()}
                className="h-9 bg-brand text-brand-foreground hover:bg-brand/90"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Floating bubble */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Chat sluiten" : "Chat openen met Columbus AI Recruiter Agent"}
        className="pointer-events-auto absolute bottom-4 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-2xl transition hover:scale-105 hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}
