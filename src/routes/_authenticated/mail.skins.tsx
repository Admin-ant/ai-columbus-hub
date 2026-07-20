import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Palette, Plus, Trash2, Copy, Save, History, RotateCcw, Eye, Download, Upload, GitCompare, Search, CalendarIcon, X, Monitor, Smartphone, RefreshCw } from "lucide-react";
import { format, isSameDay, parseISO } from "date-fns";
import { nl } from "date-fns/locale/nl";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { sanitizeSkinHtml, sanitizeSkinInput } from "@/lib/skin-sanitize";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/mail/skins")({
  head: () => ({ meta: [{ title: "Mail skins — Beheer" }] }),
  component: MailSkinsPage,
});

type Skin = {
  id: string;
  name: string;
  background_color: string | null;
  background_image_url: string | null;
  header_html: string | null;
  footer_html: string | null;
  updated_at: string;
};

const DEFAULT_HEADER = `<div style="padding:24px;text-align:center;border-bottom:1px solid #e5e7eb">
  <h1 style="margin:0;font-family:system-ui,sans-serif;font-size:20px;color:#111">Jouw bedrijf</h1>
</div>`;
const DEFAULT_FOOTER = `<div style="padding:20px;text-align:center;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb">
  © ${new Date().getFullYear()} Jouw bedrijf · <a href="#" style="color:#6b7280">Uitschrijven</a>
</div>`;

