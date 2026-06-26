import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/use-workspace";
import { ComposeMailDialog } from "@/components/mail/compose-mail-dialog";
import { markMailRead, getAttachmentUrl } from "@/lib/mail.functions";

export const Route = createFileRoute("/_authenticated/mail")({
  head: () => ({ meta: [{ title: "Mail" }] }),
  component: MailPage,
});

type Folder = "inbox" | "sent" | "draft";

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
  attachments: Array<{ path: string; filename: string }>;
  status: string;
  sent_at: string | null;
  received_at: string | null;
  read_at: string | null;
  created_at: string;
};

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

  const markRead = useServerFn(markMailRead);
  const getUrl = useServerFn(getAttachmentUrl);

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

  const onReply = () => {
    if (!selected) return;
    setReplyDefaults({
      to: selected.from_email ?? "",
      subject: selected.subject?.startsWith("Re:") ? selected.subject : `Re: ${selected.subject ?? ""}`,
      inReplyTo: selected.provider_message_id,
      threadId: null,
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
              {currentOrganization?.name ?? ""} — inbox, sent en compose met templates
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              className="border-white/20 text-white/80 hover:bg-white/10"
            >
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
          <div className="space-y-1 max-h-[75vh] overflow-y-auto pr-1">
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
                    {m.attachments && m.attachments.length > 0 && (
                      <Paperclip className="mt-1 h-3 w-3 text-white/40" />
                    )}
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
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-white">
                      {selected.subject ?? "(geen onderwerp)"}
                    </div>
                    <div className="mt-1 text-xs text-white/60">
                      <span className="text-white/80">
                        {selected.from_name ?? selected.from_email ?? "—"}
                      </span>
                      {selected.from_email && selected.from_name && (
                        <span className="ml-2 text-white/40">&lt;{selected.from_email}&gt;</span>
                      )}
                    </div>
                    <div className="text-xs text-white/50">
                      Aan: {selected.to_emails.join(", ")}
                      {selected.cc_emails.length > 0 && (
                        <span className="ml-2">CC: {selected.cc_emails.join(", ")}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-white/40">
                      {selected.received_at
                        ? new Date(selected.received_at).toLocaleString("nl-NL")
                        : selected.sent_at
                          ? new Date(selected.sent_at).toLocaleString("nl-NL")
                          : ""}
                    </div>
                  </div>
                  {folder === "inbox" && (
                    <Button
                      size="sm"
                      onClick={onReply}
                      className="bg-[#ff2bd6] hover:bg-[#ff2bd6]/90 text-white"
                    >
                      <Reply className="mr-1 h-3 w-3" /> Beantwoorden
                    </Button>
                  )}
                </div>

                {selected.body_html ? (
                  <div
                    className="rounded border border-white/10 bg-black/20 p-3 text-sm text-white/90"
                    dangerouslySetInnerHTML={{ __html: selected.body_html }}
                  />
                ) : (
                  <div className="rounded border border-white/10 bg-black/20 p-3 whitespace-pre-wrap text-sm text-white/90">
                    {selected.body_text ?? ""}
                  </div>
                )}

                {selected.attachments && selected.attachments.length > 0 && (
                  <div>
                    <div className="mb-1 text-[11px] uppercase tracking-wider text-white/50">
                      Bijlagen
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selected.attachments.map((a) => (
                        <button
                          key={a.path}
                          onClick={() => openAttachment(a.path)}
                          className="inline-flex items-center gap-1.5 rounded border border-white/20 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                        >
                          <Paperclip className="h-3 w-3" />
                          {a.filename}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
