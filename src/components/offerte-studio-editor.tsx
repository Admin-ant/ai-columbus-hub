import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Save,
  Printer,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Image as ImageIcon,
  BookmarkPlus,
  Wand2,
  Share2,
  Copy,
} from "lucide-react";

import { useServerFn } from "@tanstack/react-start";
import { createShareToken } from "@/lib/studio-public.functions";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  buildDefaultSections,
  DEFAULT_THEME,
  SECTION_DEFS,
  type StudioSection,
  type StudioTheme,
} from "@/lib/offerte-studio";

type EditorKind = "quote" | "template";

type Props = {
  kind: EditorKind;
  id: string;
};

type QuoteRow = {
  id: string;
  organization_id: string;
  title: string;
  client_name: string | null;
  cover_image_url: string | null;
  theme: StudioTheme;
  sections: StudioSection[];
  status: string;
  approved_at: string | null;
};

type TemplateRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  theme: StudioTheme;
  sections: StudioSection[];
};

export function OfferteStudioEditor({ kind, id }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentOrganizationId } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [client, setClient] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [theme, setTheme] = useState<StudioTheme>(DEFAULT_THEME);
  const [sections, setSections] = useState<StudioSection[]>(buildDefaultSections());
  const [approved, setApproved] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const dirty = useRef(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const createTok = useServerFn(createShareToken);

  const table = kind === "quote" ? "studio_quotes" : "quote_templates";

  async function share() {
    if (kind !== "quote") return;
    setSharing(true);
    try {
      const { token } = await createTok({ data: { id } });
      setShareToken(token);
      const url = `${window.location.origin}/q/${token}`;
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast.success("Deel-link gekopieerd naar klembord");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mislukt");
    } finally {
      setSharing(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
      if (!active) return;
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      if (!data) {
        toast.error("Niet gevonden");
        setLoading(false);
        return;
      }
      if (kind === "quote") {
        const q = data as unknown as QuoteRow;
        setTitle(q.title);
        setClient(q.client_name ?? "");
        setCover(q.cover_image_url);
        setTheme(q.theme ?? DEFAULT_THEME);
        setSections(
          Array.isArray(q.sections) && q.sections.length ? q.sections : buildDefaultSections(),
        );
        setApproved(q.status === "approved");
        setShareToken((q as unknown as { public_token?: string | null }).public_token ?? null);
      } else {
        const t = data as unknown as TemplateRow;
        setTitle(t.name);
        setClient(t.description ?? "");
        setCover(t.cover_image_url);
        setTheme(t.theme ?? DEFAULT_THEME);
        setSections(
          Array.isArray(t.sections) && t.sections.length ? t.sections : buildDefaultSections(),
        );
      }
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [id, kind, table]);

  function mark() {
    dirty.current = true;
  }

  function updateSection(idx: number, patch: Partial<StudioSection>) {
    setSections((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
    mark();
  }

  async function save() {
    setSaving(true);
    const payload =
      kind === "quote"
        ? {
            title,
            client_name: client || null,
            cover_image_url: cover,
            theme: theme as never,
            sections: sections as never,
            status: approved ? "approved" : "draft",
            approved_at: approved ? new Date().toISOString() : null,
          }
        : {
            name: title,
            description: client || null,
            cover_image_url: cover,
            theme: theme as never,
            sections: sections as never,
          };

    const { error } = await supabase.from(table).update(payload as never).eq("id", id);
    setSaving(false);
    if (error) return toast.error(error.message);
    dirty.current = false;
    toast.success("Opgeslagen");
  }

  async function saveAsTemplate() {
    if (kind === "template") return;
    if (!currentOrganizationId) return;
    const name = prompt("Naam voor sjabloon?", `Sjabloon — ${title}`);
    if (!name?.trim()) return;
    const { error } = await supabase.from("quote_templates").insert({
      organization_id: currentOrganizationId,
      name: name.trim(),
      description: null,
      cover_image_url: cover,
      theme: theme as never,
      sections: sections as never,
      created_by: user?.id ?? null,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Opgeslagen als sjabloon");
  }

  function toggleApproved() {
    setApproved((v) => !v);
    mark();
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
      if (e.key === "ArrowRight" && (e.metaKey || e.altKey)) {
        e.preventDefault();
        setActiveIdx((i) => Math.min(sections.length - 1, i + 1));
      }
      if (e.key === "ArrowLeft" && (e.metaKey || e.altKey)) {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.length, title, client, cover, sections, approved, theme]);

  const active = sections[activeIdx];

  const styles = useMemo(
    () => ({
      shell: {
        background: theme.bg,
        color: theme.fg,
      } as React.CSSProperties,
      accent: theme.accent,
    }),
    [theme],
  );

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
      </div>
    );
  }

  return (
    <div
      className="flex h-[calc(100vh-3.5rem)] min-h-[600px] flex-col overflow-hidden rounded-lg border"
      style={styles.shell}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-2"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/offerte-studio" })}
            className="text-white/80 hover:text-white hover:bg-white/10"
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Terug
          </Button>
          <div className="hidden sm:flex items-center gap-2 min-w-0">
            <Wand2 className="h-4 w-4" style={{ color: styles.accent }} />
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                mark();
              }}
              className="h-8 w-[280px] border-white/10 bg-white/5 text-white placeholder:text-white/40"
              placeholder={kind === "quote" ? "Offertetitel" : "Sjabloonnaam"}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
            disabled={activeIdx === 0}
            className="text-white/80 hover:text-white hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-white/60 tabular-nums">
            {activeIdx + 1} / {sections.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveIdx((i) => Math.min(sections.length - 1, i + 1))}
            disabled={activeIdx === sections.length - 1}
            className="text-white/80 hover:text-white hover:bg-white/10"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="mx-2 h-5 w-px bg-white/10" />
          {kind === "quote" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={saveAsTemplate}
              className="text-white/80 hover:text-white hover:bg-white/10"
              title="Opslaan als sjabloon"
            >
              <BookmarkPlus className="mr-1 h-4 w-4" /> Als sjabloon
            </Button>
          )}
          {kind === "quote" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={share}
              disabled={sharing}
              className="hover:bg-white/10"
              style={{ color: shareToken ? styles.accent : "rgba(255,255,255,0.8)" }}
              title={shareToken ? "Deel-link kopiëren" : "Deel-link genereren"}
            >
              {shareToken ? (
                <Copy className="mr-1 h-4 w-4" />
              ) : (
                <Share2 className="mr-1 h-4 w-4" />
              )}
              {shareToken ? "Deel-link" : "Delen"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.print()}
            className="text-white/80 hover:text-white hover:bg-white/10"
          >
            <Printer className="mr-1 h-4 w-4" /> Printen
          </Button>
          {kind === "quote" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleApproved}
              className="hover:bg-white/10"
              style={{
                color: approved ? styles.accent : "rgba(255,255,255,0.8)",
              }}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              {approved ? "Goedgekeurd ✓" : "Offerte goedkeuren"}
            </Button>
          )}
          <Button
            size="sm"
            onClick={save}
            disabled={saving}
            style={{
              background: styles.accent,
              color: "#0a0a0a",
              boxShadow: `0 0 18px ${styles.accent}66`,
            }}
            className="hover:opacity-90"
          >
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Opslaan
          </Button>
        </div>
      </div>

      {/* Main */}
      <div className="flex flex-1 min-h-0">
        {/* Left nav */}
        <aside
          className="w-56 shrink-0 overflow-y-auto border-r p-2"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-white/40">
            Secties
          </div>
          {SECTION_DEFS.map((def, idx) => {
            const isActive = idx === activeIdx;
            return (
              <button
                key={def.key}
                onClick={() => setActiveIdx(idx)}
                className="group relative flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-all"
                style={{
                  color: isActive ? "#fff" : "rgba(255,255,255,0.65)",
                  background: isActive ? `${styles.accent}1a` : "transparent",
                }}
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold tabular-nums transition-all"
                  style={{
                    background: isActive ? styles.accent : "rgba(255,255,255,0.08)",
                    color: isActive ? "#0a0a0a" : "rgba(255,255,255,0.7)",
                  }}
                >
                  {idx + 1}
                </span>
                <span className="truncate">{def.label}</span>
                {isActive && (
                  <span
                    className="absolute right-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-l"
                    style={{ background: styles.accent }}
                  />
                )}
              </button>
            );
          })}

          <div className="mt-4 px-2 py-1.5 text-[10px] uppercase tracking-wider text-white/40">
            Thema
          </div>
          <div className="space-y-2 px-2">
            <label className="flex items-center justify-between text-xs text-white/70">
              Accent
              <input
                type="color"
                value={theme.accent}
                onChange={(e) => {
                  setTheme((t) => ({ ...t, accent: e.target.value }));
                  mark();
                }}
                className="h-6 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-white/70">
              Achtergrond
              <input
                type="color"
                value={theme.bg}
                onChange={(e) => {
                  setTheme((t) => ({ ...t, bg: e.target.value }));
                  mark();
                }}
                className="h-6 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
              />
            </label>
          </div>
        </aside>

        {/* Stage */}
        <main className="flex-1 overflow-auto p-6">
          {kind === "quote" && (
            <div className="mb-4 flex items-center gap-2">
              <Input
                value={client}
                onChange={(e) => {
                  setClient(e.target.value);
                  mark();
                }}
                placeholder="Klantnaam"
                className="h-8 w-[260px] border-white/10 bg-white/5 text-white placeholder:text-white/40"
              />
            </div>
          )}

          <SectionStage
            key={active.key}
            section={active}
            accent={styles.accent}
            isCover={active.key === "cover" || active.key === "sfeer-impressie"}
            cover={cover}
            onCoverChange={(url) => {
              setCover(url);
              mark();
            }}
            onChange={(patch) => updateSection(activeIdx, patch)}
          />
        </main>
      </div>
    </div>
  );
}

