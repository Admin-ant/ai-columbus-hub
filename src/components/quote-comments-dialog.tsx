import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Send, Check } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  addQuoteComment,
  listQuoteComments,
  listOrgMembers,
  resolveQuoteComment,
} from "@/lib/enterprise.functions";

type Comment = {
  id: string;
  body: string;
  mentions: string[] | null;
  resolved: boolean;
  author_id: string;
  created_at: string;
};

type Member = {
  user_id: string;
  profile: { id: string; email: string | null; display_name: string | null; avatar_url: string | null } | null;
};

export function QuoteCommentsDialog({
  open,
  onOpenChange,
  quoteId,
  organizationId,
  quoteTitle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  quoteId: string | null;
  organizationId: string;
  quoteTitle?: string;
}) {
  const list = useServerFn(listQuoteComments);
  const add = useServerFn(addQuoteComment);
  const resolve = useServerFn(resolveQuoteComment);
  const members = useServerFn(listOrgMembers);

  const [items, setItems] = useState<Comment[]>([]);
  const [mems, setMems] = useState<Member[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || !quoteId) return;
    setLoading(true);
    Promise.all([
      list({ data: { quote_id: quoteId } }),
      members({ data: { organization_id: organizationId } }),
    ])
      .then(([c, m]) => {
        setItems(c as Comment[]);
        setMems(m as Member[]);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [open, quoteId, organizationId, list, members]);

  const mentionQuery = useMemo(() => {
    const m = body.match(/@(\w*)$/);
    return m ? m[1].toLowerCase() : null;
  }, [body]);

  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    return mems.filter((m) => {
      const name = (m.profile?.display_name || m.profile?.email || "").toLowerCase();
      return name.includes(mentionQuery);
    }).slice(0, 6);
  }, [mems, mentionQuery]);

  useEffect(() => { setShowSuggest(mentionQuery !== null && suggestions.length > 0); }, [mentionQuery, suggestions]);

  const insertMention = (m: Member) => {
    const name = m.profile?.display_name || m.profile?.email?.split("@")[0] || "user";
    setBody((b) => b.replace(/@(\w*)$/, `@${name} `));
    taRef.current?.focus();
  };

  const handleSend = async () => {
    if (!quoteId || !body.trim()) return;
    setSending(true);
    try {
      // Resolve @names to user_ids
      const mentionIds: string[] = [];
      const matches = body.match(/@([\w.-]+)/g) ?? [];
      for (const raw of matches) {
        const name = raw.slice(1).toLowerCase();
        const hit = mems.find((m) => {
          const dn = (m.profile?.display_name || "").toLowerCase();
          const em = (m.profile?.email?.split("@")[0] || "").toLowerCase();
          return dn === name || em === name || dn.startsWith(name);
        });
        if (hit?.profile?.id && !mentionIds.includes(hit.profile.id)) mentionIds.push(hit.profile.id);
      }
      const row = await add({
        data: { organization_id: organizationId, quote_id: quoteId, body: body.trim(), mentions: mentionIds },
      });
      setItems((prev) => [...prev, row as Comment]);
      setBody("");
      if (mentionIds.length) toast.success(`Verstuurd — ${mentionIds.length} collega('s) genotificeerd`);
      else toast.success("Opmerking geplaatst");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const toggleResolve = async (c: Comment) => {
    try {
      await resolve({ data: { id: c.id, resolved: !c.resolved } });
      setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, resolved: !c.resolved } : x)));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const nameFor = (uid: string) => {
    const m = mems.find((x) => x.user_id === uid);
    return m?.profile?.display_name || m?.profile?.email || "Onbekend";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Team-opmerkingen</DialogTitle>
          <DialogDescription>
            {quoteTitle ? `Offerte: ${quoteTitle} — ` : ""}gebruik <code>@naam</code> om een collega te taggen (krijgt e-mail).
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[40vh] overflow-y-auto space-y-3 pr-1">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laden…</div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen opmerkingen.</p>
          ) : (
            items.map((c) => (
              <div key={c.id} className={`rounded-md border p-3 ${c.resolved ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-2">
                  <Avatar className="h-7 w-7"><AvatarFallback>{nameFor(c.author_id).slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{nameFor(c.author_id)}</span>
                      <span>•</span>
                      <span>{new Date(c.created_at).toLocaleString("nl-NL")}</span>
                      {c.resolved && <Badge variant="secondary" className="ml-1">Opgelost</Badge>}
                    </div>
                    <div className="text-sm whitespace-pre-wrap mt-1">{c.body}</div>
                    {(c.mentions?.length ?? 0) > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">Genoemd: {c.mentions!.map(nameFor).join(", ")}</div>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => toggleResolve(c)} title={c.resolved ? "Heropen" : "Markeer opgelost"}>
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="relative">
          <Textarea
            ref={taRef}
            placeholder="Schrijf een opmerking… typ @ om een collega te taggen"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            disabled={sending}
          />
          {showSuggest && (
            <div className="absolute bottom-full left-0 right-0 mb-1 rounded-md border bg-popover shadow-lg z-50 max-h-48 overflow-y-auto">
              {suggestions.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => insertMention(m)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                >
                  <Avatar className="h-6 w-6"><AvatarFallback>{(m.profile?.display_name || m.profile?.email || "?").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                  <span className="font-medium">{m.profile?.display_name || m.profile?.email}</span>
                  {m.profile?.display_name && m.profile.email && (
                    <span className="text-xs text-muted-foreground">{m.profile.email}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSend} disabled={sending || !body.trim()}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Plaatsen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
