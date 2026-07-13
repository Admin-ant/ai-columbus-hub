import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Copy, Download, Eye, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APPT_LOCALES } from "@/lib/appointment-i18n";
import { previewAppointmentEmailHtml } from "@/lib/appointments.functions";

export const Route = createFileRoute("/_authenticated/mail/appointment-preview")({
  head: () => ({ meta: [{ title: "Preview afspraakmail" }] }),
  component: AppointmentMailPreview,
});

type Variant = "confirm" | "cancel" | "reschedule";
type Locale = "nl" | "en" | "de";

function AppointmentMailPreview() {
  const preview = useServerFn(previewAppointmentEmailHtml);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [locale, setLocale] = useState<Locale>("nl");
  const [variant, setVariant] = useState<Variant>("confirm");
  const [title, setTitle] = useState("");
  const [attendee, setAttendee] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [html, setHtml] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(false);
  const [sampleToken, setSampleToken] = useState("preview-confirm-abc123");

  const render = useCallback(async () => {
    setLoading(true);
    try {
      const res = await preview({
        data: {
          locale,
          variant,
          title: title || undefined,
          attendee_name: attendee || undefined,
          location: location || undefined,
          description: description || undefined,
          custom_message: customMessage || undefined,
        },
      });
      setHtml(res.html);
      setSubject(res.subject);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kon voorbeeld niet renderen");
    } finally {
      setLoading(false);
    }
  }, [preview, locale, variant, title, attendee, location, description, customMessage]);

  useEffect(() => {
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, variant]);

  useEffect(() => {
    setSampleToken(`preview-${variant}-abc123`);
  }, [variant]);

  const publicUrl = useMemo(() => `/afspraak/${sampleToken}`, [sampleToken]);

  function download() {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `afspraakmail-${locale}-${variant}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function copyHtml() {
    try {
      await navigator.clipboard.writeText(html);
      toast.success("HTML gekopieerd naar klembord");
    } catch {
      toast.error("Kopiëren mislukt");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/agenda" className="inline-flex items-center hover:underline">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Terug naar agenda
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Preview afspraakmail</h1>
          <p className="text-sm text-muted-foreground">
            Render de e-mail en de bijbehorende klantpagina met echte voorbeelddata — er wordt niets verzonden en er
            worden geen afspraken aangemaakt.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={render} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            Vernieuwen
          </Button>
          <Button variant="outline" onClick={copyHtml} disabled={!html}>
            <Copy className="mr-1.5 h-4 w-4" /> Kopieer HTML
          </Button>
          <Button variant="outline" onClick={download} disabled={!html}>
            <Download className="mr-1.5 h-4 w-4" /> Download .html
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4 rounded-lg border bg-card p-4">
          <div className="space-y-1.5">
            <Label>Taal</Label>
            <div className="flex gap-1.5">
              {APPT_LOCALES.map((l) => (
                <Button
                  key={l.code}
                  size="sm"
                  variant={locale === l.code ? "default" : "outline"}
                  onClick={() => setLocale(l.code)}
                  className="h-8 text-xs"
                >
                  {l.flag} {l.code.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Variant</Label>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { k: "confirm", label: "Bevestigen" },
                  { k: "reschedule", label: "Verplaatst" },
                  { k: "cancel", label: "Geannuleerd" },
                ] as const
              ).map((v) => (
                <Button
                  key={v.k}
                  size="sm"
                  variant={variant === v.k ? "default" : "outline"}
                  onClick={() => setVariant(v.k)}
                  className="h-8 text-xs"
                >
                  {v.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Titel</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Standaard voorbeeldtitel" />
          </div>
          <div className="space-y-1.5">
            <Label>Naam deelnemer</Label>
            <Input value={attendee} onChange={(e) => setAttendee(e.target.value)} placeholder="Sander / Alex …" />
          </div>
          <div className="space-y-1.5">
            <Label>Locatie</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Google Meet" />
          </div>
          <div className="space-y-1.5">
            <Label>Omschrijving</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Persoonlijke boodschap</Label>
            <Textarea
              rows={2}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Optioneel — verschijnt in oranje kader"
            />
          </div>
          <Button className="w-full" onClick={render} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Voorbeeld renderen
          </Button>
          <div className="rounded-md border-l-2 border-brand bg-muted/40 p-2.5 text-xs text-muted-foreground">
            <div className="mb-1 font-semibold text-foreground">Onderwerp</div>
            <div className="break-words">{subject || "—"}</div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
              <span>📧 E-mail preview</span>
              <span>Taal: {locale.toUpperCase()} · Variant: {variant}</span>
            </div>
            <iframe
              ref={iframeRef}
              title="Afspraakmail voorbeeld"
              srcDoc={html || "<p style='font-family:sans-serif;padding:24px;color:#888'>Vul de velden in en klik op renderen…</p>"}
              className="h-[720px] w-full rounded-b-lg bg-white"
            />
          </div>

          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
              <span>🔗 Klantpagina /afspraak/{sampleToken}</span>
              <Button size="sm" variant="ghost" asChild className="h-6 text-xs">
                <Link to="/afspraak/$token" params={{ token: sampleToken }} target="_blank" rel="noopener noreferrer">
                  <Eye className="mr-1 h-3 w-3" /> Open in nieuw tabblad
                </Link>
              </Button>
            </div>
            <div className="p-4 text-sm text-muted-foreground">
              Deze pagina wordt vanuit de e-mail geopend als de klant op <b>Bevestigen</b> of <b>Verzetten</b> klikt.
              Voor een echt token opent hij de statuskaart met knoppen om te bevestigen of een nieuwe datum voor te
              stellen. Het voorbeeld-token <code>{sampleToken}</code> bestaat niet in de database — je krijgt de
              foutpagina te zien, maar de rendering en tekstvertalingen zijn identiek aan de echte flow. Test de echte
              flow door in de agenda een afspraak met je eigen mailadres te maken en deze te sturen.
            </div>
            <div className="grid gap-3 border-t p-4 text-sm sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Bevestigingsflow</div>
                <ol className="list-inside list-decimal space-y-0.5 text-muted-foreground">
                  <li>Klant klikt <b>{variantLabel(variant, locale, "confirm")}</b></li>
                  <li>API-call: <code>confirm_appointment_by_token</code></li>
                  <li>Status → <span className="text-emerald-600">confirmed</span></li>
                  <li>Agenda toont badge ✓ Bevestigd door klant</li>
                </ol>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Verplaatsingsflow</div>
                <ol className="list-inside list-decimal space-y-0.5 text-muted-foreground">
                  <li>Klant klikt <b>{variantLabel(variant, locale, "reschedule")}</b></li>
                  <li>Vult voorstel-tekst in (max 1000 tekens)</li>
                  <li>API-call: <code>request_reschedule_by_token</code></li>
                  <li>Agenda toont badge ↻ Verzoek tot verzetten + notitie</li>
                </ol>
              </div>
            </div>
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">
              Publieke URL bij een echte afspraak: <code>https://ai-columbus-hub.lovable.app{publicUrl}</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function variantLabel(_variant: Variant, locale: Locale, kind: "confirm" | "reschedule"): string {
  const map = {
    nl: { confirm: "✓ Bevestigen", reschedule: "↻ Verzetten" },
    en: { confirm: "✓ Confirm", reschedule: "↻ Reschedule" },
    de: { confirm: "✓ Bestätigen", reschedule: "↻ Verschieben" },
  } as const;
  return map[locale][kind];
}