function MailSkinsPage() {
  const { currentOrganizationId, currentOrganization } = useWorkspace();
  const [skins, setSkins] = useState<Skin[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);

  // editor state
  const [name, setName] = useState("");
  const [bgColor, setBgColor] = useState("#f5f5f5");
  const [bgImage, setBgImage] = useState("");
  const [header, setHeader] = useState(DEFAULT_HEADER);
  const [footer, setFooter] = useState(DEFAULT_FOOTER);

  // versions
  type SkinVersion = {
    id: string;
    background_id: string;
    version: number;
    name: string;
    background_color: string | null;
    background_image_url: string | null;
    header_html: string | null;
    footer_html: string | null;
    created_at: string;
  };
  const [versions, setVersions] = useState<SkinVersion[]>([]);
  const [previewVersion, setPreviewVersion] = useState<SkinVersion | null>(null);
  const [diffVersion, setDiffVersion] = useState<SkinVersion | null>(null);

  const selected = useMemo(() => skins.find((s) => s.id === selectedId) ?? null, [skins, selectedId]);

  const filteredSkins = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return skins.filter((s) => {
      const matchesName = !q || s.name.toLowerCase().includes(q);
      const matchesDate = !dateFilter || isSameDay(parseISO(s.updated_at), dateFilter);
      return matchesName && matchesDate;
    });
  }, [skins, searchQuery, dateFilter]);

  async function reload() {
    if (!currentOrganizationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("mail_backgrounds")
      .select("id,name,background_color,background_image_url,header_html,footer_html,updated_at")
      .eq("organization_id", currentOrganizationId)
      .order("name");
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSkins((data ?? []) as Skin[]);
  }

  useEffect(() => {
    void reload();
     
  }, [currentOrganizationId]);

  const loadVersions = useCallback(async (bgId: string | null) => {
    if (!bgId) {
      setVersions([]);
      return;
    }
    const { data, error } = await supabase
      .from("mail_background_versions" as never)
      .select("id,background_id,version,name,background_color,background_image_url,header_html,footer_html,created_at")
      .eq("background_id", bgId)
      .order("version", { ascending: false });
    if (error) {
      setVersions([]);
      return;
    }
    setVersions(((data ?? []) as unknown) as SkinVersion[]);
  }, []);

  useEffect(() => {
    setPreviewVersion(null);
    if (!selected) {
      setVersions([]);
      return;
    }
    setName(selected.name);
    setBgColor(selected.background_color ?? "#f5f5f5");
    setBgImage(selected.background_image_url ?? "");
    setHeader(selected.header_html ?? DEFAULT_HEADER);
    setFooter(selected.footer_html ?? DEFAULT_FOOTER);
    void loadVersions(selected.id);
  }, [selected, loadVersions]);

  function newSkin() {
    setSelectedId(null);
    setPreviewVersion(null);
    setVersions([]);
    setName("Nieuwe skin");
    setBgColor("#f5f5f5");
    setBgImage("");
    setHeader(DEFAULT_HEADER);
    setFooter(DEFAULT_FOOTER);
  }

  function restoreVersion(v: SkinVersion) {
    setName(v.name);
    setBgColor(v.background_color ?? "#f5f5f5");
    setBgImage(v.background_image_url ?? "");
    setHeader(v.header_html ?? DEFAULT_HEADER);
    setFooter(v.footer_html ?? DEFAULT_FOOTER);
    setPreviewVersion(null);
    toast.message(`Versie ${v.version} geladen — klik op Opslaan om te bevestigen`);
  }

  async function save() {
    if (!currentOrganizationId) return;
    let clean;
    try {
      clean = sanitizeSkinInput({
        name,
        background_color: bgColor || null,
        background_image_url: bgImage || null,
        header_html: header || null,
        footer_html: footer || null,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ongeldige invoer");
      return;
    }
    if (bgImage && !clean.background_image_url) {
      toast.error("Achtergrondafbeelding moet een http(s)-URL zijn");
      return;
    }
    if (bgColor && !clean.background_color) {
      toast.error("Achtergrondkleur moet een geldige kleur zijn (bv. #f5f5f5)");
      return;
    }
    setSaving(true);
    const payload = { organization_id: currentOrganizationId, ...clean };
    let targetId = selectedId;
    if (selectedId) {
      const { error } = await supabase.from("mail_backgrounds").update(payload).eq("id", selectedId);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Skin opgeslagen — nieuwe versie aangemaakt");
    } else {
      const { data, error } = await supabase.from("mail_backgrounds").insert(payload).select("id").single();
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Skin aangemaakt");
      setSelectedId(data.id);
      targetId = data.id;
    }
    await reload();
    if (targetId) await loadVersions(targetId);
  }

  async function duplicate(s: Skin) {
    if (!currentOrganizationId) return;
    const { data, error } = await supabase
      .from("mail_backgrounds")
      .insert({
        organization_id: currentOrganizationId,
        name: `${s.name} (kopie)`,
        background_color: s.background_color,
        background_image_url: s.background_image_url,
        header_html: s.header_html,
        footer_html: s.footer_html,
      })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    toast.success("Skin gekopieerd");
    await reload();
    setSelectedId(data.id);
  }

  async function duplicateVersion(v: {
    version: number;
    name: string;
    background_color: string | null;
    background_image_url: string | null;
    header_html: string | null;
    footer_html: string | null;
  }) {
    if (!currentOrganizationId) return;
    let clean;
    try {
      clean = sanitizeSkinInput({
        name: `${v.name} (kopie v${v.version})`,
        background_color: v.background_color,
        background_image_url: v.background_image_url,
        header_html: v.header_html,
        footer_html: v.footer_html,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ongeldige skinversie");
      return;
    }
    const { data, error } = await supabase
      .from("mail_backgrounds")
      .insert({ organization_id: currentOrganizationId, ...clean })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    toast.success(`Versie ${v.version} gedupliceerd als nieuwe skin`);
    setPreviewVersion(null);
    setDiffVersion(null);
    await reload();
    setSelectedId(data.id);
  }



  async function remove(s: Skin) {
    if (!confirm(`Skin "${s.name}" verwijderen?`)) return;
    const { error } = await supabase.from("mail_backgrounds").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    if (selectedId === s.id) setSelectedId(null);
    toast.success("Skin verwijderd");
    await reload();
  }

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const SKIN_EXPORT_VERSION = 1;

  type ExportedSkin = {
    name: string;
    background_color: string | null;
    background_image_url: string | null;
    header_html: string | null;
    footer_html: string | null;
  };

  function skinToExport(s: Pick<Skin, "name" | "background_color" | "background_image_url" | "header_html" | "footer_html">): ExportedSkin {
    return {
      name: s.name,
      background_color: s.background_color,
      background_image_url: s.background_image_url,
      header_html: s.header_html,
      footer_html: s.footer_html,
    };
  }

  function downloadJson(filename: string, payload: unknown) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportSelected() {
    if (!selected) {
      toast.error("Selecteer eerst een skin");
      return;
    }
    downloadJson(`skin-${selected.name.replace(/[^a-z0-9-_]+/gi, "_")}.json`, {
      type: "lovable.mail-skins",
      version: SKIN_EXPORT_VERSION,
      exported_at: new Date().toISOString(),
      skins: [skinToExport(selected)],
    });
    toast.success("Skin geëxporteerd");
  }

  function exportAll() {
    if (skins.length === 0) {
      toast.error("Er zijn geen skins om te exporteren");
      return;
    }
    downloadJson(`skins-export-${new Date().toISOString().slice(0, 10)}.json`, {
      type: "lovable.mail-skins",
      version: SKIN_EXPORT_VERSION,
      exported_at: new Date().toISOString(),
      skins: skins.map(skinToExport),
    });
    toast.success(`${skins.length} skin(s) geëxporteerd`);
  }

  async function handleImportFile(file: File) {
    if (!currentOrganizationId) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast.error("Ongeldig JSON-bestand");
      return;
    }
    const container = parsed as { type?: string; skins?: unknown };
    const rawSkins = Array.isArray(container?.skins)
      ? (container.skins as unknown[])
      : Array.isArray(parsed)
        ? (parsed as unknown[])
        : null;
    if (!rawSkins || rawSkins.length === 0) {
      toast.error("Geen skins gevonden in bestand");
      return;
    }
    if (container?.type && container.type !== "lovable.mail-skins") {
      toast.error("Onbekend exportformaat");
      return;
    }

    const rows: Array<{
      organization_id: string;
      name: string;
      background_color: string | null;
      background_image_url: string | null;
      header_html: string | null;
      footer_html: string | null;
    }> = [];
    const errors: string[] = [];
    for (const raw of rawSkins) {
      const r = raw as Partial<ExportedSkin>;
      try {
        const clean = sanitizeSkinInput({
          name: (r.name ?? "Geïmporteerde skin") + " (import)",
          background_color: r.background_color ?? null,
          background_image_url: r.background_image_url ?? null,
          header_html: r.header_html ?? null,
          footer_html: r.footer_html ?? null,
        });
        rows.push({ organization_id: currentOrganizationId, ...clean });
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "Ongeldige skin overgeslagen");
      }
    }
    if (rows.length === 0) {
      toast.error(errors[0] ?? "Geen geldige skins in bestand");
      return;
    }
    const { error } = await supabase.from("mail_backgrounds").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} skin(s) geïmporteerd${errors.length ? ` (${errors.length} overgeslagen)` : ""}`);
    await reload();
  }

  // Live preview controls
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [sampleSubject, setSampleSubject] = useState("Voorstel voor onze samenwerking");
  const [sampleContact, setSampleContact] = useState("Jan Jansen");
  const [sampleSender, setSampleSender] = useState("Team Columbus");
  const [previewNonce, setPreviewNonce] = useState(0);

  const renderTokens = useCallback(
    (s: string) =>
      s
        .replace(/\{\{\s*contact_name\s*\}\}/g, sampleContact || "")
        .replace(/\{\{\s*sender_name\s*\}\}/g, sampleSender || "")
        .replace(/\{\{\s*subject\s*\}\}/g, sampleSubject || ""),
    [sampleContact, sampleSender, sampleSubject],
  );

  const previewBodyTemplate = `<div style="padding:32px;font-family:system-ui,sans-serif;color:#111;font-size:14px;line-height:1.6">
    <p>Beste {{contact_name}},</p>
    <p>Dit is een voorbeeldbericht dat toont hoe je e-mail eruitziet met deze skin — header en footer worden automatisch toegevoegd.</p>
    <p>Met vriendelijke groet,<br/>{{sender_name}}</p>
  </div>`;


  const previewBg = previewVersion?.background_color ?? bgColor;
  const previewImg = previewVersion?.background_image_url ?? bgImage;
  const previewHeader = previewVersion?.header_html ?? header;
  const previewFooter = previewVersion?.footer_html ?? footer;

  const previewStyle: React.CSSProperties = {
    backgroundColor: previewBg || "#ffffff",
    backgroundImage: previewImg ? `url(${previewImg})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-[1400px] space-y-6 p-4">
        <div>
          <Link to="/mail" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Terug naar Mail
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Palette className="h-6 w-6 text-brand" /> Skinbeheer
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentOrganization?.name ?? ""} — beheer achtergronden, headers en footers die je aan e-mailtemplates en offertes kunt koppelen.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[240px_1fr_1fr_240px]">
          {/* List */}
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skins</div>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Importeer skins uit JSON"
                  className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Upload className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={exportAll}
                  title="Exporteer alle skins"
                  disabled={skins.length === 0}
                  className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                <Button size="sm" variant="ghost" onClick={newSkin} className="h-7 gap-1 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Nieuw
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportFile(f);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="mb-2 space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Zoek op naam…"
                  className="h-8 pl-7 text-xs"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 justify-start text-xs text-muted-foreground"
                    >
                      <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                      {dateFilter ? format(dateFilter, "d MMMM yyyy", { locale: nl }) : "Filter op datum"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateFilter}
                      onSelect={setDateFilter}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                {(searchQuery || dateFilter) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => {
                      setSearchQuery("");
                      setDateFilter(undefined);
                    }}
                    title="Wis filters"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {filteredSkins.length} {filteredSkins.length === 1 ? "skin" : "skins"} gevonden
              </div>
            </div>

            {loading ? (
              <div className="p-3 text-xs text-muted-foreground">Laden…</div>
            ) : filteredSkins.length === 0 ? (
              <div className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
                {searchQuery || dateFilter ? "Geen skins gevonden voor deze filters." : <>Nog geen skins. Klik op <strong>Nieuw</strong>.</>}
              </div>
            ) : (
              <ul className="space-y-1">
                {filteredSkins.map((s) => (
                  <li key={s.id}>
                    <div
                      className={`group flex items-center justify-between rounded px-2 py-1.5 text-sm ${
                        selectedId === s.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                      }`}
                    >
                      <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setSelectedId(s.id)}>
                        {s.name}
                      </button>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => duplicate(s)}
                          className="rounded p-1 hover:bg-background"
                          title="Dupliceer"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(s)}
                          className="rounded p-1 text-destructive hover:bg-background"
                          title="Verwijder"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Editor */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">{selectedId ? "Skin bewerken" : "Nieuwe skin"}</div>
              <div className="flex items-center gap-1.5">
                {selected && (
                  <Button size="sm" variant="outline" onClick={exportSelected} className="h-8 gap-1">
                    <Download className="h-3.5 w-3.5" /> Exporteer
                  </Button>
                )}
                <Button size="sm" onClick={save} disabled={saving} className="gap-1">
                  <Save className="h-3.5 w-3.5" /> {saving ? "Opslaan…" : "Opslaan"}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Naam</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="bv. Standaard bedrijfsstijl" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Achtergrondkleur</Label>
                  <div className="flex gap-2">
                    <Input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-9 w-14 p-1" />
                    <Input value={bgColor} onChange={(e) => setBgColor(e.target.value)} placeholder="#f5f5f5" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Achtergrondafbeelding (URL)</Label>
                  <Input value={bgImage} onChange={(e) => setBgImage(e.target.value)} placeholder="https://…" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Header HTML</Label>
                <Textarea value={header} onChange={(e) => setHeader(e.target.value)} rows={6} className="font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs">Footer HTML</Label>
                <Textarea value={footer} onChange={(e) => setFooter(e.target.value)} rows={6} className="font-mono text-xs" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tip: variabelen als <code>{"{{contact_name}}"}</code> en <code>{"{{sender_name}}"}</code> worden vervangen door
                echte waarden bij verzenden. Koppel een skin aan een template via <em>Mail templates</em> of aan een offerte via
                de <em>Offerte Studio</em>.
              </p>
            </div>
          </div>

          {/* Live preview */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold">Live preview</div>
                {previewVersion && (
                  <Badge variant="outline" className="border-primary/40 bg-primary/10 text-[10px] text-primary">
                    Voorbeeld v{previewVersion.version}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <div className="flex items-center rounded-md border border-border bg-background p-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewDevice("desktop")}
                    className={`inline-flex h-6 items-center gap-1 rounded px-2 text-[10px] font-medium transition ${previewDevice === "desktop" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    title="Desktop weergave"
                  >
                    <Monitor className="h-3 w-3" /> Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDevice("mobile")}
                    className={`inline-flex h-6 items-center gap-1 rounded px-2 text-[10px] font-medium transition ${previewDevice === "mobile" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    title="Mobiele weergave"
                  >
                    <Smartphone className="h-3 w-3" /> Mobiel
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewNonce((n) => n + 1)}
                  className="inline-flex h-7 items-center gap-1 rounded border border-border bg-background px-2 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Vernieuw preview"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 rounded-md border border-dashed border-border bg-muted/30 p-2 sm:grid-cols-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Onderwerp</Label>
                <Input value={sampleSubject} onChange={(e) => setSampleSubject(e.target.value)} className="h-7 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Contact</Label>
                <Input value={sampleContact} onChange={(e) => setSampleContact(e.target.value)} className="h-7 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Afzender</Label>
                <Input value={sampleSender} onChange={(e) => setSampleSender(e.target.value)} className="h-7 text-xs" />
              </div>
            </div>

            <div className="rounded border border-border p-3" style={previewStyle}>
              <div
                key={previewNonce}
                className="mx-auto overflow-hidden rounded bg-white shadow-sm transition-all"
                style={{ maxWidth: previewDevice === "mobile" ? 360 : 600, width: "100%" }}
              >
                <div className="border-b border-border/60 bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
                  <div className="truncate"><span className="font-medium text-foreground">Aan:</span> {sampleContact || "—"}</div>
                  <div className="truncate"><span className="font-medium text-foreground">Onderwerp:</span> {renderTokens(sampleSubject) || "—"}</div>
                </div>
                <div dangerouslySetInnerHTML={{ __html: sanitizeSkinHtml(renderTokens(previewHeader)) }} />
                <div dangerouslySetInnerHTML={{ __html: renderTokens(previewBodyTemplate) }} />
                <div dangerouslySetInnerHTML={{ __html: sanitizeSkinHtml(renderTokens(previewFooter)) }} />
              </div>
            </div>
          </div>


          {/* Version history */}
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <History className="h-3.5 w-3.5" /> Versies
            </div>
            {!selectedId ? (
              <div className="rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                Selecteer een skin
              </div>
            ) : versions.length === 0 ? (
              <div className="rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                Nog geen versies
              </div>
            ) : (
              <div className="space-y-1 max-h-[70vh] overflow-y-auto pr-1">
                {versions.map((v, idx) => {
                  const isCurrent = idx === 0;
                  const isPreviewing = previewVersion?.id === v.id;
                  return (
                    <div
                      key={v.id}
                      className={`rounded-md border p-2 transition ${
                        isPreviewing
                          ? "border-primary/50 bg-accent text-accent-foreground"
                          : "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1.5 ${
                            isCurrent
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          v{v.version}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(v.created_at).toLocaleString("nl-NL", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[11px] text-muted-foreground">{v.name}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => setPreviewVersion(isPreviewing ? null : v)}
                          className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-accent"
                        >
                          <Eye className="h-2.5 w-2.5" />
                          {isPreviewing ? "Sluit" : "Preview"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDiffVersion(v)}
                          className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-accent"
                          title="Vergelijk met huidige"
                        >
                          <GitCompare className="h-2.5 w-2.5" /> Diff
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicateVersion(v)}
                          className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-accent"
                          title="Dupliceer als nieuwe skin"
                        >
                          <Copy className="h-2.5 w-2.5" /> Dupliceer
                        </button>
                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => restoreVersion(v)}
                            className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/15"
                          >
                            <RotateCcw className="h-2.5 w-2.5" /> Herstel
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <SkinDiffDialog
        version={diffVersion}
        current={selected}
        editor={{
          name,
          background_color: bgColor || null,
          background_image_url: bgImage || null,
          header_html: header || null,
          footer_html: footer || null,
        }}
        onClose={() => setDiffVersion(null)}
        onRestore={(v) => {
          restoreVersion(v as SkinVersion);
          setDiffVersion(null);
        }}
        onDuplicate={duplicateVersion}
      />
    </div>
  );
}

// ---- Diff helpers ----
type DiffOp = { kind: "eq" | "add" | "del"; text: string };

function diffLines(a: string, b: string): DiffOp[] {
  const A = a.split("\n");
  const B = b.split("\n");
  const n = A.length;
  const m = B.length;
  // LCS DP
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ kind: "eq", text: A[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "del", text: A[i++] });
    } else {
      out.push({ kind: "add", text: B[j++] });
    }
  }
  while (i < n) out.push({ kind: "del", text: A[i++] });
  while (j < m) out.push({ kind: "add", text: B[j++] });
  return out;
}

type SkinFields = {
  name: string;
  background_color: string | null;
  background_image_url: string | null;
  header_html: string | null;
  footer_html: string | null;
};

function SkinDiffDialog({
  version,
  current,
  editor,
  onClose,
  onRestore,
  onDuplicate,
}: {
  version: SkinVersionLike | null;
  current: { name: string } | null;
  editor: SkinFields;
  onClose: () => void;
  onRestore: (v: SkinVersionLike) => void;
  onDuplicate: (v: SkinVersionLike) => void;
}) {
  const open = !!version;
  const fields: Array<{ key: keyof SkinFields; label: string; mono?: boolean }> = [
    { key: "name", label: "Naam" },
    { key: "background_color", label: "Achtergrondkleur" },
    { key: "background_image_url", label: "Achtergrondafbeelding" },
    { key: "header_html", label: "Header HTML", mono: true },
    { key: "footer_html", label: "Footer HTML", mono: true },
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-4 w-4" />
            Verschillen — v{version?.version} vs. huidige
          </DialogTitle>
          <DialogDescription>
            Rood = staat in v{version?.version}, groen = staat in de huidige versie {current ? `("${current.name}")` : ""}.
          </DialogDescription>
        </DialogHeader>
        {version && (
          <div className="space-y-4">
            {fields.map((f) => {
              const oldVal = String(version[f.key] ?? "");
              const newVal = String(editor[f.key] ?? "");
              const unchanged = oldVal === newVal;
              return (
                <div key={f.key} className="rounded-md border border-border">
                  <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5">
                    <div className="text-xs font-semibold">{f.label}</div>
                    {unchanged ? (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">Ongewijzigd</Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400">
                        Gewijzigd
                      </Badge>
                    )}
                  </div>
                  {!unchanged && (
                    <pre className={`m-0 max-h-64 overflow-auto p-0 text-[11px] ${f.mono ? "font-mono" : ""}`}>
                      {diffLines(oldVal, newVal).map((op, i) => (
                        <div
                          key={i}
                          className={`whitespace-pre-wrap break-words px-3 py-0.5 ${
                            op.kind === "add"
                              ? "bg-green-500/10 text-green-700 dark:text-green-300"
                              : op.kind === "del"
                                ? "bg-red-500/10 text-red-700 dark:text-red-300"
                                : "text-muted-foreground"
                          }`}
                        >
                          <span className="mr-2 select-none opacity-60">
                            {op.kind === "add" ? "+" : op.kind === "del" ? "−" : " "}
                          </span>
                          {op.text || " "}
                        </div>
                      ))}
                    </pre>
                  )}
                </div>
              );
            })}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={onClose}>Sluiten</Button>
              <Button size="sm" variant="outline" onClick={() => { onDuplicate(version); onClose(); }} className="gap-1">
                <Copy className="h-3.5 w-3.5" /> Dupliceer als nieuwe skin
              </Button>
              <Button size="sm" onClick={() => onRestore(version)} className="gap-1">
                <RotateCcw className="h-3.5 w-3.5" /> Herstel v{version.version}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type SkinVersionLike = {
  id: string;
  version: number;
  name: string;
  background_color: string | null;
  background_image_url: string | null;
  header_html: string | null;
  footer_html: string | null;
};

