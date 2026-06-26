import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Inbox as InboxIcon,
  Send as SendIcon,
  PenSquare,
  Mail as MailIcon,
  Paperclip,
  Reply,
  RefreshCw,
  Trash2,
  Download,
  Settings,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/hooks/use-workspace";
import { ComposeMailDialog } from "@/components/mail/compose-mail-dialog";
import {
  markMailRead,
  getAttachmentUrl,
  deleteAttachment,
  deleteMail,
  sendMail,
  bulkUpdateMail,
} from "@/lib/mail.functions";
import { renderTokens } from "@/lib/outreach-templates";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CheckCheck, Eye, EyeOff, FolderInput, MoreHorizontal } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mail")({
  head: () => ({ meta: [{ title: "Mail" }] }),
  component: MailPage,
});

type Folder = "inbox" | "sent" | "draft";
type Attach = { path: string; filename: string; size?: number; mime?: string };

type MailRow = {
  id: string;
  organization_id: string;
  folder: Folder;
  from_email: string | null;
  from_name: string | null;
  to_emails: string[];
  cc_emails: string[];
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  in_reply_to: string | null;
  provider_message_id: string | null;
  thread_id: string | null;
  client_id: string | null;
  attachments: Attach[];
  status: string;
  error: string | null;
  bounce_type: string | null;
  bounce_reason: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  received_at: string | null;
  read_at: string | null;
  created_at: string;
};

type Template = { id: string; name: string; subject: string | null; body: string };

