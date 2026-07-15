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
    if (!name.trim()) {
      toast.error("Geef de skin een naam");
      return;
    }
    setSaving(true);
    const payload = {
      organization_id: currentOrganizationId,
      name: name.trim(),
      background_color: bgColor || null,
      background_image_url: bgImage.trim() || null,
      header_html: header || null,
      footer_html: footer || null,
    };
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

  const previewStyle: React.CSSProperties = {
    backgroundColor: bgColor || "#ffffff",
    backgroundImage: bgImage ? `url(${bgImage})` : undefined,
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

        <div className="grid gap-4 lg:grid-cols-[260px_1fr_1fr]">
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
            <div className="mb-3 text-sm font-semibold">Live preview</div>
            <div className="rounded border border-border p-3" style={previewStyle}>
              <div className="mx-auto max-w-[600px] rounded bg-white shadow-sm">
                <div dangerouslySetInnerHTML={{ __html: header }} />
                <div dangerouslySetInnerHTML={{ __html: previewBody }} />
                <div dangerouslySetInnerHTML={{ __html: footer }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
