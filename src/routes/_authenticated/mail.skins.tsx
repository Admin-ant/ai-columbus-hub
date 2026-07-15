import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Palette, Plus, Trash2, Copy, Save, History, RotateCcw, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { sanitizeSkinHtml, sanitizeSkinInput } from "@/lib/skin-sanitize";

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

  const selected = useMemo(() => skins.find((s) => s.id === selectedId) ?? null, [skins, selectedId]);

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

  async function remove(s: Skin) {
    if (!confirm(`Skin "${s.name}" verwijderen?`)) return;
    const { error } = await supabase.from("mail_backgrounds").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    if (selectedId === s.id) setSelectedId(null);
    toast.success("Skin verwijderd");
    await reload();
  }

  const previewBody = `<div style="padding:32px;font-family:system-ui,sans-serif;color:#111;font-size:14px;line-height:1.6">
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
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skins</div>
              <Button size="sm" variant="ghost" onClick={newSkin} className="h-7 gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" /> Nieuw
              </Button>
            </div>
            {loading ? (
              <div className="p-3 text-xs text-muted-foreground">Laden…</div>
            ) : skins.length === 0 ? (
              <div className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
                Nog geen skins. Klik op <strong>Nieuw</strong>.
              </div>
            ) : (
              <ul className="space-y-1">
                {skins.map((s) => (
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
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">{selectedId ? "Skin bewerken" : "Nieuwe skin"}</div>
              <Button size="sm" onClick={save} disabled={saving} className="gap-1">
                <Save className="h-3.5 w-3.5" /> {saving ? "Opslaan…" : "Opslaan"}
              </Button>
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
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">Live preview</div>
              {previewVersion && (
                <Badge variant="outline" className="border-primary/40 bg-primary/10 text-[10px] text-primary">
                  Voorbeeld v{previewVersion.version}
                </Badge>
              )}
            </div>
            <div className="rounded border border-border p-3" style={previewStyle}>
              <div className="mx-auto max-w-[600px] rounded bg-white shadow-sm">
                <div dangerouslySetInnerHTML={{ __html: sanitizeSkinHtml(previewHeader) }} />
                <div dangerouslySetInnerHTML={{ __html: previewBody }} />
                <div dangerouslySetInnerHTML={{ __html: sanitizeSkinHtml(previewFooter) }} />
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
    </div>
  );
}
