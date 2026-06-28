import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  Inbox as InboxIcon,
  CheckCircle2,
  Clock,
  Send,
  Sparkles,
  Calendar,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  suggestReplyDrafts,
  markMessageRead,
  markMessageHandled,
  snoozeMessage,
  sendInboxReply,
} from "@/lib/outreach.functions";

type Msg = {
  id: string;
  organization_id: string;
  target_id: string;
  campaign_id: string | null;
  subject: string | null;
  body: string | null;
  received_at: string | null;
  read_at: string | null;
  snooze_until: string | null;
  handled_at: string | null;
  reply_classification: string | null;
  sentiment: string | null;
};

type TargetLite = {
  id: string;
  company: string;
  contact_name: string | null;
  email: string | null;
};

type Filter = "unread" | "all" | "snoozed" | "handled";

type Props = {
  organizationId: string | null;
  campaignNames: Record<string, string>;
  onUnreadChange?: (n: number) => void;
};

const CLASSIFY_COLORS: Record<string, string> = {
  positive: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  interested: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  needs_followup: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  not_now: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  negative: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  unsubscribe: "bg-rose-500/20 text-rose-300 border-rose-500/40",
};

export function OutreachInboxTab({ organizationId, campaignNames, onUnreadChange }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [targets, setTargets] = useState<Record<string, TargetLite>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("unread");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState({ subject: "", body: "" });
  const [drafts, setDrafts] = useState<Array<{ label: string; body: string }>>([]);
  const [busy, setBusy] = useState(false);

  const suggest = useServerFn(suggestReplyDrafts);
  const markRead = useServerFn(markMessageRead);
  const markHandled = useServerFn(markMessageHandled);
  const snooze = useServerFn(snoozeMessage);
  const sendReply = useServerFn(sendInboxReply);

  const load = async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("outreach_messages")
      .select(
        "id, organization_id, target_id, campaign_id, subject, body, received_at, read_at, snooze_until, handled_at, reply_classification, sentiment",
      )
      .eq("organization_id", organizationId)
      .eq("direction", "inbound")
      .order("received_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Msg[];
    setMessages(list);

    const targetIds = Array.from(new Set(list.map((m) => m.target_id)));
    if (targetIds.length > 0) {
      const { data: ts } = await supabase
        .from("outreach_targets")
        .select("id, company, contact_name, email")
        .in("id", targetIds);
      const map: Record<string, TargetLite> = {};
      for (const t of (ts ?? []) as TargetLite[]) map[t.id] = t;
      setTargets(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  // Realtime
  useEffect(() => {
    if (!organizationId) return;
    const ch = supabase
      .channel(`outreach-inbox-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "outreach_messages",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return messages.filter((m) => {
      switch (filter) {
        case "unread":
          return !m.read_at && !m.handled_at && (!m.snooze_until || new Date(m.snooze_until).getTime() < now);
        case "snoozed":
          return m.snooze_until && new Date(m.snooze_until).getTime() > now;
        case "handled":
          return !!m.handled_at;
        default:
          return true;
      }
    });
  }, [messages, filter]);

  const unreadCount = useMemo(
    () => messages.filter((m) => !m.read_at && !m.handled_at).length,
    [messages],
  );

  useEffect(() => {
    onUnreadChange?.(unreadCount);
  }, [unreadCount, onUnreadChange]);

  const selected = messages.find((m) => m.id === selectedId) ?? null;
  const selectedTarget = selected ? targets[selected.target_id] : null;

  const handleSelect = async (m: Msg) => {
    setSelectedId(m.id);
    setReply({
      subject: m.subject?.startsWith("Re:") ? m.subject : `Re: ${m.subject ?? ""}`,
      body: "",
    });
    setDrafts([]);
    if (!m.read_at) {
      try {
        await markRead({ data: { message_id: m.id } });
        setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, read_at: new Date().toISOString() } : x)));
      } catch {
        // ignore
      }
    }
  };

  const handleSuggest = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await suggest({ data: { message_id: selected.id } });
      setDrafts(r.drafts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI fout");
    } finally {
      setBusy(false);
    }
  };

  const handleSnooze = async (hours: number) => {
    if (!selected) return;
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    try {
      await snooze({ data: { message_id: selected.id, until } });
      toast.success(`Gesnoozed tot ${new Date(until).toLocaleString("nl-NL")}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fout");
    }
  };

  const handleHandled = async (booked: boolean) => {
    if (!selected) return;
    try {
      await markHandled({ data: { message_id: selected.id, booked_meeting: booked } });
      toast.success(booked ? "Afspraak ingepland & gemarkeerd" : "Afgehandeld");
      setSelectedId(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fout");
    }
  };

  const handleSend = async () => {
    if (!selected || !reply.body.trim()) return;
    setBusy(true);
    try {
      await sendReply({
        data: {
          in_reply_to_message_id: selected.id,
          subject: reply.subject,
          body: reply.body,
        },
      });
      toast.success("Reply verzonden");
      setSelectedId(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verzendfout");
    } finally {
      setBusy(false);
    }
  };

  if (!organizationId) {
    return <div className="text-sm text-muted-foreground">Geen actieve omgeving.</div>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      {/* List */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <InboxIcon className="h-4 w-4 text-muted-foreground" />
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="h-8 w-full bg-muted/50 border-border text-xs text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unread">Ongelezen ({unreadCount})</SelectItem>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="snoozed">Gesnoozed</SelectItem>
              <SelectItem value="handled">Afgehandeld</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Geen berichten
          </div>
        ) : (
          <div className="space-y-1 max-h-[70vh] overflow-y-auto pr-1">
            {filtered.map((m) => {
              const t = targets[m.target_id];
              const isSelected = m.id === selectedId;
              const isUnread = !m.read_at;
              return (
                <button
                  key={m.id}
                  onClick={() => handleSelect(m)}
                  className={`w-full text-left rounded-md border p-2.5 transition ${
                    isSelected
                      ? "border-brand/60 bg-brand/10"
                      : "border-border bg-muted/50 hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className={`truncate text-xs font-medium ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>
                      {t?.contact_name ?? t?.company ?? "—"}
                    </div>
                    {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{t?.company}</div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">{m.subject ?? "(geen onderwerp)"}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {m.received_at ? new Date(m.received_at).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" }) : ""}
                    </span>
                    {m.reply_classification && (
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 py-0 ${CLASSIFY_COLORS[m.reply_classification] ?? "border-border text-muted-foreground"}`}
                      >
                        {m.reply_classification}
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail */}
      <div className="rounded-lg border border-border bg-muted/50 p-4 min-h-[400px]">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Selecteer een bericht
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {selectedTarget?.contact_name ?? selectedTarget?.company ?? "—"}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{selectedTarget?.email}</span>
                </div>
                <div className="text-xs text-muted-foreground">{selectedTarget?.company}</div>
                {selected.campaign_id && (
                  <div className="text-[11px] text-muted-foreground">
                    Campagne: {campaignNames[selected.campaign_id] ?? selected.campaign_id}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-border text-foreground hover:bg-muted"
                  onClick={() => handleSnooze(4)}
                >
                  <Clock className="mr-1 h-3 w-3" /> 4u
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-border text-foreground hover:bg-muted"
                  onClick={() => handleSnooze(24)}
                >
                  <Clock className="mr-1 h-3 w-3" /> 1d
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                  onClick={() => handleHandled(true)}
                >
                  <Calendar className="mr-1 h-3 w-3" /> Afspraak
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-border text-foreground hover:bg-muted"
                  onClick={() => handleHandled(false)}
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Done
                </Button>
              </div>
            </div>

            <div className="rounded border border-border bg-muted/30 p-3">
              <div className="text-xs font-medium text-muted-foreground">{selected.subject ?? "(geen onderwerp)"}</div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">{selected.body ?? ""}</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reply</div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-brand hover:bg-brand/10"
                  onClick={handleSuggest}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                  AI drafts
                </Button>
              </div>

              {drafts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {drafts.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setReply((r) => ({ ...r, body: d.body }))}
                      className="rounded border border-border bg-muted/50 px-2 py-1 text-[11px] text-foreground hover:bg-muted"
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}

              <Input
                value={reply.subject}
                onChange={(e) => setReply((r) => ({ ...r, subject: e.target.value }))}
                placeholder="Onderwerp"
                className="bg-muted/50 border-border text-foreground"
              />
              <Textarea
                value={reply.body}
                onChange={(e) => setReply((r) => ({ ...r, body: e.target.value }))}
                rows={6}
                placeholder="Schrijf je antwoord..."
                className="bg-muted/50 border-border text-foreground"
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleSend}
                  disabled={busy || !reply.body.trim()}
                  className="bg-brand hover:bg-brand/90 text-brand-foreground"
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Verstuur
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
