import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Loader2, PenLine, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { acceptQuoteByToken, getPublicQuote } from "@/lib/quote-public.functions";

export const Route = createFileRoute("/o/$token")({
  head: ({ params }) => ({ meta: [{ title: `Offerte • ${params.token.slice(0, 6)}` }] }),
  component: PublicQuotePage,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
      <div className="rounded-lg border bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold">Offerte niet beschikbaar</h1>
        <p className="mt-2 text-sm text-slate-600">{(error as Error).message}</p>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      Offerte niet gevonden
    </div>
  ),
});

type Loaded = Awaited<ReturnType<typeof getPublicQuote>>;
type LineItem = { description: string; quantity: number; unit_price: number };

function PublicQuotePage() {
  const { token } = useParams({ from: "/o/$token" });
  const get = useServerFn(getPublicQuote);
  const accept = useServerFn(acceptQuoteByToken);

  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [signOpen, setSignOpen] = useState(false);

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

  const eur = useMemo(
    () => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }),
    [],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-900">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Laden…
      </div>
    );
  }
  if (!data) return null;

  const q = data.quote as {
    title: string;
    total_amount: number | null;
    content_json: unknown;
    accepted_at: string | null;
    accepted_by_name: string | null;
    signature_svg: string | null;
    created_at: string;
  };
  const lines: LineItem[] = Array.isArray((q.content_json as { lines?: LineItem[] })?.lines)
    ? (q.content_json as { lines: LineItem[] }).lines
    : [];
  const accepted = !!q.accepted_at;
  const dateStr = new Date(q.created_at).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b bg-slate-900 px-8 py-6 text-white">
            <div className="text-xs uppercase tracking-widest text-slate-300">
              {data.organization?.name ?? "Offerte"}
            </div>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">{q.title}</h1>
            {data.client_name && (
              <div className="mt-1 text-sm text-slate-300">Voor: {data.client_name}</div>
            )}
            <div className="mt-1 text-xs text-slate-400">{dateStr}</div>
          </div>

          <div className="space-y-6 p-8">
            {lines.length > 0 ? (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Omschrijving</th>
                      <th className="w-16 px-4 py-2.5 text-right">Aantal</th>
                      <th className="w-28 px-4 py-2.5 text-right">Prijs</th>
                      <th className="w-28 px-4 py-2.5 text-right">Totaal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-4 py-2.5">{l.description || "—"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{l.quantity}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {eur.format(Number(l.unit_price || 0))}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                          {eur.format(Number(l.quantity || 0) * Number(l.unit_price || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Deze offerte bevat geen specificatie van regels.
              </p>
            )}

            <div className="flex items-center justify-between border-t pt-4">
              <div className="text-xs uppercase tracking-wider text-slate-500">Totaal</div>
              <div className="text-2xl font-bold tabular-nums">
                {eur.format(Number(q.total_amount ?? 0))}
              </div>
            </div>

            {accepted ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                <div className="mt-2 text-base font-semibold text-emerald-900">
                  Offerte geaccepteerd
                </div>
                <div className="text-sm text-emerald-800">
                  Door {q.accepted_by_name} op{" "}
                  {new Date(q.accepted_at!).toLocaleString("nl-NL")}
                </div>
                {q.signature_svg && (
                  <div
                    className="mx-auto mt-3 max-w-xs rounded border bg-white p-2"
                    dangerouslySetInnerHTML={{ __html: q.signature_svg }}
                  />
                )}
              </div>
            ) : (
              <Button
                onClick={() => setSignOpen(true)}
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                size="lg"
              >
                <PenLine className="mr-2 h-4 w-4" />
                Offerte goedkeuren & ondertekenen
              </Button>
            )}
          </div>
        </div>

        <div className="mt-6 text-center text-[11px] text-slate-400">
          {data.organization?.name ?? ""} — vertrouwelijk
        </div>
      </div>

      <SignDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        offerteTitle={q.title}
        bedrijf={data.organization?.name ?? ""}
        datum={dateStr}
        onAccept={async (payload) => {
          await accept({ data: { token, ...payload } });
          toast.success("Bedankt — offerte geaccepteerd");
          setSignOpen(false);
          await load();
        }}
      />
    </div>
  );
}

