import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, CheckCircle2, Sparkles, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  acceptPublicStudioQuote,
  getPublicStudioQuote,
} from "@/lib/studio-public.functions";
import {
  DEFAULT_THEME,
  SECTION_DEFS,
  type StudioSection,
  type StudioTheme,
} from "@/lib/offerte-studio";

export const Route = createFileRoute("/q/$token")({
  head: ({ params }) => ({
    meta: [{ title: `Offerte • ${params.token.slice(0, 6)}` }],
  }),
  component: PublicQuote,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white">
      <div className="rounded-lg border border-white/10 bg-white/5 p-8 text-center">
        <h1 className="text-xl font-bold">Offerte niet beschikbaar</h1>
        <p className="mt-2 text-sm text-white/60">{(error as Error).message}</p>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white">
      Offerte niet gevonden
    </div>
  ),
});

type Loaded = Awaited<ReturnType<typeof getPublicStudioQuote>>;

function PublicQuote() {
  const { token } = useParams({ from: "/q/$token" });
  const get = useServerFn(getPublicStudioQuote);
  const accept = useServerFn(acceptPublicStudioQuote);
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [signerName, setSignerName] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await get({ data: { token } });
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Laden…
      </div>
    );
  }
  if (!data) return null;

  const theme: StudioTheme = (data.quote.theme as StudioTheme) ?? DEFAULT_THEME;
  const sections: StudioSection[] = Array.isArray(data.quote.sections)
    ? (data.quote.sections as unknown as StudioSection[])
    : [];
  const cover = data.quote.cover_image_url;
  const accepted = !!data.quote.accepted_at;

  return (
    <div
      className="min-h-screen"
      style={{ background: theme.bg, color: theme.fg }}
    >
      <div className="mx-auto max-w-4xl px-4 py-10">
        {/* Hero / Cover */}
        <div
          className="relative overflow-hidden rounded-2xl border shadow-2xl"
          style={{
            borderColor: "rgba(255,255,255,0.08)",
            background: cover
              ? `linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.85)), url(${cover}) center/cover`
              : `radial-gradient(circle at 80% 0%, ${theme.accent}33, transparent 55%), #0d0d0d`,
          }}
        >
          <div className="flex aspect-[16/9] flex-col justify-end p-10">
            <div
              className="text-[10px] uppercase tracking-[0.3em]"
              style={{ color: theme.accent }}
            >
              {data.organization?.name ?? "Offerte"}
            </div>
            <h1
              className="mt-2 text-4xl font-bold tracking-tight md:text-5xl"
              style={{ textShadow: `0 0 28px ${theme.accent}66` }}
            >
              {data.quote.title}
            </h1>
            {data.quote.client_name && (
              <div className="mt-2 text-sm text-white/70">
                Voor: {data.quote.client_name}
              </div>
            )}
          </div>
        </div>

        {/* Sections */}
        <div className="mt-10 space-y-10">
          {SECTION_DEFS.map((def, idx) => {
            const sec = sections.find((s) => s.key === def.key);
            if (!sec) return null;
            if (sec.key === "cover") return null;
            return (
              <section
                key={def.key}
                className="rounded-xl border bg-white/[0.02] p-8"
                style={{ borderColor: "rgba(255,255,255,0.08)" }}
              >
                <div
                  className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em]"
                  style={{ color: theme.accent }}
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold"
                    style={{ background: theme.accent, color: "#0a0a0a" }}
                  >
                    {idx}
                  </span>
                  {sec.label}
                </div>
                <h2 className="mt-3 text-2xl font-bold md:text-3xl">
                  {sec.heading}
                </h2>
                <div className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-white/85">
                  {sec.body}
                </div>
              </section>
            );
          })}
        </div>

        {/* Accept */}
        <div
          className="mt-12 overflow-hidden rounded-2xl border"
          style={{
            borderColor: accepted ? `${theme.accent}66` : "rgba(255,255,255,0.08)",
            boxShadow: accepted ? `0 0 32px ${theme.accent}44` : undefined,
          }}
        >
          {accepted ? (
            <div className="p-8 text-center">
              <CheckCircle2
                className="mx-auto h-10 w-10"
                style={{ color: theme.accent }}
              />
              <div className="mt-3 text-lg font-semibold">Offerte geaccepteerd</div>
              <div className="text-sm text-white/60">
                Door {data.quote.accepted_by_name} op{" "}
                {new Date(data.quote.accepted_at!).toLocaleString("nl-NL")}
              </div>
            </div>
          ) : (
            <div className="p-8">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em]" style={{ color: theme.accent }}>
                <Sparkles className="h-3 w-3" /> Akkoord
              </div>
              <h3 className="mt-2 text-2xl font-bold">Akkoord op deze offerte</h3>
              <p className="mt-2 text-sm text-white/70">
                Vul je naam in en plaats je handtekening om het voorstel digitaal te
                accepteren.
              </p>

              <div className="mt-5 space-y-4">
                <Input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Volledige naam"
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/40"
                />
                <SignaturePad
                  accent={theme.accent}
                  onChange={(svg) => setSig(svg)}
                  active={signing}
                  onActive={setSigning}
                />
                <Button
                  disabled={accepting || !signerName.trim() || !sig}
                  onClick={async () => {
                    setAccepting(true);
                    try {
                      await accept({
                        data: {
                          token,
                          name: signerName.trim(),
                          signature_svg: sig!,
                        },
                      });
                      toast.success("Bedankt — offerte geaccepteerd");
                      await load();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Mislukt");
                    } finally {
                      setAccepting(false);
                    }
                  }}
                  className="w-full"
                  style={{
                    background: theme.accent,
                    color: "#0a0a0a",
                    boxShadow: `0 0 20px ${theme.accent}66`,
                  }}
                >
                  {accepting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <PenLine className="mr-2 h-4 w-4" />
                  )}
                  Offerte accepteren
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-[11px] text-white/30">
          {data.organization?.name ?? ""} — vertrouwelijk
        </div>
      </div>
    </div>
  );

  function setSig(svg: string | null) {
    sigRef.current = svg;
    // force rerender via state
    setSignerName((n) => n);
  }
}

