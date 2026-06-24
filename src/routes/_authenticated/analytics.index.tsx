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
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/_authenticated/analytics/")({
  head: () => ({ meta: [{ title: "Analytics" }] }),
  component: AnalyticsDashboard,
});

const ACCENT = "#ff2bd6";

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
          .select("status,public_token,accepted_at")
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
    <div className="min-h-full bg-[#0a0a0a] text-white -m-4 p-6 md:-m-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6" style={{ color: ACCENT }} />
            Analytics
          </h1>
          <p className="text-sm text-white/60">
            {currentOrganization?.name ?? ""} — outreach → offerte → deal
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-white/60">
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
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white/80">
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
      className="rounded-lg border border-white/10 bg-black/40 p-4"
      style={accent ? { boxShadow: `0 0 24px ${ACCENT}33`, borderColor: `${ACCENT}55` } : undefined}
    >
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="mt-1 text-2xl font-bold" style={{ color: accent ? ACCENT : "white" }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-white/40">{sub}</div>}
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
              <span className="text-white/70">{s.label}</span>
              <span className="tabular-nums text-white/50">{s.value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
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
      <div className="mt-3 flex items-center gap-2 text-[11px] text-white/40">
        <Sparkles className="h-3 w-3" style={{ color: ACCENT }} />
        Live data — geen mock, niets gecached.
        <CheckCircle2 className="ml-auto h-3 w-3 text-emerald-400" />
      </div>
    </div>
  );
}
