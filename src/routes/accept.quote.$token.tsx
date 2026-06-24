import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, Loader2, ShieldCheck, FileSignature, CreditCard, Eye, Receipt, ScrollText, Clock, X, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  getPublicQuote,
  signPublicQuote,
  payPublicQuote,
} from "@/lib/public-quote.functions";

export const Route = createFileRoute("/accept/quote/$token")({
  head: () => ({
    meta: [
      { title: "Offerte ondertekenen" },
      { name: "description", content: "Ondertekenen en betalen van uw offerte." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AcceptQuotePage,
});

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

function AcceptQuotePage() {
  const { token } = Route.useParams();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const getFn = useServerFn(getPublicQuote);
  const signFn = useServerFn(signPublicQuote);
  const payFn = useServerFn(payPublicQuote);
  const [signature, setSignature] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [typed, setTyped] = useState("");
  const [signTab, setSignTab] = useState<"typen" | "tekenen">("typen");
  const [terms, setTerms] = useState(false);

  const eur = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en-IE" : "nl-NL", {
        style: "currency",
        currency: "EUR",
      }),
    [i18n.resolvedLanguage],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-quote", token],
    queryFn: () => getFn({ data: { token } }),
    retry: false,
  });

  const sign = useMutation({
    mutationFn: (vars: { signature_svg: string; name: string }) =>
      signFn({
        data: {
          token,
          signature_svg: vars.signature_svg,
          name: vars.name,
          terms_accepted: true as const,
        },
      }),
    onSuccess: () => {
      toast.success(t("accept.signed_ok"));
      setSignOpen(false);
      setSignerName("");
      setTyped("");
      setSignature(null);
      setTerms(false);
      qc.invalidateQueries({ queryKey: ["public-quote", token] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pay = useMutation({
    mutationFn: () => payFn({ data: { token } }),
    onSuccess: (r) => {
      toast.success(t("accept.paid_ok", { number: r.invoice_number ?? "" }));
      qc.invalidateQueries({ queryKey: ["public-quote", token] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("common.loading")}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>{t("accept.not_found")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {(error as Error | undefined)?.message ?? t("accept.invalid_link")}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { quote, organization, events, journal_entry_id } = data;
  const lines = ((quote.content_json as { lines?: LineItem[] } | null)?.lines ?? []) as LineItem[];
  const isPaid = quote.status === "approved_paid";
  const isSigned = quote.status === "signed" || isPaid;
  const brand = organization?.brand_color ?? "#0f172a";

  const eventMeta: Record<string, { label: string; icon: typeof Eye; tone: string }> = {
    viewed: { label: t("accept.event.viewed") || "Bekeken", icon: Eye, tone: "text-muted-foreground" },
    signed: { label: t("accept.event.signed") || "Ondertekend", icon: FileSignature, tone: "text-blue-600" },
    paid: { label: t("accept.event.paid") || "Betaald", icon: CheckCircle2, tone: "text-emerald-600" },
    invoice_created: { label: t("accept.event.invoice_created") || "Factuur aangemaakt", icon: Receipt, tone: "text-indigo-600" },
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      <header
        className="border-b"
        style={{ borderTopColor: brand, borderTopWidth: 4, borderTopStyle: "solid" }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            {organization?.logo_url ? (
              <img src={organization.logo_url} alt={organization.name ?? ""} className="h-8 w-8 rounded" />
            ) : (
              <div
                className="grid h-8 w-8 place-items-center rounded text-xs font-bold text-white"
                style={{ background: brand }}
              >
                {organization?.name?.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <div className="text-sm font-semibold">{organization?.name}</div>
              <div className="text-xs text-muted-foreground">{t("accept.subtitle")}</div>
            </div>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{quote.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("accept.issued_on")}{" "}
              {new Date(quote.created_at).toLocaleDateString(i18n.resolvedLanguage ?? "nl")}
            </p>
          </div>
          <Badge variant="outline" className="capitalize">
            {t(`quotes.status.${quote.status}`)}
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("quotes.line_items")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {lines.length === 0 && (
                <div className="py-4 text-sm text-muted-foreground">{t("accept.no_lines")}</div>
              )}
              {lines.map((l, i) => (
                <div key={i} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <div>
                    <div className="font-medium">{l.description || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.quantity} × {eur.format(Number(l.unit_price ?? 0))}
                    </div>
                  </div>
                  <div className="tabular-nums">
                    {eur.format(Number(l.quantity ?? 0) * Number(l.unit_price ?? 0))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between border-t pt-4 text-base font-semibold">
              <span>{t("quotes.total")}</span>
              <span className="tabular-nums">{eur.format(Number(quote.total_amount ?? 0))}</span>
            </div>
          </CardContent>
        </Card>

        {isPaid ? (
          <Card className="border-emerald-500/40 bg-emerald-500/5">
            <CardContent className="flex items-center gap-3 py-6">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <div>
                <div className="font-semibold">{t("accept.paid_title")}</div>
                <div className="text-sm text-muted-foreground">
                  {t("accept.paid_subtitle", { id: quote.mollie_payment_id ?? "—" })}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileSignature className="h-4 w-4" /> {t("accept.signature")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isSigned && quote.signature_svg ? (
                  <div className="rounded-md border bg-white p-3">
                    <div
                      className="max-h-[180px] [&_svg]:h-auto [&_svg]:w-full"
                      dangerouslySetInnerHTML={{ __html: quote.signature_svg }}
                    />
                    <div className="mt-2 text-xs text-muted-foreground">
                      {t("accept.signed_on")}{" "}
                      {quote.signed_at
                        ? new Date(quote.signed_at).toLocaleString(i18n.resolvedLanguage ?? "nl")
                        : ""}
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Klik op de knop hieronder om de offerte digitaal goed te keuren en te ondertekenen.
                    </p>
                    <Button
                      onClick={() => setSignOpen(true)}
                      style={{ background: brand }}
                    >
                      <FileSignature className="mr-2 h-4 w-4" />
                      Offerte goedkeuren
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {isSigned && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CreditCard className="h-4 w-4" /> {t("accept.payment")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {t("accept.payment_desc")}
                  </p>
                  <Button
                    onClick={() => pay.mutate()}
                    disabled={pay.isPending}
                    style={{ background: brand }}
                  >
                    {pay.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    {t("accept.pay_button", { amount: eur.format(Number(quote.total_amount ?? 0)) })}
                  </Button>
                  <p className="text-xs text-muted-foreground">{t("accept.mock_note")}</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {(events.length > 0 || journal_entry_id) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" /> {t("accept.history") || "Statushistorie"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("accept.no_events") || "Nog geen activiteit."}</p>
              ) : (
                <ol className="space-y-2">
                  {events.map((ev) => {
                    const m = eventMeta[ev.event_type] ?? { label: ev.event_type, icon: Clock, tone: "text-muted-foreground" };
                    const Icon = m.icon;
                    return (
                      <li key={ev.id} className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                        <span className={`flex items-center gap-2 font-medium ${m.tone}`}>
                          <Icon className="h-4 w-4" /> {m.label}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {new Date(ev.occurred_at).toLocaleString(i18n.resolvedLanguage ?? "nl")}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
              {journal_entry_id && (
                <a
                  href={`/boekhouding/journal/${journal_entry_id}`}
                  className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  <ScrollText className="h-4 w-4" />
                  {t("accept.view_journal") || "Bekijk geboekte post"}
                </a>
              )}
            </CardContent>
          </Card>
        )}



        <footer className="pt-6 text-center text-xs text-muted-foreground">
          {organization?.name} · {t("accept.secured")}
        </footer>
      </main>

      <SignDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        offerteTitle={quote.title}
        bedrijf={organization?.name ?? ""}
        datum={new Date(quote.created_at).toLocaleDateString(i18n.resolvedLanguage ?? "nl", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })}
        signerName={signerName}
        setSignerName={setSignerName}
        signTab={signTab}
        setSignTab={setSignTab}
        typed={typed}
        setTyped={setTyped}
        drawnSvg={signature}
        setDrawnSvg={setSignature}
        terms={terms}
        setTerms={setTerms}
        submitting={sign.isPending}
        onSubmit={() => {
          // Build effective signature_svg from active tab
          const eff = computeSignature(signTab, typed, signature);
          if (!signerName.trim()) return toast.error("Naam is verplicht");
          if (!eff) return toast.error("Handtekening is verplicht");
          if (!terms) return toast.error("Akkoord met voorwaarden is verplicht");
          setSignature(eff);
          // mutate uses signature state; ensure we pass it directly via setSignature, but mutate reads current via closure
          // So call signFn directly to avoid stale state:
          sign.mutate();
        }}
      />
    </div>
  );
}

function computeSignature(
  tab: "typen" | "tekenen",
  typed: string,
  drawnSvg: string | null,
): string | null {
  if (tab === "typen") {
    const txt = typed.trim();
    if (!txt) return null;
    const safe = txt.replace(/[<>&"']/g, (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]!),
    );
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100" width="400" height="100"><text x="20" y="70" font-family="'Brush Script MT', cursive" font-size="48" fill="#0f172a">${safe}</text></svg>`;
  }
  return drawnSvg;
}

type SignDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  offerteTitle: string;
  bedrijf: string;
  datum: string;
  signerName: string;
  setSignerName: (v: string) => void;
  signTab: "typen" | "tekenen";
  setSignTab: (v: "typen" | "tekenen") => void;
  typed: string;
  setTyped: (v: string) => void;
  drawnSvg: string | null;
  setDrawnSvg: (v: string | null) => void;
  terms: boolean;
  setTerms: (v: boolean) => void;
  submitting: boolean;
  onSubmit: () => void;
};

function SignDialog(p: SignDialogProps) {
  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Offerte goedkeuren</DialogTitle>
          <DialogDescription>
            We vinden het fantastisch wanneer u voor ons bedrijf kiest voor de uitvoering van uw opdracht!
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm sm:grid-cols-[140px_1fr]">
          <div className="text-muted-foreground">Offerte:</div>
          <div className="font-semibold">{p.offerteTitle}</div>
          <div className="text-muted-foreground">Bedrijfsnaam:</div>
          <div className="font-semibold">{p.bedrijf || "—"}</div>
          <div className="text-muted-foreground">Datum:</div>
          <div className="font-semibold">{p.datum}</div>

          <Label htmlFor="signer-name" className="pt-2 text-muted-foreground">
            Naam:<span className="text-red-500">*</span>
          </Label>
          <Input
            id="signer-name"
            value={p.signerName}
            onChange={(e) => p.setSignerName(e.target.value)}
            placeholder="Vul je naam in"
            maxLength={120}
            required
          />

          <div className="pt-2 text-muted-foreground">
            Handtekening:<span className="text-red-500">*</span>
          </div>
          <div>
            <Tabs value={p.signTab} onValueChange={(v) => p.setSignTab(v as "typen" | "tekenen")}>
              <TabsList>
                <TabsTrigger value="typen">Typen</TabsTrigger>
                <TabsTrigger value="tekenen">Tekenen</TabsTrigger>
              </TabsList>
              <TabsContent value="typen" className="mt-3 space-y-2">
                <Input
                  value={p.typed}
                  onChange={(e) => p.setTyped(e.target.value)}
                  placeholder="Type je handtekening hier"
                  className="border-0 border-b border-input rounded-none focus-visible:ring-0 px-0 text-lg"
                  maxLength={80}
                />
                <div className="flex h-32 items-center justify-center rounded border bg-muted/30">
                  {p.typed.trim() ? (
                    <span style={{ fontFamily: "'Brush Script MT', cursive" }} className="text-4xl">
                      {p.typed}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Voorbeeld verschijnt hier</span>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="tekenen" className="mt-3">
                <DrawPad onChange={p.setDrawnSvg} />
              </TabsContent>
            </Tabs>

            <label className="mt-4 flex items-start gap-2 text-sm">
              <Checkbox
                checked={p.terms}
                onCheckedChange={(v) => p.setTerms(v === true)}
                aria-label="Akkoord met voorwaarden"
                className="mt-0.5"
              />
              <span>
                Ja, ik ga akkoord met dit voorstel en de van toepassing zijnde algemene voorwaarden.
              </span>
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => p.onOpenChange(false)} disabled={p.submitting}>
            <X className="mr-1 h-4 w-4" /> Sluiten
          </Button>
          <Button
            onClick={p.onSubmit}
            disabled={p.submitting}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {p.submitting ? (
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
