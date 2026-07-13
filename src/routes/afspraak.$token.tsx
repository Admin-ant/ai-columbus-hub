import { createFileRoute, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Calendar, CheckCircle2, Clock, MapPin, RefreshCw, User, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import logoAsset from "@/assets/logo-columbus-full.png.asset.json";
import {
  confirmAppointmentByToken,
  getAppointmentByToken,
  requestRescheduleByToken,
} from "@/lib/public-appointment.functions";

export const Route = createFileRoute("/afspraak/$token")({
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.title} — Afspraakbevestiging` : "Afspraak" },
      { name: "description", content: "Bevestig of verzet je geplande afspraak." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: async ({ params }) => {
    try {
      return await getAppointmentByToken({ data: { token: params.token } });
    } catch {
      throw notFound();
    }
  },
  errorComponent: () => (
    <ErrorShell
      title="Link niet geldig"
      message="Deze afspraaklink werkt niet meer. Neem contact op met de organisator."
    />
  ),
  notFoundComponent: () => (
    <ErrorShell
      title="Afspraak niet gevonden"
      message="Deze afspraaklink is ongeldig of ingetrokken."
    />
  ),
  component: AppointmentPublicPage,
});

const DATE_FMT: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
};

function AppointmentPublicPage() {
  const initial = Route.useLoaderData();
  const { token } = Route.useParams();
  const confirmFn = useServerFn(confirmAppointmentByToken);
  const rescheduleFn = useServerFn(requestRescheduleByToken);
  const refetch = useServerFn(getAppointmentByToken);

  const [appt, setAppt] = useState(initial);
  const [busy, setBusy] = useState<"confirm" | "reschedule" | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [note, setNote] = useState("");

  const start = new Date(appt.starts_at);
  const end = new Date(appt.ends_at);
  const cancelled = appt.status === "cancelled";
  const confirmed = !!appt.confirmed_at && appt.status !== "cancelled";
  const rescheduleRequested = !!appt.reschedule_requested_at && !confirmed;

  async function reload() {
    try {
      const fresh = await refetch({ data: { token } });
      setAppt(fresh);
    } catch {
      /* ignore */
    }
  }

  async function onConfirm() {
    setBusy("confirm");
    try {
      await confirmFn({ data: { token } });
      toast.success("Bedankt! Je afspraak is bevestigd.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Er ging iets mis");
    } finally {
      setBusy(null);
    }
  }

  async function onReschedule() {
    setBusy("reschedule");
    try {
      await rescheduleFn({ data: { token, note } });
      toast.success("Verzoek tot verzetten verstuurd");
      setShowReschedule(false);
      setNote("");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Er ging iets mis");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#faf7f2] via-white to-[#f4efe7] px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex justify-center">
          <img src={logoAsset.url} alt="AI van Columbus" className="h-14 w-auto" />
        </div>

        <div className="overflow-hidden rounded-2xl border border-black/5 bg-card shadow-xl">
          <div className="relative bg-gradient-to-br from-[#ff6a3d] via-[#ff8a4a] to-[#ffb37a] p-6 text-white">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/80">
              {appt.organization_name ?? "Afspraakbevestiging"}
            </p>
            <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{appt.title}</h1>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 opacity-90" />
                <span>{start.toLocaleDateString("nl-NL", DATE_FMT)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 opacity-90" />
                <span>
                  {start.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })} –{" "}
                  {end.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-6">
            {(appt.location || appt.attendee_name) && (
              <dl className="grid gap-3 text-sm">
                {appt.location && (
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">Locatie</dt>
                      <dd className="font-medium">{appt.location}</dd>
                    </div>
                  </div>
                )}
                {appt.attendee_name && (
                  <div className="flex items-start gap-3">
                    <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">Voor</dt>
                      <dd className="font-medium">{appt.attendee_name}</dd>
                    </div>
                  </div>
                )}
              </dl>
            )}

            {appt.description && (
              <div className="rounded-lg bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-wrap">
                {appt.description}
              </div>
            )}

            <StatusBanner
              cancelled={cancelled}
              confirmed={confirmed}
              rescheduleRequested={rescheduleRequested}
              confirmedAt={appt.confirmed_at}
              rescheduleAt={appt.reschedule_requested_at}
            />

            {!cancelled && !showReschedule && (
              <div className="grid gap-2 pt-2 sm:grid-cols-2">
                <Button
                  size="lg"
                  onClick={onConfirm}
                  disabled={busy !== null || confirmed}
                  className="bg-[#ff6a3d] text-white hover:bg-[#e85a30]"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {confirmed ? "Bevestigd" : busy === "confirm" ? "Bezig…" : "Bevestigen"}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setShowReschedule(true)}
                  disabled={busy !== null}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Verzetten
                </Button>
              </div>
            )}

            {!cancelled && showReschedule && (
              <div className="space-y-3 rounded-lg border border-dashed p-4">
                <p className="text-sm font-medium">Op welke momenten kan het wél?</p>
                <Textarea
                  rows={4}
                  placeholder="Bijv. woensdag na 15:00 of donderdagochtend"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={onReschedule}
                    disabled={busy !== null}
                    className="bg-[#ff6a3d] text-white hover:bg-[#e85a30]"
                  >
                    {busy === "reschedule" ? "Bezig…" : "Verstuur verzoek"}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowReschedule(false)} disabled={busy !== null}>
                    Terug
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t bg-muted/30 px-6 py-4 text-center text-xs text-muted-foreground">
            Vragen? Antwoord direct op de bevestigingsmail — dan komt je bericht bij ons binnen.
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Gemaakt met ♥ door {appt.organization_name ?? "AI van Columbus"}
        </p>
      </div>
    </div>
  );
}

function StatusBanner({
  cancelled,
  confirmed,
  rescheduleRequested,
  confirmedAt,
  rescheduleAt,
}: {
  cancelled: boolean;
  confirmed: boolean;
  rescheduleRequested: boolean;
  confirmedAt: string | null;
  rescheduleAt: string | null;
}) {
  if (cancelled) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        <XCircle className="mt-0.5 h-4 w-4" />
        <span>Deze afspraak is geannuleerd.</span>
      </div>
    );
  }
  if (confirmed) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
        <CheckCircle2 className="mt-0.5 h-4 w-4" />
        <span>
          Bevestigd op{" "}
          {confirmedAt ? new Date(confirmedAt).toLocaleString("nl-NL", { dateStyle: "long", timeStyle: "short" }) : ""}.
        </span>
      </div>
    );
  }
  if (rescheduleRequested) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <RefreshCw className="mt-0.5 h-4 w-4" />
        <span>
          Verzoek tot verzetten ontvangen{" "}
          {rescheduleAt ? `op ${new Date(rescheduleAt).toLocaleString("nl-NL", { dateStyle: "long", timeStyle: "short" })}` : ""}
          . We nemen zo snel mogelijk contact op met een nieuw voorstel.
        </span>
      </div>
    );
  }
  return null;
}

function ErrorShell({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#faf7f2] to-[#f4efe7] p-6">
      <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-lg">
        <img src={logoAsset.url} alt="AI van Columbus" className="mx-auto mb-4 h-12 w-auto" />
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