function SectionStage({
  section,
  accent,
  isCover,
  cover,
  onCoverChange,
  onChange,
}: {
  section: StudioSection;
  accent: string;
  isCover: boolean;
  cover: string | null;
  onCoverChange: (url: string | null) => void;
  onChange: (patch: Partial<StudioSection>) => void;
}) {
  const useCover = isCover && cover;
  return (
    <div
      className="relative mx-auto aspect-[16/10] w-full max-w-5xl overflow-hidden rounded-xl border shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{
        borderColor: "rgba(255,255,255,0.08)",
        background: useCover
          ? `linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.7)), url(${cover}) center/cover`
          : `radial-gradient(circle at 80% 10%, ${accent}1f, transparent 55%), #0d0d0d`,
      }}
    >
      <div className="flex h-full flex-col p-10">
        <div
          className="text-[10px] uppercase tracking-[0.25em]"
          style={{ color: accent }}
        >
          {section.label}
        </div>
        <input
          value={section.heading}
          onChange={(e) => onChange({ heading: e.target.value })}
          className="mt-3 w-full bg-transparent text-4xl font-bold tracking-tight text-white outline-none placeholder:text-white/30 md:text-5xl"
          placeholder="Titel"
          style={{
            textShadow: `0 0 24px ${accent}55`,
          }}
        />
        <textarea
          value={section.body}
          onChange={(e) => onChange({ body: e.target.value })}
          className="mt-6 flex-1 resize-none bg-transparent text-base leading-relaxed text-white/85 outline-none placeholder:text-white/30"
          placeholder="Inhoud van deze sectie…"
        />

        {isCover && (
          <div className="mt-3 flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-white/60" />
            <Input
              value={cover ?? ""}
              onChange={(e) => onCoverChange(e.target.value || null)}
              placeholder="Cover afbeelding URL"
              className="h-8 border-white/10 bg-white/5 text-white placeholder:text-white/40"
            />
          </div>
        )}
      </div>

      {/* Decorative neon accents */}
      <div
        className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full opacity-40 blur-3xl"
        style={{ background: accent }}
      />
    </div>
  );
}

