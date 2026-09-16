import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft, Clock, Download, Eye, Loader2, Lock, Mail, Paperclip, Send, Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  addTicketMessage, deleteTicket, deleteTicketAttachment, emailTicketHistory, getTicket, getTicketAttachmentUrl,
  listTicketAgents, updateTicket, uploadTicketAttachment,
  TICKET_PRIORITIES, TICKET_STATUSES, type TicketPriority, type TicketStatus,
} from "@/lib/tickets.functions";
import { PRIORITY_LABEL, STATUS_LABEL, priorityVariant } from "./tickets.index";

export const Route = createFileRoute("/_authenticated/tickets/$ticketId")({
  head: () => ({
    meta: [
      { title: "Ticketdetails" },
      { name: "description", content: "Bekijk en beantwoord een ticket: berichten, status, prioriteit en bijlagen." },
      { property: "og:title", content: "Ticketdetails" },
      { property: "og:description", content: "Bekijk en beantwoord een ticket." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TicketDetailPage,
});

type Any = Record<string, any>;

function fmt(d: string) {
  return new Date(d).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
}

function TicketDetailPage() {
  const { ticketId } = Route.useParams();
  const navigate = useNavigate();
  const { currentOrganizationId } = useWorkspace();
  const get = useServerFn(getTicket);
  const update = useServerFn(updateTicket);
  const send = useServerFn(addTicketMessage);
  const remove = useServerFn(deleteTicket);
  const agentsFn = useServerFn(listTicketAgents);
  const upload = useServerFn(uploadTicketAttachment);
  const signedUrl = useServerFn(getTicketAttachmentUrl);
  const delAtt = useServerFn(deleteTicketAttachment);
  const mailHistory = useServerFn(emailTicketHistory);
  const [historySending, setHistorySending] = useState(false);

  const [data, setData] = useState<Any | null>(null);
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [byEmail, setByEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [viewer, setViewer] = useState<{ url: string; mime: string; filename: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await get({ data: { id: ticketId } });
      setData(res as Any);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Laden mislukt");
    } finally {
      setLoading(false);
    }
  }, [ticketId, get]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!currentOrganizationId) return;
    void agentsFn({ data: { organization_id: currentOrganizationId } })
      .then((a) => setAgents(a as Array<{ id: string; name: string }>))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganizationId]);

  async function patch(p: Record<string, unknown>) {
    try {
      await update({ data: { id: ticketId, ...p } as never });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  }

  async function submitReply() {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      const res = await send({
        data: { ticket_id: ticketId, body: reply.trim(), is_internal: internal, send_email: byEmail && !internal },
      });
      setReply("");
      if (res.emailError) toast.warning(`Bericht opgeslagen, e-mail mislukt: ${res.emailError}`);
      else if (res.emailed) toast.success("Antwoord verstuurd per e-mail");
      else toast.success("Bericht toegevoegd");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Versturen mislukt");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    if (file.size > 9_000_000) { toast.error("Bestand is te groot (max 9 MB)"); return; }
    setBusy(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      await upload({
        data: { ticket_id: ticketId, filename: file.name, mime_type: file.type || null, base64: btoa(bin) },
      });
      toast.success("Bijlage toegevoegd");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uploaden mislukt");
    } finally {
      setBusy(false);
    }
  }

  async function openAttachment(a: Any) {
    try {
      const { url } = await signedUrl({ data: { id: a.id } });
      const mime = String(a.mime_type ?? "");
      const inline = mime.startsWith("image/") || mime === "application/pdf";
      if (inline) setViewer({ url, mime, filename: a.filename as string });
      else window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Openen mislukt");
    }
  }

  async function downloadAttachment(a: Any) {
    try {
      const { url } = await signedUrl({ data: { id: a.id } });
      const link = document.createElement("a");
      link.href = url;
      link.download = String(a.filename ?? "bijlage");
      link.rel = "noopener";
      link.target = "_blank";
      link.click();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Downloaden mislukt");
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laden...</div>;
  }
  if (!data) return <div className="py-10 text-sm text-muted-foreground">Ticket niet gevonden.</div>;

  const t = data.ticket as Any;

  type TimelineItem = { key: string; at: string; kind: string; title: string; detail?: string; who?: string };
  const fieldLabel: Record<string, string> = {
    status: "Status", priority: "Prioriteit", assigned_to: "Eigenaar",
    category_id: "Categorie", subject: "Onderwerp", client_id: "Klant",
  };
  const timeline: TimelineItem[] = [
    { key: `created-${t.id}`, at: t.created_at, kind: "aangemaakt", title: `Ticket aangemaakt via ${t.source}` },
    ...((data.events as Any[]) ?? []).map((ev) => ({
      key: `ev-${ev.id}`,
      at: ev.created_at as string,
      kind: ev.field === "status" ? "status" : "wijziging",
      who: (ev.actor_name as string) ?? "Systeem",
      title:
        ev.field === "status"
          ? `Status: ${STATUS_LABEL[ev.new_value as TicketStatus] ?? ev.new_value}`
          : `${fieldLabel[ev.field] ?? ev.field} gewijzigd`,
      detail:
        ev.field === "status"
          ? `van ${STATUS_LABEL[ev.old_value as TicketStatus] ?? ev.old_value ?? "—"}`
          : `${ev.old_value ?? "—"} → ${ev.new_value ?? "—"}`,
    })),
    ...((data.messages as Any[]) ?? []).map((m) => ({
      key: `msg-${m.id}`,
      at: m.created_at as string,
      kind: m.is_internal ? "interne notitie" : m.direction === "in" ? "bericht van melder" : "antwoord",
      who: (m.author_name as string) ?? undefined,
      title: String(m.body ?? "").slice(0, 140),
    })),
    ...(((data as Any).mails as Any[]) ?? []).map((m) => ({
      key: `mail-${m.id}`,
      at: (m.sent_at ?? m.received_at ?? m.created_at) as string,
      kind: m.folder === "inbox" ? "e-mail ontvangen" : "e-mail verzonden",
      title: String(m.subject ?? ""),
      detail: (m.to_emails ?? []).join(", "),
    })),
  ]
    .filter((i) => Boolean(i.at))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());


  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/tickets" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Terug naar tickets
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-bold">
            <span className="font-mono text-base text-muted-foreground">{t.ticket_number}</span>
            {t.subject}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={priorityVariant(t.priority)}>{PRIORITY_LABEL[t.priority as TicketPriority]}</Badge>
            <Badge variant="outline">{STATUS_LABEL[t.status as TicketStatus]}</Badge>
            <span>Aangemaakt {fmt(t.created_at)} · via {t.source}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {t.portal_token ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const url = `${window.location.origin}/portaal/${t.organization_id}?t=${t.portal_token}`;
                void navigator.clipboard.writeText(url);
                toast.success("Klantlink gekopieerd");
              }}
            >
              <Mail className="mr-1 h-4 w-4" />
              Klantlink kopiëren
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={historySending}
            onClick={async () => {
              setHistorySending(true);
              try {
                const r = await mailHistory({ data: { ticket_id: ticketId } });
                toast.success(`Historiek gemaild naar ${r.to}`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Mailen mislukt");
              } finally {
                setHistorySending(false);
              }
            }}
          >
            {historySending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Mail className="mr-1 h-4 w-4" />}
            Historiek mailen
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!confirm("Dit ticket definitief verwijderen?")) return;
              await remove({ data: { id: ticketId } });
              toast.success("Ticket verwijderd");
              void navigate({ to: "/tickets" });
            }}
          >
            <Trash2 className="mr-1 h-4 w-4 text-destructive" /> Verwijderen
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Gesprek</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(data.messages as Any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen berichten.</p>
              ) : (
                (data.messages as Any[]).map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-md border p-3 ${m.is_internal ? "border-dashed bg-muted/50" : m.direction === "in" ? "bg-muted/30" : "bg-background"}`}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{m.author_name ?? (m.direction === "in" ? "Melder" : "Medewerker")}</span>
                      <span>{fmt(m.created_at)}</span>
                      <Badge variant="outline" className="text-[10px]">{m.channel}</Badge>
                      {m.is_internal && <Badge variant="secondary" className="text-[10px]"><Lock className="mr-1 h-3 w-3" />interne notitie</Badge>}
                    </div>
                    <div className="whitespace-pre-wrap text-sm">{m.body}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Reageren</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={5} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Typ je antwoord of interne notitie" />
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={internal} onCheckedChange={(v) => { setInternal(v); if (v) setByEmail(false); }} />
                  Interne notitie
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={byEmail} disabled={internal || !t.requester_email} onCheckedChange={setByEmail} />
                  <Mail className="h-4 w-4" /> Ook per e-mail sturen
                </label>
                <Button className="ml-auto" onClick={submitReply} disabled={busy || !reply.trim()}>
                  {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Versturen
                </Button>
              </div>
              {!t.requester_email && (
                <p className="text-xs text-muted-foreground">Geen e-mailadres bekend bij dit ticket; e-mail versturen is uitgeschakeld.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Bijlagen</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Paperclip className="mr-1 h-4 w-4" /> Bestand toevoegen
              </Button>
              {(data.attachments as Any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen bijlagen.</p>
              ) : (
                <ul className="divide-y">
                  {(data.attachments as Any[]).map((a) => (
                    <li key={a.id} className="flex items-center gap-2 py-2 text-sm">
                      <span className="truncate">{a.filename}</span>
                      <span className="text-xs text-muted-foreground">
                        {a.mime_type ?? "bestand"} · {Math.round((a.size_bytes ?? 0) / 1024)} kB
                      </span>
                      <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void openAttachment(a)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void downloadAttachment(a)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => { await delAtt({ data: { id: a.id } }); await refresh(); }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">E-mailberichten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {((data as Any).mails as Any[] | undefined)?.length ? (
                ((data as Any).mails as Any[]).map((m) => (
                  <details key={m.id} className="rounded-md border p-3">
                    <summary className="cursor-pointer text-sm">
                      <span className="font-medium">{m.subject}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {m.folder === "inbox" ? "ontvangen" : "verzonden"} ·{" "}
                        {fmt(m.sent_at ?? m.received_at ?? m.created_at)} ·{" "}
                        {(m.to_emails ?? []).join(", ")}
                      </span>
                    </summary>
                    <div
                      className="prose prose-sm mt-3 max-w-none text-sm [&_a]:text-primary"
                      dangerouslySetInnerHTML={{ __html: String(m.body_html ?? "") }}
                    />
                    {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Bijlagen: {m.attachments.map((a: Any) => a.filename).join(", ")}
                      </p>
                    )}
                  </details>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nog geen e-mails voor dit ticket.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" /> Tijdlijn
              </CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen gebeurtenissen.</p>
              ) : (
                <ol className="relative space-y-4 border-l pl-5">
                  {timeline.map((item) => (
                    <li key={item.key} className="relative">
                      <span className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">{item.kind}</Badge>
                        <span>{fmt(item.at)}</span>
                        {item.who ? <span>· {item.who}</span> : null}
                      </div>
                      <div className="text-sm">{item.title}</div>
                      {item.detail ? (
                        <div className="text-xs text-muted-foreground">{item.detail}</div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={t.status} onValueChange={(v) => void patch({ status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Prioriteit</Label>
                <Select value={t.priority} onValueChange={(v) => void patch({ priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Categorie</Label>
                <Select value={t.category_id ?? "none"} onValueChange={(v) => void patch({ category_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Geen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Geen categorie</SelectItem>
                    {(data.categories as Any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Eigenaar</Label>
                <Select value={t.assigned_to ?? "none"} onValueChange={(v) => void patch({ assigned_to: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Niemand" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Niet toegewezen</SelectItem>
                    {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Melder</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {data.client ? (
                <div>
                  <div className="font-medium">{(data.client as Any).name}</div>
                  <div className="text-xs text-muted-foreground">{(data.client as Any).email ?? "—"}</div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Geen klant gekoppeld</div>
              )}
              <div className="grid gap-2">
                <Label>Naam</Label>
                <Input defaultValue={t.requester_name ?? ""} onBlur={(e) => void patch({ requester_name: e.target.value || null })} />
              </div>
              <div className="grid gap-2">
                <Label>E-mail</Label>
                <Input defaultValue={t.requester_email ?? ""} onBlur={(e) => void patch({ requester_email: e.target.value || null })} />
              </div>
              <div className="grid gap-2">
                <Label>Telefoon</Label>
                <Input defaultValue={t.requester_phone ?? ""} onBlur={(e) => void patch({ requester_phone: e.target.value || null })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Geschiedenis</CardTitle></CardHeader>
            <CardContent>
              {(data.events as Any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen wijzigingen.</p>
              ) : (
                <ul className="space-y-2 text-xs text-muted-foreground">
                  {(data.events as Any[]).map((ev) => (
                    <li key={ev.id}>
                      <span className="text-foreground">{ev.actor_name ?? "Systeem"}</span> wijzigde {ev.field}
                      {ev.old_value ? ` van ${ev.old_value}` : ""} {ev.new_value ? `naar ${ev.new_value}` : ""} · {fmt(ev.created_at)}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!viewer} onOpenChange={(o) => { if (!o) setViewer(null); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="truncate text-base">{viewer?.filename}</DialogTitle>
          </DialogHeader>
          {viewer?.mime.startsWith("image/") ? (
            <img src={viewer.url} alt={viewer.filename} className="max-h-[70vh] w-full rounded-md object-contain" />
          ) : viewer ? (
            <iframe src={viewer.url} title={viewer.filename} className="h-[70vh] w-full rounded-md border" />
          ) : null}
          {viewer ? (
            <a href={viewer.url} download={viewer.filename} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <Download className="mr-1 h-4 w-4" /> Downloaden
              </Button>
            </a>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