function formatBytes(n?: number) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function StatusBadge({ m }: { m: MailRow }) {
  const s = m.status;
  const map: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    queued: { label: "In wachtrij", cls: "bg-white/10 text-white/70", Icon: Clock },
    sent: { label: "Verzonden", cls: "bg-sky-500/20 text-sky-200", Icon: SendIcon },
    delivered: { label: "Afgeleverd", cls: "bg-emerald-500/20 text-emerald-200", Icon: CheckCircle2 },
    bounced: { label: "Bounced", cls: "bg-red-500/20 text-red-200", Icon: XCircle },
    complained: { label: "Klacht", cls: "bg-orange-500/20 text-orange-200", Icon: AlertCircle },
    failed: { label: "Geweigerd", cls: "bg-red-500/20 text-red-200", Icon: XCircle },
    delayed: { label: "Vertraagd", cls: "bg-amber-500/20 text-amber-200", Icon: Clock },
    received: { label: "Ontvangen", cls: "bg-white/10 text-white/70", Icon: InboxIcon },
  };
  const c = map[s] ?? { label: s, cls: "bg-white/10 text-white/70", Icon: Clock };
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${c.cls}`}>
      <c.Icon className="h-2.5 w-2.5" /> {c.label}
    </span>
  );
}

function MailPage() {
  const { currentOrganizationId, currentOrganization } = useWorkspace();
  const [folder, setFolder] = useState<Folder>("inbox");
  const [items, setItems] = useState<MailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyDefaults, setReplyDefaults] = useState<{
    to: string;
    subject: string;
    inReplyTo: string | null;
    threadId: string | null;
  } | null>(null);

  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const markRead = useServerFn(markMailRead);
  const getUrl = useServerFn(getAttachmentUrl);
  const delAttach = useServerFn(deleteAttachment);
  const delMail = useServerFn(deleteMail);
  const bulkUpdate = useServerFn(bulkUpdateMail);

  const load = async () => {
    if (!currentOrganizationId) return;
    setLoading(true);
    const order = folder === "sent" ? "sent_at" : folder === "inbox" ? "received_at" : "created_at";
    const { data, error } = await supabase
      .from("mail_messages")
      .select("*")
      .eq("organization_id", currentOrganizationId)
      .eq("folder", folder)
      .order(order, { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) toast.error(error.message);
    setItems(((data ?? []) as unknown) as MailRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganizationId, folder]);

  useEffect(() => {
    if (!currentOrganizationId) return;
    const ch = supabase
      .channel(`mail-${currentOrganizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mail_messages",
          filter: `organization_id=eq.${currentOrganizationId}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganizationId, folder]);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);

  // Fetch thread messages for selected (across folders, same org)
  const [thread, setThread] = useState<MailRow[]>([]);
  useEffect(() => {
    (async () => {
      if (!selected || !currentOrganizationId) {
        setThread([]);
        return;
      }
      const tid = selected.thread_id ?? selected.id;
      const { data } = await supabase
        .from("mail_messages")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .or(`thread_id.eq.${tid},id.eq.${tid}`)
        .order("created_at", { ascending: true });
      setThread(((data ?? []) as unknown) as MailRow[]);
    })();
  }, [selected, currentOrganizationId, items]);

  const onSelect = async (m: MailRow) => {
    setSelectedId(m.id);
    if (folder === "inbox" && !m.read_at) {
      try {
        await markRead({ data: { id: m.id } });
        setItems((cur) => cur.map((x) => (x.id === m.id ? { ...x, read_at: new Date().toISOString() } : x)));
      } catch {
        /* ignore */
      }
    }
  };

  const onComposeReply = () => {
    if (!selected) return;
    setReplyDefaults({
      to: selected.from_email ?? "",
      subject: selected.subject?.startsWith("Re:") ? selected.subject : `Re: ${selected.subject ?? ""}`,
      inReplyTo: selected.provider_message_id,
      threadId: selected.thread_id ?? selected.id,
    });
    setComposeOpen(true);
  };

  const onCompose = () => {
    setReplyDefaults(null);
    setComposeOpen(true);
  };

  const openAttachment = async (path: string) => {
    try {
      const r = await getUrl({ data: { path } });
      window.open(r.url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kan bijlage niet openen");
    }
  };

  const removeAttachment = async (path: string) => {
    if (!selected) return;
    if (!confirm("Bijlage verwijderen?")) return;
    try {
      await delAttach({ data: { message_id: selected.id, path } });
      toast.success("Bijlage verwijderd");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
  };

  const removeMessage = async () => {
    if (!selected) return;
    if (!confirm("Bericht verwijderen?")) return;
    try {
      await delMail({ data: { id: selected.id } });
      toast.success("Bericht verwijderd");
      setSelectedId(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
  };

  const unread = items.filter((i) => folder === "inbox" && !i.read_at).length;

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white -m-4 p-6 md:-m-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <MailIcon className="h-6 w-6" style={{ color: "#ff2bd6" }} />
              Mail
            </h1>
            <p className="text-sm text-white/60">
              {currentOrganization?.name ?? ""} — inbox, threads, status & templates
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="border-white/20 text-white/80 hover:bg-white/10">
              <Link to="/mail/settings"><Settings className="mr-2 h-4 w-4" /> Instellingen</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={load} className="border-white/20 text-white/80 hover:bg-white/10">
              <RefreshCw className="mr-2 h-4 w-4" /> Verversen
            </Button>
            <Button onClick={onCompose} className="bg-[#ff2bd6] hover:bg-[#ff2bd6]/90 text-white">
              <PenSquare className="mr-2 h-4 w-4" /> Nieuwe mail
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[200px_360px_1fr]">
          {/* Folders */}
          <div className="space-y-1">
            {[
              { k: "inbox", label: "Inbox", icon: InboxIcon, count: unread },
              { k: "sent", label: "Verzonden", icon: SendIcon, count: 0 },
              { k: "draft", label: "Concepten", icon: PenSquare, count: 0 },
            ].map((f) => {
              const Icon = f.icon;
              const active = folder === f.k;
              return (
                <button
                  key={f.k}
                  onClick={() => {
                    setFolder(f.k as Folder);
                    setSelectedId(null);
                    setBulkIds(new Set());
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition ${
                    active ? "bg-[#ff2bd6]/15 text-white" : "text-white/70 hover:bg-white/5"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {f.label}
                  </span>
                  {f.count > 0 && (
                    <Badge className="bg-[#ff2bd6]/30 text-white text-[10px] px-1.5">{f.count}</Badge>
                  )}
                </button>
              );
            })}
          </div>

          {/* List */}
          <div className="space-y-1 max-h-[78vh] overflow-y-auto pr-1">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-white/60">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-xs text-white/40">
                Geen berichten
              </div>
            ) : (
              items.map((m) => {
                const isSelected = m.id === selectedId;
                const isUnread = folder === "inbox" && !m.read_at;
                const who =
                  folder === "sent"
                    ? `Aan: ${m.to_emails.join(", ")}`
                    : m.from_name ?? m.from_email ?? "—";
                const when = m.received_at ?? m.sent_at ?? m.created_at;
                return (
                  <button
                    key={m.id}
                    onClick={() => onSelect(m)}
                    className={`w-full rounded-md border p-2.5 text-left transition ${
                      isSelected
                        ? "border-[#ff2bd6]/60 bg-[#ff2bd6]/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className={`truncate text-xs font-medium ${isUnread ? "text-white" : "text-white/70"}`}>
                        {who}
                      </div>
                      {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff2bd6]" />}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-white/80">
                      {m.subject ?? "(geen onderwerp)"}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-white/40">
                        {(m.body_text ?? "").slice(0, 60)}
                      </span>
                      <span className="text-[10px] text-white/40 shrink-0">
                        {when ? new Date(when).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" }) : ""}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusBadge m={m} />
                      {m.attachments?.length > 0 && <Paperclip className="h-3 w-3 text-white/40" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Detail */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 min-h-[400px]">
            {!selected ? (
              <div className="flex h-full items-center justify-center text-sm text-white/40">
                Selecteer een bericht
              </div>
            ) : (
              <ThreadView
                selected={selected}
                thread={thread}
                organizationId={currentOrganizationId ?? ""}
                onOpenAttachment={openAttachment}
                onDeleteAttachment={removeAttachment}
                onDeleteMessage={removeMessage}
                onOpenCompose={onComposeReply}
                onSent={load}
              />
            )}
          </div>
        </div>
      </div>

      {currentOrganizationId && (
        <ComposeMailDialog
          open={composeOpen}
          onOpenChange={setComposeOpen}
          organizationId={currentOrganizationId}
          defaultTo={replyDefaults?.to}
          defaultSubject={replyDefaults?.subject}
          inReplyTo={replyDefaults?.inReplyTo ?? null}
          threadId={replyDefaults?.threadId ?? null}
          onSent={load}
        />
      )}
    </div>
  );
}

function ThreadView({
  selected,
  thread,
  organizationId,
  onOpenAttachment,
  onDeleteAttachment,
  onDeleteMessage,
  onOpenCompose,
  onSent,
}: {
  selected: MailRow;
  thread: MailRow[];
  organizationId: string;
  onOpenAttachment: (p: string) => void;
  onDeleteAttachment: (p: string) => void;
  onDeleteMessage: () => void;
  onOpenCompose: () => void;
  onSent: () => void;
}) {
  const ordered = thread.length > 0 ? thread : [selected];
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold text-white truncate">
            {selected.subject ?? "(geen onderwerp)"}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <MessageSquare className="h-3 w-3 text-white/40" />
            <span className="text-[11px] text-white/50">
              {ordered.length} bericht{ordered.length !== 1 ? "en" : ""} in deze conversatie
            </span>
            <StatusBadge m={selected} />
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={onDeleteMessage} className="border-white/20 text-white/80 hover:bg-white/10">
            <Trash2 className="mr-1 h-3 w-3" /> Verwijder
          </Button>
          <Button size="sm" onClick={onOpenCompose} className="bg-[#ff2bd6] hover:bg-[#ff2bd6]/90 text-white">
            <Reply className="mr-1 h-3 w-3" /> Uitgebreid
          </Button>
        </div>
      </div>

      {(selected.status === "bounced" ||
        selected.status === "failed" ||
        selected.status === "complained") &&
        (selected.bounce_reason || selected.error) && (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            <div className="font-semibold flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {selected.status === "bounced" ? "Bounced" : selected.status === "failed" ? "Geweigerd" : "Klacht"}
              {selected.bounce_type && <span className="ml-1 opacity-70">({selected.bounce_type})</span>}
            </div>
            <div className="mt-1 opacity-90">{selected.bounce_reason ?? selected.error}</div>
          </div>
        )}

      <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
        {ordered.map((m) => (
          <MessageCard
            key={m.id}
            m={m}
            onOpenAttachment={onOpenAttachment}
            onDeleteAttachment={onDeleteAttachment}
          />
        ))}
      </div>

      <InlineReply
        selected={selected}
        organizationId={organizationId}
        onSent={onSent}
      />
    </div>
  );
}

function MessageCard({
  m,
  onOpenAttachment,
  onDeleteAttachment,
}: {
  m: MailRow;
  onOpenAttachment: (p: string) => void;
  onDeleteAttachment: (p: string) => void;
}) {
  return (
    <div className="rounded border border-white/10 bg-black/20 p-3 text-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-white/80">
            <span className="font-medium">{m.from_name ?? m.from_email ?? "—"}</span>
            {m.from_email && m.from_name && (
              <span className="ml-1 text-white/40">&lt;{m.from_email}&gt;</span>
            )}
          </div>
          <div className="text-[11px] text-white/50">
            Aan: {m.to_emails.join(", ")}
            {m.cc_emails?.length > 0 && <span className="ml-2">CC: {m.cc_emails.join(", ")}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <StatusBadge m={m} />
          <div className="mt-1 text-[10px] text-white/40">
            {(m.received_at ?? m.sent_at ?? m.created_at)
              ? new Date(m.received_at ?? m.sent_at ?? m.created_at).toLocaleString("nl-NL")
              : ""}
          </div>
        </div>
      </div>
      {m.body_html ? (
        <div className="text-white/90" dangerouslySetInnerHTML={{ __html: m.body_html }} />
      ) : (
        <div className="whitespace-pre-wrap text-white/90">{m.body_text ?? ""}</div>
      )}
      {m.attachments?.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-white/50">Bijlagen</div>
          <div className="flex flex-col gap-1.5">
            {m.attachments.map((a) => (
              <div
                key={a.path}
                className="flex items-center justify-between gap-2 rounded border border-white/10 bg-white/5 px-2 py-1.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-white/60 shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate text-xs text-white/90">{a.filename}</div>
                    <div className="text-[10px] text-white/40">
                      {a.mime ?? "onbekend"} · {formatBytes(a.size)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onOpenAttachment(a.path)}
                    className="inline-flex items-center gap-1 rounded border border-white/20 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10"
                  >
                    <Download className="h-3 w-3" /> Download
                  </button>
                  <button
                    onClick={() => onDeleteAttachment(a.path)}
                    className="inline-flex items-center gap-1 rounded border border-red-500/30 px-2 py-1 text-[11px] text-red-200 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InlineReply({
  selected,
  organizationId,
  onSent,
}: {
  selected: MailRow;
  organizationId: string;
  onSent: () => void;
}) {
  const send = useServerFn(sendMail);
  const [body, setBody] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplId, setTplId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [defaultTplId, setDefaultTplId] = useState<string | null>(null);

  useEffect(() => {
    setBody("");
    setTplId("");
  }, [selected.id]);

  useEffect(() => {
    if (!organizationId) return;
    (async () => {
      const [t, s] = await Promise.all([
        supabase
          .from("outreach_message_templates")
          .select("id, name, subject, body")
          .eq("organization_id", organizationId)
          .eq("channel", "email")
          .order("name"),
        supabase
          .from("mail_settings")
          .select("default_email_template_id")
          .eq("organization_id", organizationId)
          .maybeSingle(),
      ]);
      setTemplates((t.data ?? []) as Template[]);
      setDefaultTplId((s.data as { default_email_template_id: string | null } | null)?.default_email_template_id ?? null);
    })();
  }, [organizationId]);

  function applyTemplate(id: string) {
    setTplId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    const vars = { contact_name: selected.from_name ?? "", company: "", sender_name: "", province: "" };
    setBody(renderTokens(tpl.body, vars));
  }

  async function quickSend() {
    if (!body.trim()) {
      toast.error("Leeg bericht");
      return;
    }
    const to = selected.from_email ?? selected.to_emails[0];
    if (!to) {
      toast.error("Geen ontvanger gevonden");
      return;
    }
    setBusy(true);
    try {
      await send({
        data: {
          organization_id: organizationId,
          to: [to],
          cc: [],
          bcc: [],
          subject: selected.subject?.startsWith("Re:") ? selected.subject : `Re: ${selected.subject ?? ""}`,
          body,
          client_id: selected.client_id ?? null,
          lead_id: null,
          in_reply_to: selected.provider_message_id,
          thread_id: selected.thread_id ?? selected.id,
          attachments: [],
        },
      });
      toast.success("Reply verstuurd");
      setBody("");
      setTplId("");
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verzendfout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wider text-white/50 flex items-center gap-1">
          <Reply className="h-3 w-3" /> Snel antwoorden
        </div>
        <div className="w-60">
          <Select value={tplId || defaultTplId || ""} onValueChange={applyTemplate}>
            <SelectTrigger className="h-8 bg-white/5 border-white/10 text-white text-xs">
              <SelectValue placeholder="Kies template…" />
            </SelectTrigger>
            <SelectContent>
              {templates.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-white/50">Geen templates</div>
              )}
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                  {defaultTplId === t.id ? " ★" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Textarea
        rows={5}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Typ je antwoord…"
        className="bg-white/5 border-white/10 text-white font-mono text-sm"
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={quickSend}
          disabled={busy}
          className="bg-[#ff2bd6] hover:bg-[#ff2bd6]/90 text-white"
        >
          {busy ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <SendIcon className="mr-2 h-3 w-3" />}
          Verstuur antwoord
        </Button>
      </div>
    </div>
  );
}