const sigRef = { current: null as string | null };
const sig = () => sigRef.current;

// helper proxy used above
Object.defineProperty(globalThis, "__sig", { get: sig });

function SignaturePad({
  accent,
  onChange,
  active,
  onActive,
}: {
  accent: string;
  onChange: (svg: string | null) => void;
  active: boolean;
  onActive: (a: boolean) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const pts = useRef<Array<Array<[number, number]>>>([]);
  const cur = useRef<Array<[number, number]>>([]);

  function reset() {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx?.clearRect(0, 0, c.width, c.height);
    pts.current = [];
    cur.current = [];
    onChange(null);
  }

  function pos(e: React.PointerEvent) {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as [number, number];
  }

  function start(e: React.PointerEvent) {
    drawing.current = true;
    onActive(true);
    cur.current = [pos(e)];
    const ctx = ref.current!.getContext("2d")!;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    const [x, y] = cur.current[0];
    ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const p = pos(e);
    cur.current.push(p);
    const ctx = ref.current!.getContext("2d")!;
    ctx.lineTo(p[0], p[1]);
    ctx.stroke();
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    pts.current.push(cur.current);
    cur.current = [];
    onChange(serialize());
  }
  function serialize() {
    const c = ref.current!;
    const paths = pts.current
      .map((p) => {
        if (p.length < 2) return "";
        const [x0, y0] = p[0];
        return (
          `M ${x0.toFixed(1)} ${y0.toFixed(1)} ` +
          p.slice(1).map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")
        );
      })
      .filter(Boolean)
      .join(" ");
    if (!paths) return null;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c.width} ${c.height}"><path d="${paths}" stroke="white" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  return (
    <div className="space-y-2">
      <div
        className="relative rounded-lg border bg-black/40"
        style={{ borderColor: active ? accent : "rgba(255,255,255,0.1)" }}
      >
        <canvas
          ref={ref}
          width={720}
          height={180}
          className="block h-[180px] w-full touch-none rounded-lg"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        {!active && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-white/30">
            Teken hier je handtekening
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={reset}
          className="text-[11px] text-white/50 hover:text-white"
        >
          Wissen
        </button>
      </div>
    </div>
  );
}
