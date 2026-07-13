import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Mail, Plus, Send, Trash2, X, Ban, CalendarClock } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createAppointment,
  deleteAppointment,
  rescheduleAppointment,
  sendAppointmentInvite,
  updateAppointment,
} from "@/lib/appointments.functions";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda" }] }),
  component: AgendaPage,
});

type Appointment = {
  id: string;
  organization_id: string;
  client_id: string | null;
  lead_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  attendee_name: string | null;
  attendee_email: string | null;
  status: string;
  invite_sent_at: string | null;
  confirmed_at: string | null;
  reschedule_requested_at: string | null;
  reschedule_note: string | null;
  created_at: string;
};

type ClientRow = { id: string; name: string; email: string | null };

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}
function fromLocalInput(v: string): string {
  return new Date(v).toISOString();
}

function AgendaPage() {
  const { currentOrganizationId, currentOrganization, loading: wsLoading } = useWorkspace();
  const [items, setItems] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"upcoming" | "past" | "all">("upcoming");
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  async function load() {
    if (!currentOrganizationId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: appts, error }, { data: cl }] = await Promise.all([
      supabase
        .from("appointments")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("starts_at", { ascending: true }),
      supabase
        .from("clients")
        .select("id,name,email")
        .eq("organization_id", currentOrganizationId)
        .order("name"),
    ]);
    if (error) toast.error(error.message);
    setItems((appts ?? []) as Appointment[]);
    setClients((cl ?? []) as ClientRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!wsLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganizationId, wsLoading]);

  const grouped = useMemo(() => {
    const now = Date.now();
    const filtered = items.filter((a) => {
      if (selectedDay) {
        return new Date(a.starts_at).toISOString().slice(0, 10) === selectedDay;
      }
      const t = new Date(a.starts_at).getTime();
      if (scope === "upcoming") return t >= now - 3600_000;
      if (scope === "past") return t < now - 3600_000;
      return true;
    });
    const map = new Map<string, Appointment[]>();
    for (const a of filtered) {
      const key = new Date(a.starts_at).toLocaleDateString("nl-NL", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [items, scope, selectedDay]);

  const monthGrid = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const first = new Date(y, m, 1);
    // Mon=0..Sun=6
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: Array<{ date: Date; key: string; inMonth: boolean; count: number }> = [];
    const counts = new Map<string, number>();
    for (const a of items) {
      const k = new Date(a.starts_at).toISOString().slice(0, 10);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    // leading days from previous month
    for (let i = startOffset; i > 0; i--) {
      const d = new Date(y, m, 1 - i);
      const key = d.toISOString().slice(0, 10);
      cells.push({ date: d, key, inMonth: false, count: counts.get(key) ?? 0 });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(y, m, d);
      const key = dt.toISOString().slice(0, 10);
      cells.push({ date: dt, key, inMonth: true, count: counts.get(key) ?? 0 });
    }
    // trailing days
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date;
      const d = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
      const key = d.toISOString().slice(0, 10);
      cells.push({ date: d, key, inMonth: false, count: counts.get(key) ?? 0 });
    }
    return cells;
  }, [items, month]);

  const todayKey = new Date().toISOString().slice(0, 10);


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {currentOrganization?.name ?? ""} — Agenda
          </h1>
          <p className="text-sm text-muted-foreground">
            Beheer afspraken en verstuur direct een agenda-uitnodiging per e-mail.
          </p>
        </div>
        {currentOrganizationId && (
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nieuwe afspraak
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[10rem] text-center text-sm font-semibold">
              {month.toLocaleDateString("nl-NL", { month: "long", year: "numeric" })}
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="ml-2 h-7 text-xs"
              onClick={() => {
                const d = new Date();
                setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                setSelectedDay(null);
              }}
            >
              Vandaag
            </Button>
          </div>
          {selectedDay && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedDay(null)}>
              <X className="mr-1 h-3 w-3" /> Dagfilter wissen
            </Button>
          )}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-muted-foreground">
          {["ma", "di", "wo", "do", "vr", "za", "zo"].map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {monthGrid.map((c) => {
            const isSelected = selectedDay === c.key;
            const isToday = c.key === todayKey;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setSelectedDay(isSelected ? null : c.key)}
                className={`aspect-square rounded-md border p-1 text-left text-xs transition-colors ${
                  !c.inMonth ? "text-muted-foreground/40" : ""
                } ${isSelected ? "border-brand bg-brand/10" : "hover:bg-accent/50"} ${
                  isToday ? "font-bold" : ""
                }`}
              >
                <div>{c.date.getDate()}</div>
                {c.count > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-0.5">
                    {Array.from({ length: Math.min(c.count, 3) }).map((_, i) => (
                      <span key={i} className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
                    ))}
                    {c.count > 3 && <span className="text-[9px] text-muted-foreground">+{c.count - 3}</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { k: "upcoming", label: "Komende" },
            { k: "past", label: "Geweest" },
            { k: "all", label: "Alles" },
          ] as const
        ).map((f) => (
          <Button
            key={f.k}
            size="sm"
            variant={scope === f.k ? "default" : "outline"}
            onClick={() => { setScope(f.k); setSelectedDay(null); }}
            className="h-7 text-xs"
            disabled={!!selectedDay}
          >
            {f.label}
          </Button>
        ))}
        {selectedDay && (
          <span className="text-xs text-muted-foreground">
            Filter: {new Date(selectedDay).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        )}
      </div>


      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          <CalendarDays className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Geen afspraken.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, list]) => (
            <section key={day}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {day}
              </h2>
              <div className="space-y-2">
                {list.map((a) => (
                  <ApptCard
                    key={a.id}
                    a={a}
                    onEdit={() => {
                      setEditing(a);
                      setOpen(true);
                    }}
                    onChanged={load}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {currentOrganizationId && (
        <AppointmentDialog
          key={editing?.id ?? "new"}
          orgId={currentOrganizationId}
          clients={clients}
          initial={editing}
          open={open}
          onOpenChange={setOpen}
          onSaved={load}
        />
      )}
    </div>
  );
}

function ApptCard({
  a,
  onEdit,
  onChanged,
}: {
  a: Appointment;
  onEdit: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const invite = useServerFn(sendAppointmentInvite);
  const remove = useServerFn(deleteAppointment);
  const [sending, setSending] = useState(false);
  const start = new Date(a.starts_at);
  const end = new Date(a.ends_at);
  const time = `${start.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`;

  async function sendInvite(cancel = false) {
    if (!a.attendee_email) {
      toast.error("Geen e-mailadres van deelnemer bekend");
      return;
    }
    setSending(true);
    try {
      await invite({ data: { id: a.id, cancel } });
      toast.success(cancel ? "Annulering verstuurd" : "Uitnodiging verstuurd");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fout");
    } finally {
      setSending(false);
    }
  }

  async function del() {
    if (!confirm("Afspraak verwijderen?")) return;
    try {
      if (a.attendee_email && a.invite_sent_at) {
        await invite({ data: { id: a.id, cancel: true } });
      }
      await remove({ data: { id: a.id } });
      toast.success("Verwijderd");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fout");
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onEdit} className={`text-base font-semibold hover:underline ${a.status === "cancelled" ? "line-through text-muted-foreground" : ""}`}>
              {a.title}
            </button>
            {a.status === "cancelled" ? (
              <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-300">
                Geannuleerd
              </Badge>
            ) : (
              <>
                {a.confirmed_at && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                    ✓ Bevestigd door klant
                  </Badge>
                )}
                {a.reschedule_requested_at && !a.confirmed_at && (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300">
                    ↻ Verzoek tot verzetten
                  </Badge>
                )}
                {a.invite_sent_at && !a.confirmed_at && !a.reschedule_requested_at && (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-300">
                    Uitnodiging verzonden
                  </Badge>
                )}
              </>
            )}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {time}
            {a.location ? ` · ${a.location}` : ""}
          </div>
          {(a.attendee_name || a.attendee_email) && (
            <div className="mt-1 text-sm text-muted-foreground">
              Met: {a.attendee_name ?? ""}
              {a.attendee_email ? ` <${a.attendee_email}>` : ""}
            </div>
          )}
          {a.reschedule_note && (
            <div className="mt-2 rounded-md border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="text-xs font-semibold uppercase tracking-wide">Voorstel klant</div>
              <div className="whitespace-pre-wrap">{a.reschedule_note}</div>
            </div>
          )}
          {a.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm">{a.description}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => sendInvite(false)}
            disabled={sending || !a.attendee_email || a.status === "cancelled"}
          >
            {sending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : a.invite_sent_at ? (
              <Send className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Mail className="mr-1.5 h-3.5 w-3.5" />
            )}
            {a.invite_sent_at ? "Opnieuw versturen" : "Uitnodigen"}
          </Button>
          {a.status !== "cancelled" && (
            <Button
              size="sm"
              variant="outline"
              className="text-amber-700 hover:text-amber-800"
              onClick={async () => {
                if (!confirm("Afspraak annuleren en klant een annulering mailen?")) return;
                await sendInvite(true);
              }}
              disabled={sending || !a.attendee_email}
              title={a.attendee_email ? "Annuleer + stuur cancellation .ics" : "Geen e-mail bekend"}
            >
              <Ban className="mr-1.5 h-3.5 w-3.5" />
              Annuleren
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Bewerken
          </Button>
          <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={del}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function AppointmentDialog({
  orgId,
  clients,
  initial,
  open,
  onOpenChange,
  onSaved,
}: {
  orgId: string;
  clients: ClientRow[];
  initial: Appointment | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void | Promise<void>;
}) {
  const create = useServerFn(createAppointment);
  const update = useServerFn(updateAppointment);
  const invite = useServerFn(sendAppointmentInvite);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [clientId, setClientId] = useState(initial?.client_id ?? "");
  const [attendeeName, setAttendeeName] = useState(initial?.attendee_name ?? "");
  const [attendeeEmail, setAttendeeEmail] = useState(initial?.attendee_email ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [startsAt, setStartsAt] = useState(
    initial ? toLocalInput(initial.starts_at) : toLocalInput(new Date(Date.now() + 3600_000).toISOString()),
  );
  const [endsAt, setEndsAt] = useState(
    initial ? toLocalInput(initial.ends_at) : toLocalInput(new Date(Date.now() + 5400_000).toISOString()),
  );
  const [sendNow, setSendNow] = useState(!initial);
  const [saving, setSaving] = useState(false);

  function pickClient(id: string) {
    setClientId(id);
    const c = clients.find((cc) => cc.id === id);
    if (c) {
      if (!attendeeName) setAttendeeName(c.name);
      if (!attendeeEmail && c.email) setAttendeeEmail(c.email);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error("Titel is verplicht");
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      return toast.error("Eindtijd moet na de starttijd liggen");
    }
    setSaving(true);
    const payload = {
      organization_id: orgId,
      client_id: clientId || null,
      lead_id: null,
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      starts_at: fromLocalInput(startsAt),
      ends_at: fromLocalInput(endsAt),
      attendee_name: attendeeName.trim() || null,
      attendee_email: attendeeEmail.trim() || null,
    };
    try {
      let id: string;
      if (initial) {
        await update({ data: { ...payload, id: initial.id } });
        id = initial.id;
      } else {
        const created = await create({ data: payload });
        id = created.id;
      }
      if (sendNow && payload.attendee_email) {
        await invite({ data: { id } });
        toast.success("Afspraak opgeslagen en uitnodiging verstuurd");
      } else {
        toast.success("Afspraak opgeslagen");
      }
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fout");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Afspraak bewerken" : "Nieuwe afspraak"}</DialogTitle>
          <DialogDescription>
            Vul de details in. Bij een e-mailadres kun je direct een agenda-uitnodiging (.ics) sturen.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Titel</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Einde</Label>
              <Input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Locatie</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Bijv. Google Meet-link of adres"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Klant</Label>
            <select
              value={clientId}
              onChange={(e) => pickClient(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">— geen —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Naam deelnemer</Label>
              <Input value={attendeeName} onChange={(e) => setAttendeeName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail deelnemer</Label>
              <Input
                type="email"
                value={attendeeEmail}
                onChange={(e) => setAttendeeEmail(e.target.value)}
                placeholder="klant@voorbeeld.nl"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Omschrijving / notities</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sendNow}
              onChange={(e) => setSendNow(e.target.checked)}
              disabled={!attendeeEmail}
            />
            Direct uitnodiging per e-mail sturen naar deelnemer
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              <X className="mr-1.5 h-4 w-4" />
              Annuleren
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Opslaan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
