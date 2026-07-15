import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Mail,
  Linkedin,
  Phone,
  Clock,
  Eye,
  Save,
  BookmarkPlus,
  FolderOpen,
  AlertTriangle,
  Download,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  loadTemplates,
  saveTemplate,
  deleteTemplate,
  validateSequence,
  downloadTemplatesJson,
  importTemplatesFromJson,
  type SequenceTemplate,
} from "@/lib/sequence-workflow";

export type SequenceStep = {
  day: number;
  channel: "email" | "linkedin" | "cold-call" | "wait";
  subject?: string;
  body: string;
  condition?: "if_no_reply" | "if_opened" | "if_clicked" | "always";
  stop_on_reply?: boolean;
};

const CHANNEL_ICONS = {
  email: Mail,
  linkedin: Linkedin,
  "cold-call": Phone,
  wait: Clock,
};

const TOKENS = ["{{contact_name}}", "{{company}}"];

type Props = {
  campaignId: string;
  initialSteps: SequenceStep[];
  onSaved: (steps: SequenceStep[]) => void;
};

export function SequenceBuilder({ campaignId, initialSteps, onSaved }: Props) {
  const [steps, setSteps] = useState<SequenceStep[]>(
    initialSteps.length > 0
      ? initialSteps.map((s) => ({
          condition: "if_no_reply",
          stop_on_reply: true,
          ...s,
        }))
      : [
          {
            day: 1,
            channel: "email",
            subject: "Even kort, {{company}}",
            body: "Hi {{contact_name}},\n\n",
            condition: "if_no_reply",
            stop_on_reply: true,
          },
        ],
  );
  const [activeStep, setActiveStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<SequenceTemplate[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const exportTemplates = () => {
    if (templates.length === 0) {
      toast.error("Er zijn nog geen templates om te exporteren");
      return;
    }
    downloadTemplatesJson(templates);
    toast.success(`${templates.length} template(s) geëxporteerd als JSON`);
  };

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const imported = await importTemplatesFromJson(text);
      setTemplates(await loadTemplates());
      toast.success(`${imported.length} template(s) geïmporteerd`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import mislukt");
    }
  };

  useEffect(() => {
    void loadTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  const issues = useMemo(() => validateSequence(steps), [steps]);
  const hasIssues = issues.length > 0;

  const updateStep = (i: number, patch: Partial<SequenceStep>) =>
    setSteps((cur) => cur.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    setSteps((cur) => {
      const c = [...cur];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    setActiveStep(j);
  };

  const addStep = () => {
    const last = steps[steps.length - 1];
    const newStep: SequenceStep = {
      day: (last?.day ?? 0) + 3,
      channel: "email",
      subject: "Follow-up",
      body: "Hi {{contact_name}},\n\nNog even ter herinnering — ",
      condition: "if_no_reply",
      stop_on_reply: true,
    };
    setSteps((cur) => [...cur, newStep]);
    setActiveStep(steps.length);
  };

  const removeStep = (i: number) => {
    if (steps.length <= 1) {
      toast.error("Je moet minimaal 1 stap behouden");
      return;
    }
    setSteps((cur) => cur.filter((_, idx) => idx !== i));
    setActiveStep(Math.max(0, i - 1));
  };

  const insertToken = (token: string) => {
    const s = steps[activeStep];
    updateStep(activeStep, { body: (s.body ?? "") + token });
  };

  const save = async () => {
    if (hasIssues) {
      toast.error(issues[0].message);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("outreach_campaigns")
      .update({ sequence_steps: steps as never })
      .eq("id", campaignId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Sequence opgeslagen");
    onSaved(steps);
  };

  const saveAsTemplate = async () => {
    const name = window.prompt("Naam voor deze workflow-template?");
    if (!name?.trim()) return;
    try {
      const tpl = await saveTemplate(name.trim(), steps);
      setTemplates(await loadTemplates());
      toast.success(`Opgeslagen als template: ${tpl.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  };

  const loadFromTemplate = (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setSteps(tpl.steps);
    setActiveStep(0);
    toast.success(`Geladen: ${tpl.name}`);
  };

  const removeTemplate = async (id: string) => {
    try {
      setTemplates(await deleteTemplate(id));
      toast.success("Template verwijderd");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
  };


  const current = steps[activeStep];
  const sampleVars = { contact_name: "Sanne", company: "Voorbeeld BV" };
  const renderPreview = (text: string) =>
    text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => sampleVars[k as keyof typeof sampleVars] ?? `{{${k}}}`);

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr_280px]">
      {/* Steps list */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stappen</div>
        <div className="space-y-1.5">
          {steps.map((s, i) => {
            const Icon = CHANNEL_ICONS[s.channel];
            const isActive = i === activeStep;
            return (
              <div
                key={i}
                className={`group rounded-md border p-2.5 cursor-pointer transition ${
                  isActive
                    ? "border-brand/60 bg-brand/10"
                    : "border-border bg-muted/50 hover:bg-muted"
                }`}
                onClick={() => setActiveStep(i)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground">Stap {i + 1}</span>
                    <Badge variant="outline" className="text-[9px] border-border text-muted-foreground px-1.5 py-0">
                      d{s.day}
                    </Badge>
                  </div>
                  <div className="flex opacity-0 group-hover:opacity-100">
                    <button
                      type="button"
                      className="rounded p-1 hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveStep(i, -1);
                      }}
                      disabled={i === 0}
                    >
                      <ArrowUp className="h-3 w-3 text-muted-foreground" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveStep(i, 1);
                      }}
                      disabled={i === steps.length - 1}
                    >
                      <ArrowDown className="h-3 w-3 text-muted-foreground" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 hover:bg-rose-500/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeStep(i);
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-rose-400" />
                    </button>
                  </div>
                </div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">
                  {s.channel === "wait" ? "⏱ wachten" : s.subject || "—"}
                </div>
              </div>
            );
          })}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full border-border text-foreground hover:bg-muted"
          onClick={addStep}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Stap toevoegen
        </Button>
      </div>

      {/* Editor */}
      <div className="space-y-3">
        {current && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground">Dag</Label>
                <Input
                  type="number"
                  min={0}
                  value={current.day}
                  onChange={(e) => updateStep(activeStep, { day: Number(e.target.value) || 0 })}
                  className="bg-muted/50 border-border text-foreground"
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Kanaal</Label>
                <Select
                  value={current.channel}
                  onValueChange={(v) => updateStep(activeStep, { channel: v as SequenceStep["channel"] })}
                >
                  <SelectTrigger className="bg-muted/50 border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="cold-call">Cold call</SelectItem>
                    <SelectItem value="wait">Wachten</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Conditie</Label>
                <Select
                  value={current.condition ?? "if_no_reply"}
                  onValueChange={(v) => updateStep(activeStep, { condition: v as SequenceStep["condition"] })}
                >
                  <SelectTrigger className="bg-muted/50 border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="if_no_reply">Als geen reactie</SelectItem>
                    <SelectItem value="if_opened">Als geopend</SelectItem>
                    <SelectItem value="if_clicked">Als geklikt</SelectItem>
                    <SelectItem value="always">Altijd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {current.channel !== "wait" && (
              <>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Onderwerp</Label>
                  <Input
                    value={current.subject ?? ""}
                    onChange={(e) => updateStep(activeStep, { subject: e.target.value })}
                    placeholder="Even kort, {{company}}"
                    className="bg-muted/50 border-border text-foreground"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] text-muted-foreground">Body</Label>
                    <div className="flex gap-1">
                      {TOKENS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => insertToken(t)}
                          className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    value={current.body}
                    onChange={(e) => updateStep(activeStep, { body: e.target.value })}
                    rows={10}
                    className="bg-muted/50 border-border text-foreground font-mono text-xs"
                  />
                </div>
              </>
            )}

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={current.stop_on_reply ?? true}
                onChange={(e) => updateStep(activeStep, { stop_on_reply: e.target.checked })}
                className="rounded border-border bg-muted/50"
              />
              Stop sequence zodra prospect reageert
            </label>
          </>
        )}
        {hasIssues && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-100">
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" /> Nog niet klaar om te starten
            </div>
            <ul className="ml-4 list-disc space-y-0.5">
              {issues.slice(0, 4).map((iss, k) => (
                <li key={k}>{iss.message}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {templates.length > 0 && (
            <Select onValueChange={loadFromTemplate}>
              <SelectTrigger className="h-8 w-[220px] border-border bg-muted/50 text-xs text-foreground">
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                <SelectValue placeholder="Template laden…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <div className="flex w-full items-center justify-between gap-4">
                      <span>{t.name}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          removeTemplate(t.id);
                        }}
                        className="text-[10px] text-rose-400 hover:underline"
                      >
                        verwijder
                      </button>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={exportTemplates}
            className="border-border text-foreground hover:bg-muted"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Exporteer JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="border-border text-foreground hover:bg-muted"
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Importeer JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={saveAsTemplate}
            className="border-border text-foreground hover:bg-muted"
          >
            <BookmarkPlus className="mr-1.5 h-3.5 w-3.5" /> Opslaan als template
          </Button>
          <Button
            onClick={save}
            disabled={saving || hasIssues}
            className="bg-brand hover:bg-brand/90 text-brand-foreground"
          >
            <Save className="mr-2 h-4 w-4" /> {saving ? "Opslaan..." : "Sequence opslaan"}
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Eye className="h-3.5 w-3.5" />
          Preview
        </div>
        {current && current.channel !== "wait" ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-foreground">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Onderwerp</div>
            <div className="mb-3 font-medium text-foreground">{renderPreview(current.subject ?? "")}</div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Body</div>
            <div className="whitespace-pre-wrap text-foreground/85">{renderPreview(current.body ?? "")}</div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Wachtstap — geen content
          </div>
        )}
        <div className="text-[10px] text-muted-foreground">
          Voorbeeld met <code className="text-muted-foreground">contact_name=Sanne</code>,{" "}
          <code className="text-muted-foreground">company=Voorbeeld BV</code>
        </div>
      </div>
    </div>
  );
}
