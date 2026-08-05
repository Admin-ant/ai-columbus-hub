import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Star, Check, Pin } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAnnouncementRealtime } from "@/hooks/use-announcement-realtime";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/meldingen")({
  head: () => ({
    meta: [
      { title: "Mijn meldingen — AI van Columbus Portaal" },
      {
        name: "description",
        content:
          "Bekijk welke mededelingen je hebt ontvangen, wat je al gelezen hebt en wat je als belangrijk hebt gemarkeerd.",
      },
      { property: "og:title", content: "Mijn meldingen — AI van Columbus Portaal" },
      {
        property: "og:description",
        content: "Overzicht van ontvangen, gelezen en belangrijk gemarkeerde mededelingen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NotificationsPage,
});

const CATEGORY_LABELS: Record<string, string> = {
  algemeen: "Algemeen",
  update: "Update",
  urgent: "Urgent",
};

type Row = {
  id: string;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  created_at: string;
  read_at: string | null;
  starred: boolean;
};

type Filter = "alle" | "ongelezen" | "gelezen" | "belangrijk";

function NotificationsPage() {
  const { user } = useAuth();
  const { currentOrganizationId: orgId } = useWorkspace();
  const qc = useQueryClient();
  const userId = user?.id ?? null;

  const [filter, setFilter] = useState<Filter>("alle");
  const [search, setSearch] = useState("");

  useAnnouncementRealtime();

  const key = ["my-notifications", orgId, userId] as const;

  const list = useQuery({
    queryKey: key,
    enabled: !!orgId && !!userId,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, body, category, pinned, created_at")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const { data: reads, error: readErr } = await supabase
        .from("announcement_reads")
        .select("announcement_id, read_at, starred")
        .eq("user_id", userId!);
      if (readErr) throw readErr;

      const byId = new Map(
        (reads ?? []).map((r) => [
          r.announcement_id as string,
          r as { read_at: string | null; starred: boolean },
        ]),
      );

      return (data ?? []).map((a) => ({
        ...(a as Omit<Row, "read_at" | "starred">),
        read_at: byId.get(a.id)?.read_at ?? null,
        starred: byId.get(a.id)?.starred ?? false,
      }));
    },
  });

  const upsertState = useMutation({
    mutationFn: async (input: { id: string; read: boolean; starred: boolean }) => {
      if (!input.read && !input.starred) {
        const { error } = await supabase
          .from("announcement_reads")
          .delete()
          .eq("announcement_id", input.id)
          .eq("user_id", userId!);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("announcement_reads").upsert(
        {
          announcement_id: input.id,
          user_id: userId!,
          read_at: new Date().toISOString(),
          starred: input.starred,
        } as never,
        { onConflict: "announcement_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Bijwerken mislukt"),
  });

  const markAllRead = useMutation({
    mutationFn: async (rows: Row[]) => {
      const unread = rows.filter((r) => !r.read_at);
      if (unread.length === 0) return 0;
      const { error } = await supabase.from("announcement_reads").upsert(
        unread.map((r) => ({
          announcement_id: r.id,
          user_id: userId!,
          read_at: new Date().toISOString(),
          starred: r.starred,
        })) as never,
        { onConflict: "announcement_id,user_id" },
      );
      if (error) throw error;
      return unread.length;
    },
    onSuccess: (n) => {
      if (n) toast.success(`${n} melding(en) gemarkeerd als gelezen`);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Bijwerken mislukt"),
  });

  const rows = list.data ?? [];

  const counts = useMemo(
    () => ({
      alle: rows.length,
      ongelezen: rows.filter((r) => !r.read_at).length,
      gelezen: rows.filter((r) => r.read_at).length,
      belangrijk: rows.filter((r) => r.starred).length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) =>
        filter === "ongelezen"
          ? !r.read_at
          : filter === "gelezen"
            ? !!r.read_at
            : filter === "belangrijk"
              ? r.starred
              : true,
      )
      .filter(
        (r) =>
          !q ||
          r.title.toLowerCase().includes(q) ||
          r.body.toLowerCase().includes(q),
      )
      .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [rows, filter, search]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mijn meldingen</h1>
        <p className="text-sm text-muted-foreground">
          Alles wat je hebt ontvangen: wat je al gelezen hebt en wat je zelf belangrijk vindt.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Ontvangen" value={counts.alle} />
        <StatTile label="Ongelezen" value={counts.ongelezen} />
        <StatTile label="Gelezen" value={counts.gelezen} />
        <StatTile label="Belangrijk" value={counts.belangrijk} />
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-4 w-4" /> Overzicht
              </CardTitle>
              <CardDescription>Filter op status of zoek in de berichten.</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!counts.ongelezen || markAllRead.isPending}
              onClick={() => markAllRead.mutate(rows)}
            >
              Alles als gelezen markeren
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList>
                <TabsTrigger value="alle">Alle</TabsTrigger>
                <TabsTrigger value="ongelezen">Ongelezen</TabsTrigger>
                <TabsTrigger value="gelezen">Gelezen</TabsTrigger>
                <TabsTrigger value="belangrijk">Belangrijk</TabsTrigger>
              </TabsList>
            </Tabs>
            <Input
              className="h-9 w-full sm:w-64"
              placeholder="Zoeken…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {list.isLoading && <p className="text-sm text-muted-foreground">Laden…</p>}
          {!list.isLoading && visible.length === 0 && (
            <p className="text-sm text-muted-foreground">Geen meldingen in deze weergave.</p>
          )}
          {visible.map((r) => (
            <div
              key={r.id}
              className={cn(
                "rounded-md border p-3",
                !r.read_at && "border-primary/40 bg-primary/5",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.pinned && <Pin className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="font-medium">{r.title}</span>
                    <Badge variant={r.category === "urgent" ? "destructive" : "secondary"}>
                      {CATEGORY_LABELS[r.category] ?? r.category}
                    </Badge>
                    {!r.read_at && <Badge variant="outline">Nieuw</Badge>}
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{r.body}</p>
                  <p className="text-xs text-muted-foreground">
                    Ontvangen {new Date(r.created_at).toLocaleString("nl-NL")}
                    {r.read_at
                      ? ` · gelezen ${new Date(r.read_at).toLocaleString("nl-NL")}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={r.starred ? "Markering verwijderen" : "Markeer als belangrijk"}
                    onClick={() =>
                      upsertState.mutate({
                        id: r.id,
                        read: !!r.read_at,
                        starred: !r.starred,
                      })
                    }
                  >
                    <Star
                      className={cn(
                        "h-4 w-4",
                        r.starred && "fill-amber-400 text-amber-500",
                      )}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={r.read_at ? "Markeer als ongelezen" : "Markeer als gelezen"}
                    onClick={() =>
                      upsertState.mutate({
                        id: r.id,
                        read: !r.read_at,
                        starred: r.starred,
                      })
                    }
                  >
                    <Check
                      className={cn("h-4 w-4", r.read_at && "text-emerald-600")}
                    />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
