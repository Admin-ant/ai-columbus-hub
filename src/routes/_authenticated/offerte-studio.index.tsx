import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Wand2, FileText, Trash2, Copy } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  buildDefaultSections,
  DEFAULT_THEME,
  type StudioSection,
  type StudioTheme,
} from "@/lib/offerte-studio";

export const Route = createFileRoute("/_authenticated/offerte-studio")({
  head: () => ({ meta: [{ title: "Offerte Studio" }] }),
  component: OfferteStudioIndex,
});

type StudioQuote = {
  id: string;
  title: string;
  client_name: string | null;
  cover_image_url: string | null;
  status: string;
  updated_at: string;
  theme: StudioTheme;
};

type StudioTemplate = {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  updated_at: string;
  theme: StudioTheme;
};

function OfferteStudioIndex() {
  const { user } = useAuth();
  const { currentOrganizationId, currentOrganization, loading: wsLoading } = useWorkspace();
  const navigate = useNavigate();

  const [quotes, setQuotes] = useState<StudioQuote[]>([]);
  const [templates, setTemplates] = useState<StudioTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newTemplate, setNewTemplate] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!currentOrganizationId) {
      setQuotes([]);
      setTemplates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [q, t] = await Promise.all([
      supabase
        .from("studio_quotes")
        .select("id,title,client_name,cover_image_url,status,updated_at,theme")
        .eq("organization_id", currentOrganizationId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("quote_templates")
        .select("id,name,description,cover_image_url,updated_at,theme")
        .eq("organization_id", currentOrganizationId)
        .order("updated_at", { ascending: false }),
    ]);
    if (q.error) toast.error(q.error.message);
    if (t.error) toast.error(t.error.message);
    setQuotes((q.data ?? []) as StudioQuote[]);
    setTemplates((t.data ?? []) as StudioTemplate[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!wsLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganizationId, wsLoading]);

  async function createQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return toast.error("Geef een titel op");
    if (!currentOrganizationId) return toast.error("Geen organisatie");
    setSaving(true);

    let sections: StudioSection[] = buildDefaultSections();
    let theme: StudioTheme = DEFAULT_THEME;
    let cover: string | null = null;
    let template_id: string | null = null;

    if (newTemplate) {
      const tpl = templates.find((t) => t.id === newTemplate);
      const { data: full } = await supabase
        .from("quote_templates")
        .select("sections,theme,cover_image_url")
        .eq("id", newTemplate)
        .maybeSingle();
      if (full) {
        sections = (full.sections as unknown as StudioSection[]) ?? sections;
        theme = (full.theme as unknown as StudioTheme) ?? DEFAULT_THEME;
        cover = full.cover_image_url ?? null;
      }
      template_id = tpl?.id ?? null;
    }

    const { data, error } = await supabase
      .from("studio_quotes")
      .insert({
        organization_id: currentOrganizationId,
        template_id,
        title: newTitle.trim(),
        client_name: newClient.trim() || null,
        cover_image_url: cover,
        theme: theme as never,
        sections: sections as never,
        status: "draft",
        created_by: user?.id ?? null,
      } as never)
      .select("id")
      .single();

    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Offerte aangemaakt");
    setNewOpen(false);
    setNewTitle("");
    setNewClient("");
    setNewTemplate("");
    if (data) navigate({ to: "/offerte-studio/q/$id", params: { id: data.id } });
  }

  async function duplicateAsTemplate(q: StudioQuote) {
    if (!currentOrganizationId) return;
    const { data: full } = await supabase
      .from("studio_quotes")
      .select("sections,theme,cover_image_url")
      .eq("id", q.id)
      .maybeSingle();
    if (!full) return toast.error("Niet gevonden");
    const { error } = await supabase.from("quote_templates").insert({
      organization_id: currentOrganizationId,
      name: `Sjabloon — ${q.title}`,
      description: null,
      cover_image_url: full.cover_image_url ?? null,
      theme: full.theme as never,
      sections: full.sections as never,
      created_by: user?.id ?? null,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Opgeslagen als sjabloon");
    load();
  }

  async function deleteQuote(id: string) {
    if (!confirm("Deze offerte verwijderen?")) return;
    const { error } = await supabase.from("studio_quotes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Verwijderd");
    load();
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Dit sjabloon verwijderen?")) return;
    const { error } = await supabase.from("quote_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Verwijderd");
    load();
  }

  async function createTemplate() {
    if (!currentOrganizationId) return;
    const name = prompt("Naam voor sjabloon?");
    if (!name?.trim()) return;
    const { data, error } = await supabase
      .from("quote_templates")
      .insert({
        organization_id: currentOrganizationId,
        name: name.trim(),
        description: null,
        theme: DEFAULT_THEME as never,
        sections: buildDefaultSections() as never,
        created_by: user?.id ?? null,
      } as never)
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    toast.success("Sjabloon aangemaakt");
    if (data) navigate({ to: "/offerte-studio/t/$id", params: { id: data.id } });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wand2 className="h-6 w-6" />
            Offerte Studio
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentOrganization?.name ?? ""} — premium offertes & sjablonen
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={createTemplate}>
            <Plus className="mr-2 h-4 w-4" />
            Nieuw sjabloon
          </Button>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#ff2bd6] text-white hover:bg-[#ff2bd6]/90 shadow-[0_0_20px_rgba(255,43,214,0.4)]">
                <Plus className="mr-2 h-4 w-4" />
                Nieuwe offerte
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nieuwe offerte</DialogTitle>
                <DialogDescription>Start vanaf nul of vanuit een sjabloon.</DialogDescription>
              </DialogHeader>
              <form onSubmit={createQuote} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="t">Titel</Label>
                  <Input id="t" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c">Klantnaam (optioneel)</Label>
                  <Input id="c" value={newClient} onChange={(e) => setNewClient(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Sjabloon (optioneel)</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    value={newTemplate}
                    onChange={(e) => setNewTemplate(e.target.value)}
                  >
                    <option value="">— Leeg starten —</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Aanmaken
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="quotes">
        <TabsList>
          <TabsTrigger value="quotes">Mijn offertes ({quotes.length})</TabsTrigger>
          <TabsTrigger value="templates">Sjablonen ({templates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="quotes" className="mt-4">
          {loading ? (
            <Loading />
          ) : quotes.length === 0 ? (
            <Empty text="Nog geen offertes. Klik op 'Nieuwe offerte' om te starten." />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {quotes.map((q) => (
                <Card
                  key={q.id}
                  title={q.title}
                  subtitle={q.client_name ?? "—"}
                  cover={q.cover_image_url}
                  accent={q.theme?.accent ?? DEFAULT_THEME.accent}
                  href={{ to: "/offerte-studio/q/$id", params: { id: q.id } }}
                  badge={q.status}
                  onDelete={() => deleteQuote(q.id)}
                  onDuplicate={() => duplicateAsTemplate(q)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          {loading ? (
            <Loading />
          ) : templates.length === 0 ? (
            <Empty text="Nog geen sjablonen. Klik op 'Nieuw sjabloon' om te starten." />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => (
                <Card
                  key={t.id}
                  title={t.name}
                  subtitle={t.description ?? "Sjabloon"}
                  cover={t.cover_image_url}
                  accent={t.theme?.accent ?? DEFAULT_THEME.accent}
                  href={{ to: "/offerte-studio/t/$id", params: { id: t.id } }}
                  badge="sjabloon"
                  onDelete={() => deleteTemplate(t.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

type CardHref =
  | { to: "/offerte-studio/q/$id"; params: { id: string } }
  | { to: "/offerte-studio/t/$id"; params: { id: string } };

function Card({
  title,
  subtitle,
  cover,
  accent,
  href,
  badge,
  onDelete,
  onDuplicate,
}: {
  title: string;
  subtitle: string;
  cover: string | null;
  accent: string;
  href: CardHref;
  badge: string;
  onDelete: () => void;
  onDuplicate?: () => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-lg border bg-card transition-all hover:shadow-lg">
      <Link {...href} className="block">
        <div
          className="relative aspect-[16/10] w-full overflow-hidden"
          style={{
            background: cover
              ? `linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.65)), url(${cover}) center/cover`
              : `radial-gradient(circle at 30% 20%, ${accent}33, transparent 60%), #0a0a0a`,
          }}
        >
          <div className="absolute inset-0 flex flex-col justify-between p-4 text-white">
            <span
              className="self-start rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider"
              style={{ borderColor: accent, color: accent }}
            >
              {badge}
            </span>
            <div>
              <div className="text-lg font-semibold drop-shadow">{title}</div>
              <div className="text-xs text-white/70">{subtitle}</div>
            </div>
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-end gap-1 border-t bg-background/60 px-2 py-1.5">
        {onDuplicate && (
          <Button variant="ghost" size="sm" onClick={onDuplicate} title="Opslaan als sjabloon">
            <Copy className="h-3.5 w-3.5" />
          </Button>
        )}
        <Link {...href}>
          <Button variant="ghost" size="sm">
            <FileText className="mr-1 h-3.5 w-3.5" /> Openen
          </Button>
        </Link>
        <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
