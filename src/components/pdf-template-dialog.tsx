import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Settings2, Upload, X, Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import {
  clearTemplate,
  DEFAULT_TEMPLATE,
  fileToDataUrl,
  loadTemplate,
  saveTemplate,
  THEMES,
  type PdfTemplate,
  type PdfTheme,
  type TemplateScope,
} from "@/lib/pdf-template";

interface Props {
  orgId: string;
  onChange?: (tpl: PdfTemplate) => void;
  /** Optional builder for live preview. Receives current template, returns a blob URL (PDF). */
  buildPreviewUrl?: (tpl: PdfTemplate) => string | null;
}

export function PdfTemplateDialog({ orgId, onChange, buildPreviewUrl }: Props) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [open, setOpen] = useState(false);
  const [tpl, setTpl] = useState<PdfTemplate>(DEFAULT_TEMPLATE);
  const [scope, setScope] = useState<TemplateScope>("user");
  const [showPreview, setShowPreview] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) setTpl(loadTemplate(orgId, userId));
  }, [open, orgId, userId]);

  // Live preview: debounce regeneration on tpl changes.
  useEffect(() => {
    if (!open || !showPreview || !buildPreviewUrl) return;
    const handle = setTimeout(() => {
      try {
        const url = buildPreviewUrl(tpl);
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = url;
        setPreviewUrl(url);
      } catch {
        setPreviewUrl(null);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [open, showPreview, tpl, buildPreviewUrl]);

  useEffect(() => {
    return () => {
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    };
  }, []);

  const canPreview = useMemo(() => Boolean(buildPreviewUrl), [buildPreviewUrl]);

  function patch<K extends keyof PdfTemplate>(key: K, value: PdfTemplate[K]) {
    setTpl((p) => ({ ...p, [key]: value }));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 500_000) {
      alert("Logo te groot (max 500 KB).");
      return;
    }
    const data = await fileToDataUrl(f);
    patch("logoDataUrl", data);
  }

  const save = useCallback(() => {
    const id = scope === "user" ? userId : orgId;
    if (!id) return;
    saveTemplate(scope, id, tpl);
    onChange?.(tpl);
    setOpen(false);
  }, [scope, userId, orgId, tpl, onChange]);

  function resetScope() {
    const id = scope === "user" ? userId : orgId;
    if (!id) return;
    clearTemplate(scope, id);
    setTpl(loadTemplate(orgId, userId));
  }

  const wide = canPreview && showPreview;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="mr-1.5 h-4 w-4" /> Template
        </Button>
      </DialogTrigger>
      <DialogContent className={wide ? "max-w-5xl" : "max-w-md"}>
        <DialogHeader>
          <DialogTitle>PDF-template</DialogTitle>
          <DialogDescription>
            Pas logo, titel, paginanummering en kleurthema aan. Sla op als jouw standaard of als organisatie­standaard.
          </DialogDescription>
        </DialogHeader>

        <div className={wide ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-5" : ""}>
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-md border p-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Standaard voor</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as TemplateScope)}>
                <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user" disabled={!userId}>Alleen voor mij</SelectItem>
                  <SelectItem value="org">Voor hele organisatie</SelectItem>
                </SelectContent>
              </Select>
              {canPreview && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPreview((v) => !v)}
                  title={showPreview ? "Preview verbergen" : "Preview tonen"}
                >
                  {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-title">Titel</Label>
              <Input
                id="tpl-title"
                value={tpl.title}
                onChange={(e) => patch("title", e.target.value)}
                placeholder="Journaalpost"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-footer">Voettekst (optioneel)</Label>
              <Input
                id="tpl-footer"
                value={tpl.footerText}
                onChange={(e) => patch("footerText", e.target.value)}
                placeholder="bv. Lovebal B.V. — KvK 12345678"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Kleurthema</Label>
              <Select value={tpl.theme} onValueChange={(v) => patch("theme", v as PdfTheme)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(THEMES).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-sm"
                          style={{ background: `rgb(${val.head.join(",")})` }}
                        />
                        {val.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <Label htmlFor="tpl-pages" className="text-sm">Paginanummering</Label>
                <p className="text-xs text-muted-foreground">Voetregel met "Pagina x van y".</p>
              </div>
              <Switch
                id="tpl-pages"
                checked={tpl.showPageNumbers}
                onCheckedChange={(v) => patch("showPageNumbers", v)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                  {tpl.logoDataUrl ? (
                    <img src={tpl.logoDataUrl} alt="logo" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">geen</span>
                  )}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted">
                  <Upload className="h-3.5 w-3.5" /> Upload
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onFile} />
                </label>
                {tpl.logoDataUrl && (
                  <Button variant="ghost" size="icon" onClick={() => patch("logoDataUrl", null)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PNG of JPG, max 500 KB.</p>
            </div>
          </div>

          {wide && (
            <div className="flex flex-col rounded-md border bg-muted/20">
              <div className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Live preview
              </div>
              <div className="flex-1 min-h-[520px]">
                {previewUrl ? (
                  <iframe
                    key={previewUrl}
                    src={previewUrl}
                    title="PDF preview"
                    className="h-full w-full rounded-b-md"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Preview wordt geladen…
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={resetScope}>
            Wissen ({scope === "user" ? "mij" : "org"})
          </Button>
          <Button type="button" onClick={save} disabled={scope === "user" && !userId}>
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