function SignDialog({
  open,
  onOpenChange,
  offerteTitle,
  bedrijf,
  datum,
  onAccept,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  offerteTitle: string;
  bedrijf: string;
  datum: string;
  onAccept: (p: { name: string; signature_svg: string; terms_accepted: true }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [typed, setTyped] = useState("");
  const [drawnSvg, setDrawnSvg] = useState<string | null>(null);
  const [tab, setTab] = useState<"typen" | "tekenen">("typen");
  const [terms, setTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const signatureSvg = useMemo(() => {
    if (tab === "typen" && typed.trim()) {
      const safe = typed.replace(/[<>&"']/g, (c) =>
        ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]!),
      );
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100" width="400" height="100"><text x="20" y="70" font-family="'Brush Script MT', cursive" font-size="48" fill="#0f172a">${safe}</text></svg>`;
    }
    if (tab === "tekenen") return drawnSvg;
    return null;
  }, [tab, typed, drawnSvg]);

  const canSubmit = !!name.trim() && !!signatureSvg && terms && !submitting;

  async function submit() {
    if (!canSubmit || !signatureSvg) return;
    setSubmitting(true);
    try {
      await onAccept({ name: name.trim(), signature_svg: signatureSvg, terms_accepted: true });
      setName("");
      setTyped("");
      setDrawnSvg(null);
      setTerms(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ondertekenen mislukt");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Offerte goedkeuren</DialogTitle>
          <DialogDescription>
            We vinden het fantastisch wanneer u voor ons bedrijf kiest voor de uitvoering van uw
            opdracht!
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm sm:grid-cols-[140px_1fr]">
          <div className="text-slate-500">Offerte:</div>
          <div className="font-semibold">{offerteTitle}</div>
          <div className="text-slate-500">Bedrijfsnaam:</div>
          <div className="font-semibold">{bedrijf || "—"}</div>
          <div className="text-slate-500">Datum:</div>
          <div className="font-semibold">{datum}</div>

          <Label htmlFor="signer-name" className="pt-2 text-slate-500">
            Naam:<span className="text-red-500">*</span>
          </Label>
          <Input
            id="signer-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vul je naam in"
            maxLength={120}
            required
          />

          <div className="pt-2 text-slate-500">
            Handtekening:<span className="text-red-500">*</span>
          </div>
          <div>
            <Tabs value={tab} onValueChange={(v) => setTab(v as "typen" | "tekenen")}>
              <TabsList>
                <TabsTrigger value="typen">Typen</TabsTrigger>
                <TabsTrigger value="tekenen">Tekenen</TabsTrigger>
              </TabsList>
              <TabsContent value="typen" className="mt-3 space-y-2">
                <Input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="Type je handtekening hier"
                  className="border-0 border-b border-slate-300 rounded-none focus-visible:ring-0 px-0 text-lg"
                  maxLength={80}
                />
                <div className="flex h-32 items-center justify-center rounded border bg-slate-50">
                  {typed.trim() ? (
                    <span style={{ fontFamily: "'Brush Script MT', cursive" }} className="text-4xl text-slate-900">
                      {typed}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Voorbeeld verschijnt hier</span>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="tekenen" className="mt-3">
                <DrawPad onChange={setDrawnSvg} />
              </TabsContent>
            </Tabs>

            <label className="mt-4 flex items-start gap-2 text-sm">
              <Checkbox
                checked={terms}
                onCheckedChange={(v) => setTerms(v === true)}
                aria-label="Akkoord met voorwaarden"
                className="mt-0.5"
              />
              <span className="text-slate-700">
                Ja, ik ga akkoord met dit voorstel en de van toepassing zijnde algemene voorwaarden.
              </span>
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            <X className="mr-1 h-4 w-4" />
            Sluiten
          </Button>
          <Button
            onClick={submit}
            disabled={!canSubmit}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PenLine className="mr-2 h-4 w-4" />
            )}
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DrawPad({ onChange }: { onChange: (svg: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const pts = useRef<Array<Array<[number, number]>>>([]);
  const cur = useRef<Array<[number, number]>>([]);

  function clear() {
    const c = ref.current;
    if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    pts.current = [];
    cur.current = [];
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
    ctx.strokeStyle = "#0f172a";
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
    onChange(serialize());
  }
  function serialize() {
    if (pts.current.length === 0) return null;
    const paths = pts.current
      .map((stroke) => {
        const d = stroke
          .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
          .join(" ");
        return `<path d="${d}" fill="none" stroke="#0f172a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
      })
      .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" width="600" height="200">${paths}</svg>`;
  }

  return (
    <div>
      <canvas
        ref={ref}
        width={600}
        height={200}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-40 w-full touch-none rounded border bg-white"
      />
      <div className="mt-2 flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clear}>
          Wissen
        </Button>
      </div>
    </div>
  );
}
