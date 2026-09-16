import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Download, LifeBuoy, Loader2, Paperclip, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/portaal/$orgSlug")({
  head: () => ({
    meta: [
      { title: "Mijn tickets — volg je meldingen" },
      {
        name: "description",
        content: "Bekijk de status van je meldingen, lees de reacties en stuur zelf een bericht terug.",
      },
      { property: "og:title", content: "Mijn tickets" },
      { property: "og:description", content: "Volg je meldingen, status en berichten." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { t?: string } =>
    typeof s['t'] === "string" ? { t: s['t'] as string } : {},
  component: PortalPage,
});

const API = "/api/public/hooks/ticket-portal";

type PortalMessage = {
  id: string;
  direction: string;
  body: string;
  author_name: string | null;
  channel: string | null;
  created_at: string;
};
type PortalFile = {
  id: string;
  filename: string;
  mime: string | null;
  size: number | null;
  url: string | null;
};
type PortalTicket = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  status_label: string;
  priority: string;
  created_at: string;
  last_message_at: string | null;
  requester_name: string | null;
  requester_email: string | null;
  portal_token: string;
  messages: PortalMessage[];
  attachments: PortalFile[];
};
type ListItem = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  status_label: string;
  priority: string;
  created_at: string;
  last_message_at: string | null;
  portal_token: string;
  has_update?: boolean;
};

const STATUS_TONE: Record<string, string> = {
  nieuw: "bg-blue-100 text-blue-800",
  in_behandeling: "bg-amber-100 text-amber-900",
  wachten_op_klant: "bg-purple-100 text-purple-900",
  opgelost: "bg-emerald-100 text-emerald-900",
  gesloten: "bg-muted text-muted-foreground",
};

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" }) : "—";

async function api(body: Record<string, unknown>) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((data['error'] as string) ?? "Er ging iets mis");
  return data;
}

