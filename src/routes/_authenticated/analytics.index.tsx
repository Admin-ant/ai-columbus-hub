import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  TrendingUp,
  FileSignature,
  Megaphone,
  CheckCircle2,
  Sparkles,
  Loader2,
  Flame,
  Eye,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/_authenticated/analytics/")({
  head: () => ({ meta: [{ title: "Analytics" }] }),
  component: AnalyticsDashboard,
});

const ACCENT = "var(--brand)";

type Counters = {
  prospects: number;
  contacted: number;
  replied: number;
  won: number;
  campaigns: number;
  quotes: number;
  shared: number;
  accepted: number;
};

type HeatRow = {
  quote_id: string;
  title: string;
  total_ms: number;
  views: number;
  top_section: string | null;
  top_section_ms: number;
};

function AnalyticsDashboard() {
  const { currentOrganizationId, currentOrganization, loading: wsLoading } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [c, setC] = useState<Counters>({
    prospects: 0,
    contacted: 0,
    replied: 0,
    won: 0,
    campaigns: 0,
    quotes: 0,
    shared: 0,
    accepted: 0,
  });
  const [heatmap, setHeatmap] = useState<HeatRow[]>([]);

  useEffect(() => {
    async function load() {
      if (!currentOrganizationId) return;
      setLoading(true);
      const org = currentOrganizationId;
      const [t, camp, q] = await Promise.all([
        supabase
          .from("outreach_targets")
          .select("stage")
          .eq("organization_id", org),
        supabase
          .from("outreach_campaigns")
          .select("status")
          .eq("organization_id", org),
        supabase
          .from("studio_quotes")
          .select("id,title,status,public_token,accepted_at")
          .eq("organization_id", org),
      ]);

      const targets = t.data ?? [];
      const quotes = q.data ?? [];
      setC({
        prospects: targets.length,
        contacted: targets.filter((x) =>
          ["aangeschreven", "reactie", "gesprek", "gewonnen"].includes(x.stage as string),
        ).length,
        replied: targets.filter((x) =>
          ["reactie", "gesprek", "gewonnen"].includes(x.stage as string),
        ).length,
        won: targets.filter((x) => x.stage === "gewonnen").length,
        campaigns: (camp.data ?? []).filter((x) => x.status === "active").length,
        quotes: quotes.length,
        shared: quotes.filter((x) => x.public_token).length,
        accepted: quotes.filter((x) => x.accepted_at).length,
      });

      // Heatmap: aggregate section_view events per quote.
      const ev = await supabase
        .from("studio_quote_events")
        .select("quote_id,section_key,duration_ms,event_type")
        .eq("organization_id", org)
        .eq("event_type", "section_view")
        .order("occurred_at", { ascending: false })
        .limit(2000);
      const byQuote = new Map<string, { total: number; bySec: Map<string, number>; views: number }>();
      for (const e of ev.data ?? []) {
        const key = e.quote_id as string;
        const ms = (e.duration_ms as number) ?? 0;
        const sec = (e.section_key as string) ?? "?";
        if (!byQuote.has(key)) byQuote.set(key, { total: 0, bySec: new Map(), views: 0 });
        const b = byQuote.get(key)!;
        b.total += ms;
        b.views += 1;
        b.bySec.set(sec, (b.bySec.get(sec) ?? 0) + ms);
      }
      const heat: HeatRow[] = [];
      for (const qr of quotes) {
        const b = byQuote.get(qr.id as string);
        if (!b) continue;
        let topSec: string | null = null;
        let topMs = 0;
        b.bySec.forEach((ms, sec) => {
          if (ms > topMs) {
            topMs = ms;
            topSec = sec;
          }
        });
        heat.push({
          quote_id: qr.id as string,
          title: (qr.title as string) ?? "Offerte",
          total_ms: b.total,
          views: b.views,
          top_section: topSec,
          top_section_ms: topMs,
        });
      }
      heat.sort((a, b) => b.total_ms - a.total_ms);
      setHeatmap(heat.slice(0, 8));

      setLoading(false);
    }
    if (!wsLoading) load();
  }, [currentOrganizationId, wsLoading]);

  const conversion = useMemo(() => {
    const outreachToQuote = c.won
      ? Math.round((c.accepted / Math.max(1, c.won)) * 100)
      : 0;
    const replyRate = c.contacted
      ? Math.round((c.replied / c.contacted) * 100)
      : 0;
    const acceptRate = c.shared
      ? Math.round((c.accepted / c.shared) * 100)
      : 0;
    return { outreachToQuote, replyRate, acceptRate };
  }, [c]);

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6" style={{ color: ACCENT }} />
            Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentOrganization?.name ?? ""} — outreach → offerte → deal
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden…
          </div>
        ) : (
          <>
            <Section title="Outreach pipeline" icon={Megaphone}>
              <Kpi label="Prospects" value={c.prospects} />
              <Kpi label="Aangeschreven" value={c.contacted} />
              <Kpi label="Reply rate" value={`${conversion.replyRate}%`} sub={`${c.replied} reacties`} />
              <Kpi label="Actieve campagnes" value={c.campaigns} />
              <Kpi label="Gewonnen" value={c.won} accent />
            </Section>

            <Section title="Offerte Studio" icon={FileSignature}>
              <Kpi label="Offertes" value={c.quotes} />
              <Kpi label="Gedeeld via link" value={c.shared} />
              <Kpi label="Geaccepteerd" value={c.accepted} accent />
              <Kpi label="Accept rate" value={`${conversion.acceptRate}%`} sub={`van ${c.shared} gedeeld`} />
            </Section>

            <Section title="Eindconversie" icon={TrendingUp}>
              <Funnel
                steps={[
                  { label: "Prospects", value: c.prospects },
                  { label: "Aangeschreven", value: c.contacted },
                  { label: "Reactie", value: c.replied },
                  { label: "Gewonnen", value: c.won },
                  { label: "Offerte geaccepteerd", value: c.accepted, accent: true },
                ]}
              />
            </Section>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Flame className="h-4 w-4" style={{ color: ACCENT }} />
                Heatmap — wat lezen klanten écht?
              </div>
              {heatmap.length === 0 ? (
                <div className="rounded border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  Nog geen weergavedata. Deel een offerte-link om de heatmap op te bouwen.
                </div>
              ) : (
                <div className="space-y-2">
                  {heatmap.map((h) => {
                    const max = Math.max(1, ...heatmap.map((x) => x.total_ms));
                    const pct = Math.round((h.total_ms / max) * 100);
                    return (
                      <div key={h.quote_id} className="rounded border border-border bg-muted/30 p-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="truncate font-semibold text-foreground">{h.title}</span>
                          <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
                            <Eye className="h-3 w-3" /> {h.views}
                            <span className="text-foreground/30">·</span>
                            <span>{Math.round(h.total_ms / 1000)}s</span>
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/50">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}88)`,
                              boxShadow: `0 0 12px ${ACCENT}66`,
                            }}
                          />
                        </div>
                        {h.top_section && (
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            Hotspot:{" "}
                            <span className="text-muted-foreground">{h.top_section}</span> ({Math.round(h.top_section_ms / 1000)}s)
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof BarChart3;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4" style={{ color: ACCENT }} />
        {title}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {children}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-lg border border-border bg-muted/40 p-4"
      style={accent ? { boxShadow: `0 0 24px ${ACCENT}33`, borderColor: `${ACCENT}55` } : undefined}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold" style={{ color: accent ? ACCENT : "white" }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Funnel({
  steps,
}: {
  steps: Array<{ label: string; value: number; accent?: boolean }>;
}) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="col-span-full space-y-2">
      {steps.map((s) => {
        const pct = Math.round((s.value / max) * 100);
        return (
          <div key={s.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="tabular-nums text-muted-foreground">{s.value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted/50">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: s.accent
                    ? `linear-gradient(90deg, ${ACCENT}, ${ACCENT}aa)`
                    : "linear-gradient(90deg, rgba(255,255,255,0.6), rgba(255,255,255,0.3))",
                  boxShadow: s.accent ? `0 0 16px ${ACCENT}66` : undefined,
                }}
              />
            </div>
          </div>
        );
      })}
      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Sparkles className="h-3 w-3" style={{ color: ACCENT }} />
        Live data — geen mock, niets gecached.
        <CheckCircle2 className="ml-auto h-3 w-3 text-emerald-400" />
      </div>
    </div>
  );
}
