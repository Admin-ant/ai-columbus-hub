import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, CheckCircle2, Sparkles, PenLine, Check, PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  acceptPublicStudioQuote,
  getPublicStudioQuote,
  selectPackage,
  trackSectionView,
} from "@/lib/studio-public.functions";
import {
  DEFAULT_THEME,
  SECTION_DEFS,
  toEmbedUrl,
  type StudioPackage,
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
  const pickPackage = useServerFn(selectPackage);
  const track = useServerFn(trackSectionView);
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [sig, setSig] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await get({ data: { token } });
      setData(res);
      const q = res.quote as { selected_package_id?: string | null };
      setSelected(q.selected_package_id ?? null);
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

  // Heatmap tracking — measure time per section using IntersectionObserver.
  const enterMap = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!data) return;
    const nodes = document.querySelectorAll<HTMLElement>("[data-section-key]");
    if (!nodes.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const key = e.target.getAttribute("data-section-key")!;
          if (e.isIntersecting) {
            enterMap.current.set(key, performance.now());
          } else {
            const t = enterMap.current.get(key);
            if (t) {
              const ms = Math.round(performance.now() - t);
              enterMap.current.delete(key);
              if (ms > 800) {
                track({ data: { token, section_key: key, duration_ms: ms } }).catch(() => {});
              }
            }
          }
        }
      },
      { threshold: 0.5 },
    );
    nodes.forEach((n) => obs.observe(n));
    const flush = () => {
      const now = performance.now();
      enterMap.current.forEach((t, key) => {
        const ms = Math.round(now - t);
        if (ms > 800) {
          navigator.sendBeacon?.(
            "",
            new Blob([JSON.stringify({ token, section_key: key, duration_ms: ms })]),
          );
        }
      });
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      obs.disconnect();
      window.removeEventListener("beforeunload", flush);
    };
  }, [data, token, track]);

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
  const rawPackages = (data.quote as unknown as { packages?: unknown }).packages;
  const packages: StudioPackage[] = Array.isArray(rawPackages)
    ? (rawPackages as unknown as StudioPackage[])
    : [];
  const videoUrl = (data.quote as unknown as { intro_video_url?: string | null }).intro_video_url;
  const embed = toEmbedUrl(videoUrl);
  const cover = data.quote.cover_image_url;
  const accepted = !!data.quote.accepted_at;

  return (
    <div className="min-h-screen" style={{ background: theme.bg, color: theme.fg }}>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div
          className="relative overflow-hidden rounded-2xl border shadow-2xl"
          data-section-key="cover"
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

        {/* Persoonlijke video intro */}
        {embed && (
          <div
            className="mt-10 overflow-hidden rounded-2xl border"
            data-section-key="intro-video"
            style={{ borderColor: `${theme.accent}40`, boxShadow: `0 0 32px ${theme.accent}22` }}
          >
            <div className="flex items-center gap-2 border-b border-white/10 bg-black/30 px-5 py-3">
              <PlayCircle className="h-4 w-4" style={{ color: theme.accent }} />
              <span className="text-[10px] uppercase tracking-[0.25em]" style={{ color: theme.accent }}>
                Persoonlijke intro
              </span>
            </div>
            <div className="aspect-video w-full">
              <iframe
                src={embed}
                title="Intro video"
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        )}

        <div className="mt-10 space-y-10">
          {SECTION_DEFS.map((def, idx) => {
            if (def.key === "cover") return null;
            const sec = sections.find((s) => s.key === def.key);
            if (!sec) return null;
            const isInvestering = def.key === "investering" && packages.length > 0;
            return (
              <section
                key={def.key}
                data-section-key={def.key}
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
                <h2 className="mt-3 text-2xl font-bold md:text-3xl">{sec.heading}</h2>
                <div className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-white/85">
                  {sec.body}
                </div>

                {isInvestering && (
                  <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {packages.map((p) => {
                      const isSel = selected === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={accepted}
                          onClick={async () => {
                            setSelected(p.id);
                            try {
                              await pickPackage({ data: { token, package_id: p.id } });
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Mislukt");
                            }
                          }}
                          className="group relative overflow-hidden rounded-xl border p-5 text-left transition-all hover:scale-[1.02]"
                          style={{
                            borderColor: isSel ? theme.accent : "rgba(255,255,255,0.1)",
                            background: isSel
                              ? `linear-gradient(180deg, ${theme.accent}1a, transparent)`
                              : "rgba(255,255,255,0.02)",
                            boxShadow: isSel ? `0 0 32px ${theme.accent}44` : undefined,
                          }}
                        >
                          {p.highlighted && !isSel && (
                            <div
                              className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                              style={{ background: `${theme.accent}33`, color: theme.accent }}
                            >
                              Aanbevolen
                            </div>
                          )}
                          {isSel && (
                            <div
                              className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full"
                              style={{ background: theme.accent }}
                            >
                              <Check className="h-4 w-4 text-black" />
                            </div>
                          )}
                          <div className="text-sm font-semibold text-white">{p.name}</div>
                          <div className="mt-2 flex items-baseline gap-1">
                            <span
                              className="text-3xl font-bold tracking-tight"
                              style={{ color: isSel ? theme.accent : "#fff" }}
                            >
                              €{p.price_eur.toLocaleString("nl-NL")}
                            </span>
                            <span className="text-xs text-white/50">{p.billing}</span>
                          </div>
                          <ul className="mt-4 space-y-1.5">
                            {p.features.map((f, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-xs text-white/75"
                              >
                                <Check
                                  className="mt-0.5 h-3 w-3 shrink-0"
                                  style={{ color: theme.accent }}
                                />
                                {f}
                              </li>
                            ))}
                          </ul>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <div
          className="mt-12 overflow-hidden rounded-2xl border"
          data-section-key="akkoord"
          style={{
            borderColor: accepted ? `${theme.accent}66` : "rgba(255,255,255,0.08)",
            boxShadow: accepted ? `0 0 32px ${theme.accent}44` : undefined,
          }}
        >
          {accepted ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10" style={{ color: theme.accent }} />
              <div className="mt-3 text-lg font-semibold">Offerte geaccepteerd</div>
              <div className="text-sm text-white/60">
                Door {data.quote.accepted_by_name} op{" "}
                {new Date(data.quote.accepted_at!).toLocaleString("nl-NL")}
              </div>
            </div>
          ) : (
            <div className="p-8">
              <div
                className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em]"
                style={{ color: theme.accent }}
              >
                <Sparkles className="h-3 w-3" /> Akkoord
              </div>
              <h3 className="mt-2 text-2xl font-bold">Akkoord op deze offerte</h3>
              <p className="mt-2 text-sm text-white/70">
                {packages.length > 0 && !selected
                  ? "Kies eerst een pakket hierboven, vul dan je naam en handtekening in."
                  : "Vul je naam in en plaats je handtekening om het voorstel digitaal te accepteren."}
              </p>

              <div className="mt-5 space-y-4">
                <Input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Volledige naam"
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/40"
                />
                <SignaturePad accent={theme.accent} onChange={setSig} />
                <Button
                  disabled={
                    accepting ||
                    !signerName.trim() ||
                    !sig ||
                    (packages.length > 0 && !selected)
                  }
                  onClick={async () => {
                    setAccepting(true);
                    try {
                      await accept({
                        data: { token, name: signerName.trim(), signature_svg: sig! },
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
}

function SignaturePad({
  accent,
  onChange,
}: {
  accent: string;
  onChange: (svg: string | null) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const pts = useRef<Array<Array<[number, number]>>>([]);
  const cur = useRef<Array<[number, number]>>([]);
  const [hasDrawn, setHasDrawn] = useState(false);

  function reset() {
    const c = ref.current;
    if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    pts.current = [];
    cur.current = [];
    setHasDrawn(false);
    onChange(null);
  }

  function pos(e: React.PointerEvent) {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * c.width) / r.width,
      ((e.clientY - r.top) * c.height) / r.height,
    ] as [number, number];
  }

  function start(e: React.PointerEvent) {
    drawing.current = true;
    cur.current = [pos(e)];
    const ctx = ref.current!.getContext("2d")!;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.4;
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
    if (cur.current.length > 1) pts.current.push(cur.current);
    cur.current = [];
    const svg = serialize();
    if (svg) {
      setHasDrawn(true);
      onChange(svg);
    }
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
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c.width} ${c.height}"><path d="${paths}" stroke="white" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  return (
    <div className="space-y-2">
      <div
        className="relative rounded-lg border bg-black/40"
        style={{ borderColor: hasDrawn ? accent : "rgba(255,255,255,0.1)" }}
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
        {!hasDrawn && (
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