function PortalPage() {
  const { orgSlug } = Route.useParams();
  const { t: linkToken } = Route.useSearch();

  const storageKey = `ticket-portal:${orgSlug}`;
  const [session, setSession] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [list, setList] = useState<ListItem[]>([]);
  const [ticket, setTicket] = useState<PortalTicket | null>(null);
  const [reply, setReply] = useState("");
  const [newName, setNewName] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    setSession(localStorage.getItem(storageKey));
  }, [storageKey]);

  const openTicket = useCallback(async (token: string) => {
    setError(null);
    setBusy(true);
    try {
      const d = await api({ action: "ticket", token });
      setTicket(d['ticket'] as PortalTicket);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setBusy(false);
    }
  }, []);

  const loadList = useCallback(async (s: string) => {
    try {
      const d = await api({ action: "list", session: s });
      setList((d['tickets'] as ListItem[]) ?? []);
      setEmail((d['email'] as string) ?? "");
    } catch {
      localStorage.removeItem(storageKey);
      setSession(null);
    }
  }, [storageKey]);

  useEffect(() => {
    if (linkToken) void openTicket(linkToken);
  }, [linkToken, openTicket]);

  useEffect(() => {
    if (session) void loadList(session);
  }, [session, loadList]);

  async function requestCode() {
    setError(null);
    setBusy(true);
    try {
      await api({ action: "request_code", org: orgSlug, email });
      setCodeSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setError(null);
    setBusy(true);
    try {
      const d = await api({ action: "verify_code", org: orgSlug, email, code });
      const s = d['session'] as string;
      localStorage.setItem(storageKey, s);
      setSession(s);
      setCode("");
      setCodeSent(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setBusy(false);
    }
  }

  async function createTicket() {
    if (!session || !newSubject.trim() || !newBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const d = await api({
        action: "new_ticket",
        session,
        subject: newSubject.trim(),
        body: newBody.trim(),
        name: newName.trim() || null,
      });
      setCreated((d['ticket_number'] as string) ?? null);
      setNewSubject("");
      setNewBody("");
      await loadList(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!ticket || !reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api({
        action: "reply",
        ticket_id: ticket.id,
        body: reply.trim(),
        ...(linkToken ? { token: linkToken } : { session }),
      });
      setReply("");
      await openTicket(ticket.portal_token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="flex items-center gap-3">
          <LifeBuoy className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Mijn meldingen</h1>
            <p className="text-sm text-muted-foreground">
              Volg de status van je tickets en reageer op het gesprek.
            </p>
          </div>
        </header>

        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {ticket ? (
          <Card>
            <CardHeader className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{ticket.ticket_number}</Badge>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[ticket.status] ?? ""}`}>
                  {ticket.status_label}
                </span>
                <Badge variant="secondary">Prioriteit: {ticket.priority}</Badge>
              </div>
              <CardTitle className="text-xl">{ticket.subject}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Aangemaakt {fmt(ticket.created_at)} · laatste bericht {fmt(ticket.last_message_at)}
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                {ticket.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg border p-3 text-sm ${
                      m.direction === "out" ? "bg-primary/5" : "bg-background"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{m.author_name || (m.direction === "out" ? "Support" : "Jij")}</span>
                      <span>{fmt(m.created_at)}</span>
                    </div>
                    <div className="whitespace-pre-wrap">{m.body}</div>
                  </div>
                ))}
                {ticket.messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nog geen berichten.</p>
                ) : null}
              </div>

              {ticket.attachments.length ? (
                <div className="space-y-2">
                  <h2 className="flex items-center gap-2 text-sm font-medium">
                    <Paperclip className="h-4 w-4" /> Bijlagen
                  </h2>
                  <ul className="space-y-1 text-sm">
                    {ticket.attachments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between rounded border px-3 py-2">
                        <span>
                          {a.filename}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {a.mime ?? "bestand"}
                            {a.size ? ` · ${Math.round(a.size / 1024)} kB` : ""}
                          </span>
                        </span>
                        {a.url ? (
                          <a href={a.url} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="ghost">
                              <Download className="mr-1 h-4 w-4" /> Download
                            </Button>
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {ticket.status !== "gesloten" ? (
                <div className="space-y-2">
                  <Label htmlFor="reply">Reageren</Label>
                  <Textarea
                    id="reply"
                    rows={4}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Typ hier je bericht…"
                  />
                  <Button onClick={sendReply} disabled={busy || !reply.trim()}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Versturen
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Dit ticket is gesloten.</p>
              )}

              {(session || list.length > 0) ? (
                <Button variant="ghost" onClick={() => setTicket(null)}>
                  ← Terug naar mijn tickets
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : session ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Meldingen van {email}
                  {list.some((t) => t.has_update) ? (
                    <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      {list.filter((t) => t.has_update).length} nieuw
                    </span>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Zoek op nummer of onderwerp"
                  />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="alle">Alle statussen</option>
                    {Object.keys(STATUS_TONE).map((s) => (
                      <option key={s} value={s}>
                        {s.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                  <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                  <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>

                {filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {list.length === 0
                      ? "Er staan nog geen meldingen op dit adres."
                      : "Geen meldingen gevonden met deze zoekopdracht."}
                  </p>
                ) : (
                  filtered.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => openTicket(t.portal_token)}
                      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-left hover:bg-muted/50"
                    >
                      <span>
                        <span className="mr-2 font-mono text-xs text-muted-foreground">{t.ticket_number}</span>
                        <span className="font-medium">{t.subject}</span>
                        {t.has_update ? (
                          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            nieuw bericht
                          </span>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[t.status] ?? ""}`}>
                          {t.status_label}
                        </span>
                        <span className="text-xs text-muted-foreground">{fmt(t.last_message_at)}</span>
                      </span>
                    </button>
                  ))
                )}
                <Button
                  variant="ghost"
                  onClick={() => {
                    localStorage.removeItem(storageKey);
                    setSession(null);
                    setList([]);
                  }}
                >
                  Uitloggen
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Nieuwe melding maken</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="nt-name">Je naam</Label>
                  <Input
                    id="nt-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Voor- en achternaam"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nt-subject">Onderwerp</Label>
                  <Input
                    id="nt-subject"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    placeholder="Waar gaat het over?"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nt-body">Omschrijving</Label>
                  <Textarea
                    id="nt-body"
                    rows={5}
                    value={newBody}
                    onChange={(e) => setNewBody(e.target.value)}
                    placeholder="Vertel wat er aan de hand is…"
                  />
                </div>
                <Button onClick={createTicket} disabled={busy || !newSubject.trim() || !newBody.trim()}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Melding versturen
                </Button>
                {created ? (
                  <p className="text-sm text-emerald-700">
                    Je melding is aangemaakt met nummer {created}. Je krijgt een bevestiging per e-mail.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Inloggen met je e-mailadres</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mailadres</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jij@bedrijf.nl"
                />
              </div>
              {codeSent ? (
                <div className="space-y-2">
                  <Label htmlFor="code">Code uit de e-mail</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                  />
                  <div className="flex gap-2">
                    <Button onClick={verifyCode} disabled={busy || code.length < 4}>
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Inloggen
                    </Button>
                    <Button variant="ghost" onClick={requestCode} disabled={busy}>
                      Nieuwe code
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={requestCode} disabled={busy || !email.includes("@")}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Stuur mij een code
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Als er meldingen op dit adres staan, ontvang je binnen een minuut een code van 6 cijfers.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
