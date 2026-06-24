import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, FileText, Sparkles, Link2, Wand2, HelpCircle, AlertTriangle, MoreHorizontal, Download, RefreshCw, Ban, RotateCcw, Settings2, CheckCircle2, Send, MessageSquare } from "lucide-react";
import { QuoteCommentsDialog } from "@/components/quote-comments-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { buildDefaultSections, DEFAULT_THEME, type StudioSection, type StudioTheme, type StudioPackage } from "@/lib/offerte-studio";
import { revokeQuoteLink, restoreQuoteLink, regenerateQuoteToken, updateQuoteSettings, markQuoteSent } from "@/lib/quote-admin.functions";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { AIAssistantPanel } from "@/components/ai-assistant-panel";


export const Route = createFileRoute("/_authenticated/quotes")({
  head: () => ({ meta: [{ title: "Offertes" }] }),
  component: QuotesPage,
});

type Quote = Database["public"]["Tables"]["quotes"]["Row"];
type QuoteStatus = Database["public"]["Enums"]["quote_status"];

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

const STATUS: QuoteStatus[] = ["draft", "sent", "viewed", "signed", "approved_paid", "declined"];

const STATUS_COLOR: Record<QuoteStatus, string> = {
  draft: "bg-muted text-foreground",
  sent: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  viewed: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  signed: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved_paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  declined: "bg-red-500/15 text-red-700 dark:text-red-300",
};

function QuotesPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { currentOrganizationId, currentOrganization, loading: wsLoading } = useWorkspace();
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  type TemplateRow = {
    id: string;
    name: string;
    description: string | null;
    cover_image_url: string | null;
    theme: StudioTheme;
    sections: StudioSection[];
    packages: StudioPackage[];
  };
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [lines, setLines] = useState<LineItem[]>([{ description: "", quantity: 1, unit_price: 0 }]);
  type QuoteExt = Quote & {
    public_token: string;
    accepted_at: string | null;
    accepted_by_name: string | null;
    signed_at: string | null;
    revoked_at: string | null;
    sent_at: string | null;
    last_viewed_at: string | null;
    intro_video_url: string | null;
    intro_message: string | null;
    notify_email: string | null;
    client_email: string | null;
    followup_enabled: boolean;
    followup_after_days: number;
  };
  const [settingsQuote, setSettingsQuote] = useState<QuoteExt | null>(null);
  const [commentsQuote, setCommentsQuote] = useState<QuoteExt | null>(null);
  const revokeFn = useServerFn(revokeQuoteLink);
  const restoreFn = useServerFn(restoreQuoteLink);
  const regenFn = useServerFn(regenerateQuoteToken);
  const updateSettingsFn = useServerFn(updateQuoteSettings);
  const markSentFn = useServerFn(markQuoteSent);

  const eur = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en-IE" : "nl-NL", {
        style: "currency",
        currency: "EUR",
      }),
    [i18n.resolvedLanguage],
  );

  const total = useMemo(
    () => lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0),
    [lines],
  );

  async function load() {
    if (!currentOrganizationId) {
      setQuotes([]);
      setClients([]);
      setTemplates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data, error }, { data: cs }, { data: tpls }] = await Promise.all([
      supabase.from("quotes").select("*").eq("organization_id", currentOrganizationId).order("created_at", { ascending: false }),
      supabase.from("clients").select("id,name").eq("organization_id", currentOrganizationId).order("name"),
      supabase.from("quote_templates").select("id,name,description,cover_image_url,theme,sections,packages").eq("organization_id", currentOrganizationId).order("name"),
    ]);
    if (error) toast.error(error.message);
    setQuotes((data ?? []) as Quote[]);
    setClients((cs ?? []) as { id: string; name: string }[]);
    const rows: TemplateRow[] = (tpls ?? []).map((r) => {
      const x = r as unknown as Record<string, unknown>;
      return {
        id: String(x.id),
        name: String(x.name),
        description: (x.description as string | null) ?? null,
        cover_image_url: (x.cover_image_url as string | null) ?? null,
        theme: (x.theme as StudioTheme) ?? DEFAULT_THEME,
        sections: Array.isArray(x.sections) ? (x.sections as StudioSection[]) : [],
        packages: Array.isArray(x.packages) ? (x.packages as StudioPackage[]) : [],
      };
    });
    setTemplates(rows);
    setLoading(false);
  }

  useEffect(() => {
    if (!wsLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganizationId, wsLoading]);

  async function createQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error(t("quotes.title_required"));
    if (!currentOrganizationId) return toast.error(t("leads.no_organization"));
    setSaving(true);

    // If a Studio template is selected → create a studio_quote and open editor
    if (templateId) {
      const tpl = templates.find((x) => x.id === templateId);
      const sections = (tpl?.sections && tpl.sections.length > 0 ? tpl.sections : buildDefaultSections());
      const theme = (tpl?.theme ?? DEFAULT_THEME);
      // Safe fallback: ook zonder packages wordt de offerte aangemaakt
      const packages = (tpl?.packages ?? []);
      const cover = tpl?.cover_image_url ?? null;
      const clientName = clientId ? clients.find((c) => c.id === clientId)?.name ?? null : null;
      const { data: row, error: insErr } = await supabase
        .from("studio_quotes")
        .insert({
          organization_id: currentOrganizationId,
          template_id: templateId,
          title: title.trim(),
          client_name: clientName,
          cover_image_url: cover,
          theme: theme as never,
          sections: sections as never,
          packages: packages as never,
          status: "draft",
          created_by: user?.id ?? null,
        } as never)
        .select("id")
        .single();
      setSaving(false);
      if (insErr || !row) return toast.error(insErr?.message ?? "Aanmaken mislukt");
      toast.success("Studio-offerte aangemaakt");
      setOpen(false);
      setTitle(""); setClientId(""); setTemplateId("");
      navigate({ to: "/offerte-studio/q/$id", params: { id: row.id } });
      return;
    }

    const { error } = await supabase.from("quotes").insert({
      organization_id: currentOrganizationId,
      title: title.trim(),
      content_json: { lines } as never,
      total_amount: total,
      status: "draft",
      created_by: user?.id ?? null,
      client_id: clientId || null,
    } as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("quotes.created"));
    setOpen(false);
    setTitle("");
    setClientId("");
    setLines([{ description: "", quantity: 1, unit_price: 0 }]);
    load();
  }



  async function updateStatus(id: string, status: QuoteStatus) {
    const prev = quotes;
    setQuotes((qs) => qs.map((q) => (q.id === id ? { ...q, status } : q)));
    const { error } = await supabase.from("quotes").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      setQuotes(prev);
    }
  }

  async function convertToInvoice(q: Quote) {
    if (!currentOrganizationId) return;
    const { data: numData, error: numErr } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: string | null; error: { message: string } | null }>)(
      "next_invoice_number",
      { org_id: currentOrganizationId },
    );
    if (numErr || !numData) return toast.error(numErr?.message ?? "RPC error");
    const due = new Date();
    due.setDate(due.getDate() + 30);
    const qAny = q as Quote & { client_id?: string | null };
    let cName: string | null = null;
    if (qAny.client_id) {
      cName = clients.find((c) => c.id === qAny.client_id)?.name ?? null;
    }
    const { error } = await supabase.from("invoices").insert({
      organization_id: currentOrganizationId,
      quote_id: q.id,
      invoice_number: String(numData),
      amount: q.total_amount,
      status: "draft",
      due_date: due.toISOString().slice(0, 10),
      client_id: qAny.client_id ?? null,
      client_name: cName,
    } as never);
    if (error) return toast.error(error.message);
    toast.success(t("invoices.created", { number: String(numData) }));
  }


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {currentOrganization?.name ?? ""} — {t("quotes.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("quotes.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAiOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4" />
            {t("ai_assistant.title")}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("quotes.new_quote")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("quotes.new_quote")}</DialogTitle>
                <DialogDescription>{currentOrganization?.name}</DialogDescription>
              </DialogHeader>
              <form onSubmit={createQuote} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Studio-template (optioneel)</Label>
                  <Select value={templateId || "__none"} onValueChange={(v) => setTemplateId(v === "__none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder={templates.length === 0 ? "Nog geen templates — maak er een in Offerte Studio" : "Eenvoudige offerte (regels)"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Eenvoudige offerte (regels)</SelectItem>
                      {templates.map((tpl) => (
                        <SelectItem key={tpl.id} value={tpl.id}>
                          <Wand2 className="inline mr-1 h-3.5 w-3.5" />{tpl.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {templateId && (() => {
                    const tpl = templates.find((x) => x.id === templateId);
                    if (!tpl) return null;
                    const eurFmt = (n: number) => eur.format(n);
                    return (
                      <div
                        className="mt-2 rounded-lg border overflow-hidden"
                        style={{ background: tpl.theme?.bg ?? "#0a0a0a", color: tpl.theme?.fg ?? "#fff" }}
                      >
                        <div
                          className="px-4 py-3 text-xs font-semibold tracking-wide uppercase"
                          style={{ background: tpl.theme?.accent ?? "#ff2bd6", color: "#000" }}
                        >
                          Preview · {tpl.name}
                        </div>
                        <div className="p-4 space-y-3">
                          {tpl.description && (
                            <p className="text-sm opacity-80">{tpl.description}</p>
                          )}
                          <div>
                            <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Pagina&apos;s</div>
                            <div className="flex flex-wrap gap-1.5">
                              {(tpl.sections.length > 0 ? tpl.sections : buildDefaultSections()).map((s) => (
                                <span
                                  key={s.key}
                                  className="text-[11px] px-2 py-0.5 rounded-full border"
                                  style={{ borderColor: tpl.theme?.accent ?? "#ff2bd6" }}
                                >
                                  {s.label}
                                </span>
                              ))}
                            </div>
                          </div>
                          {tpl.packages.length > 0 ? (
                            <div>
                              <div className="text-[10px] uppercase tracking-wider opacity-60 mb-2">Pakketten</div>
                              <div className="grid gap-2 sm:grid-cols-3">
                                {tpl.packages.map((p) => (
                                  <div
                                    key={p.id}
                                    className="rounded-md p-3 border"
                                    style={{
                                      borderColor: p.highlighted ? (tpl.theme?.accent ?? "#ff2bd6") : "rgba(255,255,255,0.15)",
                                      background: p.highlighted ? "rgba(255,255,255,0.06)" : "transparent",
                                    }}
                                  >
                                    <div className="text-sm font-semibold">{p.name}</div>
                                    <div className="text-lg font-bold tabular-nums">
                                      {eurFmt(p.price_eur)}
                                      <span className="text-[11px] font-normal opacity-70"> /{p.billing}</span>
                                    </div>
                                    <ul className="mt-1.5 space-y-0.5">
                                      {p.features.slice(0, 4).map((f, i) => (
                                        <li key={i} className="text-[11px] opacity-80">• {f}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] opacity-60 italic">Geen pakketten — je kunt ze later in de Studio toevoegen.</p>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {templateId && (() => {
                    const tpl = templates.find((x) => x.id === templateId);
                    if (!tpl || tpl.packages.length > 0) return null;
                    return (
                      <TooltipProvider delayDuration={150}>
                        <div
                          role="alert"
                          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
                        >
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold">Dit template heeft geen pakketten</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label="Meer informatie over deze waarschuwing"
                                    className="inline-flex items-center justify-center rounded-full p-0.5 hover:bg-amber-500/20"
                                  >
                                    <HelpCircle className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-sm text-xs leading-relaxed">
                                  <p className="font-semibold mb-1.5">Waarom geen prijstabel?</p>
                                  <ol className="list-decimal pl-4 space-y-1">
                                    <li>De prijstabel wordt opgebouwd uit het veld <strong>Pakketten</strong> van het template.</li>
                                    <li>Dit template heeft <strong>0 pakketten</strong>, dus de pagina <em>Investering</em> blijft leeg.</li>
                                    <li>Per pakket heb je nodig: <strong>Naam</strong>, <strong>Prijs (€)</strong>, <strong>Facturatie</strong> (eenmalig / per maand / per jaar) en <strong>Kenmerken</strong>.</li>
                                  </ol>
                                  <p className="font-semibold mt-2 mb-1">Stappen om dit op te lossen:</p>
                                  <ol className="list-decimal pl-4 space-y-1">
                                    <li>Maak de offerte nu aan (gaat zonder prijstabel).</li>
                                    <li>Open de Offerte Studio → tab <strong>Investering</strong>.</li>
                                    <li>Klik <strong>Pakket toevoegen</strong> en vul <em>Naam</em> + <em>Prijs (€)</em> in (verplicht).</li>
                                    <li>Optioneel: pas <em>Facturatie</em> en <em>Kenmerken</em> aan.</li>
                                  </ol>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <div className="opacity-90">
                              De offerte wordt aangemaakt zonder prijstabel. Je kunt later in de Offerte Studio pakketten met prijzen toevoegen.
                            </div>
                          </div>
                        </div>
                      </TooltipProvider>
                    );
                  })()}
                  {templateId && (
                    <p className="text-xs text-muted-foreground">
                      Opent direct in de Offerte Studio met alle pagina&apos;s, branding en pakketten van dit template.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="q-title">{t("quotes.field_title")}</Label>
                  <Input id="q-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                </div>

                <div className="space-y-1.5">
                  <Label>Klant (optioneel)</Label>
                  <Select value={clientId || "__none"} onValueChange={(v) => setClientId(v === "__none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Geen klant" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Geen klant</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>


                {!templateId && (
                <div className="space-y-2">
                  <Label>{t("quotes.line_items")}</Label>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("quotes.description")}</TableHead>
                          <TableHead className="w-20 text-right">{t("quotes.qty")}</TableHead>
                          <TableHead className="w-32 text-right">{t("quotes.unit_price")}</TableHead>
                          <TableHead className="w-32 text-right">{t("quotes.total")}</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((l, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Input
                                value={l.description}
                                onChange={(e) => {
                                  const next = [...lines];
                                  next[i] = { ...l, description: e.target.value };
                                  setLines(next);
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                step="1"
                                className="text-right"
                                value={l.quantity}
                                onChange={(e) => {
                                  const next = [...lines];
                                  next[i] = { ...l, quantity: Number(e.target.value) };
                                  setLines(next);
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                className="text-right"
                                value={l.unit_price}
                                onChange={(e) => {
                                  const next = [...lines];
                                  next[i] = { ...l, unit_price: Number(e.target.value) };
                                  setLines(next);
                                }}
                              />
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {eur.format(Number(l.quantity || 0) * Number(l.unit_price || 0))}
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setLines(lines.filter((_, j) => j !== i))}
                                disabled={lines.length === 1}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLines([...lines, { description: "", quantity: 1, unit_price: 0 }])}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      {t("quotes.add_line")}
                    </Button>
                    <div className="text-sm">
                      <span className="text-muted-foreground">{t("quotes.total")}: </span>
                      <span className="font-semibold tabular-nums">{eur.format(total)}</span>
                    </div>
                  </div>
                </div>
                )}



                <DialogFooter>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t("common.save")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : quotes.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          {t("quotes.empty")}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("quotes.field_title")}</TableHead>
                <TableHead>{t("quotes.created")}</TableHead>
                <TableHead className="text-right">{t("quotes.total")}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">{t("quotes.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((qBase) => {
                const q = qBase as QuoteExt;
                const isRevoked = !!q.revoked_at;
                const isSigned = !!q.accepted_at;
                const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/accept/quote/${q.public_token}` : "";
                const pdfUrl = typeof window !== "undefined" ? `${window.location.origin}/quote/${q.public_token}/pdf` : "";
                return (
                  <TableRow key={q.id} className={isRevoked ? "opacity-60" : ""}>
                    <TableCell className="font-medium">
                      <div>{q.title}</div>
                      {isSigned && (
                        <div className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="mr-1 inline h-3 w-3" />
                          Ondertekend door {q.accepted_by_name ?? "klant"}
                        </div>
                      )}
                      {isRevoked && (
                        <div className="mt-0.5 text-xs text-red-600">
                          <Ban className="mr-1 inline h-3 w-3" />Link ingetrokken
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div>{new Date(q.created_at).toLocaleDateString(i18n.resolvedLanguage ?? "nl")}</div>
                      {(() => {
                        const paidAt = (q as Quote & { paid_at?: string | null }).paid_at;
                        return paidAt ? (
                          <Badge variant="outline" className="mt-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                            ✓ Betaald · {new Date(paidAt).toLocaleDateString(i18n.resolvedLanguage ?? "nl")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="mt-1 bg-muted text-muted-foreground">
                            Niet betaald
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{eur.format(Number(q.total_amount))}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Select value={q.status} onValueChange={(v) => updateStatus(q.id, v as QuoteStatus)}>
                          <SelectTrigger className="h-7 w-[170px]">
                            <Badge variant="outline" className={STATUS_COLOR[q.status]}>
                              {t(`quotes.status.${q.status}`)}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS.map((s) => (
                              <SelectItem key={s} value={s}>
                                {t(`quotes.status.${s}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="text-xs text-muted-foreground">
                          {q.signed_at ? (
                            <>Ondertekend: {new Date(q.signed_at).toLocaleString(i18n.resolvedLanguage ?? "nl")}</>
                          ) : q.last_viewed_at ? (
                            <>Bekeken: {new Date(q.last_viewed_at).toLocaleString(i18n.resolvedLanguage ?? "nl")}</>
                          ) : q.sent_at ? (
                            <>Verzonden: {new Date(q.sent_at).toLocaleString(i18n.resolvedLanguage ?? "nl")}</>
                          ) : (
                            <>Concept</>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => convertToInvoice(q)}>
                          <FileText className="mr-1 h-3.5 w-3.5" />
                          {t("quotes.to_invoice")}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onClick={() => {
                              navigator.clipboard.writeText(publicUrl).then(
                                () => toast.success(t("accept.link_copied")),
                                () => toast.error("Clipboard error"),
                              );
                            }}>
                              <Link2 className="mr-2 h-4 w-4" /> Ondertekenlink kopiëren
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => window.open(pdfUrl, "_blank")} disabled={!isSigned}>
                              <Download className="mr-2 h-4 w-4" /> PDF downloaden
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={async () => {
                              try {
                                await markSentFn({ data: { id: q.id } });
                                toast.success("Gemarkeerd als verzonden");
                                load();
                              } catch (e) { toast.error((e as Error).message); }
                            }}>
                              <Send className="mr-2 h-4 w-4" /> Markeer als verzonden
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setSettingsQuote(q)}>
                              <Settings2 className="mr-2 h-4 w-4" /> Instellingen & follow-up
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setCommentsQuote(q)}>
                              <MessageSquare className="mr-2 h-4 w-4" /> Team-opmerkingen
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={async () => {
                              try {
                                await regenFn({ data: { id: q.id } });
                                toast.success("Nieuwe link gegenereerd");
                                load();
                              } catch (e) { toast.error((e as Error).message); }
                            }}>
                              <RefreshCw className="mr-2 h-4 w-4" /> Link vernieuwen
                            </DropdownMenuItem>
                            {isRevoked ? (
                              <DropdownMenuItem onClick={async () => {
                                try {
                                  await restoreFn({ data: { id: q.id } });
                                  toast.success("Link hersteld");
                                  load();
                                } catch (e) { toast.error((e as Error).message); }
                              }}>
                                <RotateCcw className="mr-2 h-4 w-4" /> Link herstellen
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem className="text-red-600" onClick={async () => {
                                if (!confirm("Weet je zeker dat je de link wil intrekken? De klant kan dan niet meer ondertekenen.")) return;
                                try {
                                  await revokeFn({ data: { id: q.id } });
                                  toast.success("Link ingetrokken");
                                  load();
                                } catch (e) { toast.error((e as Error).message); }
                              }}>
                                <Ban className="mr-2 h-4 w-4" /> Link intrekken
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              <Sparkles className="mr-2 inline h-4 w-4" />
              {t("ai_assistant.title")}
            </DialogTitle>
            <DialogDescription>{t("ai_assistant.placeholder")}</DialogDescription>
          </DialogHeader>
          <AIAssistantPanel
            task="lead_to_quote"
            suggestions={[
              {
                label: t("ai_assistant.suggest_quote"),
                task: "lead_to_quote",
                context:
                  "Maak een conceptofferte voor een nieuwe klant. Diensten: AI-strategiesessie (1 dagdeel, €1500), implementatie chatbot (40 uur, €110/uur), nazorg (10 uur, €110/uur).",
              },
              {
                label: t("ai_assistant.verify_invoice"),
                task: "verify_invoice",
                context:
                  "Controleer factuur: 3 x €1500 = €4500 subtotaal, 21% BTW = €945, totaal €5445.",
              },
              {
                label: t("ai_assistant.summarize_lead"),
                task: "summarize_lead",
                context:
                  "Lead: bouwbedrijf 25 medewerkers wil offertes sneller maken. Budget onbekend. Vorige aanbieder te traag. Wil binnen 2 weken pilot.",
              },
            ]}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!settingsQuote} onOpenChange={(o) => !o && setSettingsQuote(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Instellingen — {settingsQuote?.title}</DialogTitle>
            <DialogDescription>Personaliseer de publieke offerte en automatische follow-ups.</DialogDescription>
          </DialogHeader>
          {settingsQuote && (
            <SettingsForm
              q={settingsQuote}
              onSave={async (patch) => {
                try {
                  await updateSettingsFn({ data: { id: settingsQuote.id, ...patch } });
                  toast.success("Opgeslagen");
                  setSettingsQuote(null);
                  load();
                } catch (e) { toast.error((e as Error).message); }
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <QuoteCommentsDialog
        open={!!commentsQuote}
        onOpenChange={(o) => !o && setCommentsQuote(null)}
        quoteId={commentsQuote?.id ?? null}
        organizationId={currentOrganizationId ?? ""}
        quoteTitle={commentsQuote?.title ?? undefined}
      />

    </div>
  );
}

function SettingsForm({ q, onSave }: {
  q: { intro_video_url: string | null; intro_message: string | null; notify_email: string | null; client_email: string | null; followup_enabled: boolean; followup_after_days: number };
  onSave: (patch: { intro_video_url?: string | null; intro_message?: string | null; notify_email?: string | null; client_email?: string | null; followup_enabled?: boolean; followup_after_days?: number }) => void;
}) {
  const [video, setVideo] = useState(q.intro_video_url ?? "");
  const [msg, setMsg] = useState(q.intro_message ?? "");
  const [notify, setNotify] = useState(q.notify_email ?? "");
  const [clientEmail, setClientEmail] = useState(q.client_email ?? "");
  const [enabled, setEnabled] = useState(q.followup_enabled ?? true);
  const [days, setDays] = useState(q.followup_after_days ?? 3);
  return (
    <div className="space-y-4">
      <div>
        <Label>Persoonlijke video-intro (Loom/YouTube/Vimeo embed of MP4-URL)</Label>
        <Input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://www.loom.com/embed/..." />
      </div>
      <div>
        <Label>Persoonlijke boodschap</Label>
        <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} placeholder="Hi, hierbij onze offerte..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>E-mail klant (follow-ups)</Label>
          <Input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="klant@bedrijf.nl" type="email" />
        </div>
        <div>
          <Label>Notificatie naar (jij)</Label>
          <Input value={notify} onChange={(e) => setNotify(e.target.value)} placeholder="jij@bedrijf.nl" type="email" />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <div className="text-sm font-medium">Automatische follow-up e-mails</div>
          <div className="text-xs text-muted-foreground">Stuur herinneringen als de klant niet bekijkt of ondertekent.</div>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <div>
        <Label>Eerste follow-up na (dagen)</Label>
        <Input type="number" min={1} max={60} value={days} onChange={(e) => setDays(parseInt(e.target.value || "3", 10))} />
      </div>
      <DialogFooter>
        <Button onClick={() => onSave({
          intro_video_url: video.trim() || null,
          intro_message: msg.trim() || null,
          notify_email: notify.trim() || null,
          client_email: clientEmail.trim() || null,
          followup_enabled: enabled,
          followup_after_days: days,
        })}>Opslaan</Button>
      </DialogFooter>
    </div>
  );
}
