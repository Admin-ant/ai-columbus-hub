import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pin, Trash2, Bell } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { createAnnouncement, ANNOUNCEMENT_CATEGORIES } from "@/lib/announcements.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/mededelingen")({
  head: () => ({
    meta: [
      { title: "Mededelingen — AI van Columbus Portaal" },
      {
        name: "description",
        content:
          "Deel nieuws met je collega's en bepaal zelf van welke categorieën je een e-mailmelding ontvangt.",
      },
      { property: "og:title", content: "Mededelingen — AI van Columbus Portaal" },
      {
        property: "og:description",
        content: "Deel nieuws met collega's en beheer je eigen e-mailmeldingen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnnouncementsPage,
});

const CATEGORY_LABELS: Record<string, string> = {
  algemeen: "Algemeen",
  update: "Update",
  urgent: "Urgent",
};

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  created_by: string | null;
  created_at: string;
};

function AnnouncementsPage() {
  const { user, hasRole } = useAuth();
  const { currentOrganizationId } = useWorkspace();
  const qc = useQueryClient();
  const orgId = currentOrganizationId;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<string>("algemeen");
  const [pinned, setPinned] = useState(false);
  const [notify, setNotify] = useState(true);

  const announcements = useQuery({
    queryKey: ["announcements", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, body, category, pinned, created_by, created_at")
        .eq("organization_id", orgId!)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as AnnouncementRow[];
    },
  });

  const publish = useMutation({
    mutationFn: async () =>
      createAnnouncement({
        data: {
          organization_id: orgId!,
          title: title.trim(),
          body: body.trim(),
          category: category as (typeof ANNOUNCEMENT_CATEGORIES)[number],
          pinned,
          notify,
        },
      }),
    onSuccess: (res: { notified: number; warning?: string }) => {
      setTitle("");
      setBody("");
      setPinned(false);
      toast.success(
        res.warning
          ? res.warning
          : `Mededeling geplaatst${res.notified ? ` — ${res.notified} collega('s) gemaild` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["announcements", orgId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Plaatsen mislukt"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mededeling verwijderd");
      qc.invalidateQueries({ queryKey: ["announcements", orgId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt"),
  });

  const canPublish = !!orgId && title.trim().length > 0 && !publish.isPending;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mededelingen</h1>
        <p className="text-sm text-muted-foreground">
          Plaats nieuws voor je collega's en bepaal zelf waarvan je een mailtje wilt krijgen.
        </p>
      </div>

      <NotificationPreferencesCard organizationId={orgId} userId={user?.id ?? null} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-4 w-4" /> Nieuwe mededeling
          </CardTitle>
          <CardDescription>
            Collega's zien dit direct in het portaal en krijgen een mail als hun voorkeuren dat
            toelaten.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ann-title">Titel</Label>
            <Input
              id="ann-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bijv. Nieuwe offerte-template beschikbaar"
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-body">Bericht</Label>
            <Textarea
              id="ann-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Wat is er nieuw?"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Categorie</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANNOUNCEMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-end gap-2">
              <div className="flex items-center justify-between rounded-md border p-2">
                <Label htmlFor="ann-pinned" className="text-sm">
                  Bovenaan vastzetten
                </Label>
                <Switch id="ann-pinned" checked={pinned} onCheckedChange={setPinned} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-2">
                <Label htmlFor="ann-notify" className="text-sm">
                  Collega's mailen
                </Label>
                <Switch id="ann-notify" checked={notify} onCheckedChange={setNotify} />
              </div>
            </div>
          </div>
          <Button disabled={!canPublish} onClick={() => publish.mutate()}>
            {publish.isPending ? "Bezig…" : "Plaatsen"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Geplaatste mededelingen</CardTitle>
          <CardDescription>De laatste 100 berichten in deze organisatie.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {announcements.isLoading && (
            <p className="text-sm text-muted-foreground">Laden…</p>
          )}
          {announcements.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nog geen mededelingen geplaatst.</p>
          )}
          {(announcements.data ?? []).map((a) => (
            <div key={a.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.pinned && <Pin className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="font-medium">{a.title}</span>
                    <Badge variant={a.category === "urgent" ? "destructive" : "secondary"}>
                      {CATEGORY_LABELS[a.category] ?? a.category}
                    </Badge>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("nl-NL")}
                  </p>
                </div>
                {(a.created_by === user?.id || hasRole("admin")) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Verwijderen"
                    onClick={() => remove.mutate(a.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationPreferencesCard({
  organizationId,
  userId,
}: {
  organizationId: string | null;
  userId: string | null;
}) {
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [categories, setCategories] = useState<string[]>([...ANNOUNCEMENT_CATEGORIES]);
  const [saving, setSaving] = useState(false);
  const ready = !!organizationId && !!userId;

  const prefs = useQuery({
    queryKey: ["notification-prefs", organizationId, userId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("email_enabled, categories")
        .eq("organization_id", organizationId!)
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data as { email_enabled: boolean; categories: string[] } | null;
    },
  });

  useEffect(() => {
    if (prefs.data) {
      setEmailEnabled(prefs.data.email_enabled);
      setCategories(prefs.data.categories ?? []);
    }
  }, [prefs.data]);

  const dirty = useMemo(() => {
    const base = prefs.data ?? {
      email_enabled: true,
      categories: [...ANNOUNCEMENT_CATEGORIES] as string[],
    };
    return (
      base.email_enabled !== emailEnabled ||
      [...(base.categories ?? [])].sort().join(",") !== [...categories].sort().join(",")
    );
  }, [prefs.data, emailEnabled, categories]);

  async function save() {
    if (!ready) return;
    setSaving(true);
    const { error } = await supabase.from("notification_preferences").upsert(
      {
        user_id: userId!,
        organization_id: organizationId!,
        email_enabled: emailEnabled,
        categories,
      } as never,
      { onConflict: "user_id,organization_id" },
    );
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Meldingsvoorkeuren opgeslagen");
      prefs.refetch();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4" /> Mijn e-mailmeldingen
        </CardTitle>
        <CardDescription>
          Geldt alleen voor jou: kies of en waarvan je een mail wilt ontvangen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-md border p-3">
          <Label htmlFor="pref-email" className="text-sm font-medium">
            E-mailmeldingen ontvangen
          </Label>
          <Switch id="pref-email" checked={emailEnabled} onCheckedChange={setEmailEnabled} />
        </div>
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Categorieën</p>
          {ANNOUNCEMENT_CATEGORIES.map((c) => (
            <div key={c} className="flex items-center gap-2">
              <Checkbox
                id={`pref-${c}`}
                disabled={!emailEnabled}
                checked={categories.includes(c)}
                onCheckedChange={(v) =>
                  setCategories((prev) =>
                    v ? [...new Set([...prev, c])] : prev.filter((x) => x !== c),
                  )
                }
              />
              <Label htmlFor={`pref-${c}`} className="text-sm font-normal">
                {CATEGORY_LABELS[c]}
              </Label>
            </div>
          ))}
        </div>
        <Button size="sm" disabled={!ready || !dirty || saving} onClick={save}>
          {saving ? "Opslaan…" : "Voorkeuren opslaan"}
        </Button>
      </CardContent>
    </Card>
  );
}
