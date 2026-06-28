import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, MailOpen, MousePointerClick, MessageSquare, TrendingUp } from "lucide-react";
import { getOutreachAnalytics } from "@/lib/outreach.functions";
import { Button } from "@/components/ui/button";

type Analytics = Awaited<ReturnType<typeof getOutreachAnalytics>>;

type Props = {
  organizationId: string | null;
  campaignNames: Record<string, string>;
};

const RANGES = [
  { days: 7, label: "7 dagen" },
  { days: 30, label: "30 dagen" },
  { days: 90, label: "90 dagen" },
];

export function OutreachAnalyticsTab({ organizationId, campaignNames }: Props) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchAnalytics = useServerFn(getOutreachAnalytics);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    setLoading(true);
    fetchAnalytics({ data: { organization_id: organizationId, days } })
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, days, fetchAnalytics]);

  if (!organizationId) {
    return <div className="text-sm text-muted-foreground">Geen actieve omgeving.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Performance ({days} dagen)
        </h3>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.days}
              size="sm"
              variant={days === r.days ? "default" : "ghost"}
              className={
                days === r.days
                  ? "bg-brand hover:bg-brand/90 text-brand-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !data ? (
        <div className="text-sm text-muted-foreground">Geen data.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi icon={Send} label="Verzonden" value={data.totals.sent} />
            <Kpi
              icon={MailOpen}
              label="Open rate"
              value={`${data.rates.open}%`}
              sub={`${data.totals.opened} opens`}
            />
            <Kpi
              icon={MousePointerClick}
              label="Click rate"
              value={`${data.rates.click}%`}
              sub={`${data.totals.clicked} clicks`}
            />
            <Kpi
              icon={MessageSquare}
              label="Reply rate"
              value={`${data.rates.reply}%`}
              sub={`${data.totals.replies} reacties`}
            />
            <Kpi
              icon={TrendingUp}
              label="Positief"
              value={`${data.rates.positive}%`}
              sub={`${data.totals.positive} positief`}
              accent
            />
          </div>

          <Panel title="Per campagne">
            {data.by_campaign.length === 0 ? (
              <div className="text-xs text-muted-foreground">Nog geen data</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium pb-2">Campagne</th>
                    <th className="text-right font-medium pb-2">Verzonden</th>
                    <th className="text-right font-medium pb-2">Open %</th>
                    <th className="text-right font-medium pb-2">Click %</th>
                    <th className="text-right font-medium pb-2">Reply %</th>
                    <th className="text-right font-medium pb-2">Positief</th>
                  </tr>
                </thead>
                <tbody className="text-foreground">
                  {data.by_campaign.map((c) => (
                    <tr key={c.campaign_id} className="border-t border-border">
                      <td className="py-2">{campaignNames[c.campaign_id] ?? "—"}</td>
                      <td className="py-2 text-right">{c.sent}</td>
                      <td className="py-2 text-right">
                        {c.sent ? Math.round((c.opened / c.sent) * 100) : 0}%
                      </td>
                      <td className="py-2 text-right">
                        {c.sent ? Math.round((c.clicked / c.sent) * 100) : 0}%
                      </td>
                      <td className="py-2 text-right">
                        {c.sent ? Math.round((c.replies / c.sent) * 100) : 0}%
                      </td>
                      <td className="py-2 text-right text-emerald-400">{c.positive}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="A/B varianten">
              {data.by_variant.length === 0 ? (
                <div className="text-xs text-muted-foreground">Geen varianten</div>
              ) : (
                <div className="space-y-2">
                  {data.by_variant.map((v) => {
                    const replyRate = v.sent ? Math.round((v.replies / v.sent) * 100) : 0;
                    const posRate = v.sent ? Math.round((v.positive / v.sent) * 100) : 0;
                    const conf = v.sent < 30 ? "lage" : v.sent < 100 ? "matige" : "hoge";
                    return (
                      <div
                        key={v.variant_id}
                        className="flex items-center justify-between rounded border border-border bg-muted/50 px-3 py-2"
                      >
                        <div className="text-xs font-medium text-foreground">{v.variant_id}</div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span>{v.sent} sent</span>
                          <span>{replyRate}% reply</span>
                          <span className="text-emerald-400">{posRate}% pos</span>
                          <span className="text-muted-foreground">{conf} confidence</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            <Panel title="Per sequence-stap">
              {data.by_step.length === 0 ? (
                <div className="text-xs text-muted-foreground">Geen data</div>
              ) : (
                <div className="space-y-2">
                  {data.by_step.map((s) => {
                    const rate = s.sent ? Math.round((s.replies / s.sent) * 100) : 0;
                    return (
                      <div key={s.step} className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-foreground">
                          <span>Stap {s.step + 1}</span>
                          <span className="text-muted-foreground">
                            {s.sent} sent · {s.replies} replies ({rate}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${Math.min(100, rate * 4)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof Send;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        accent
          ? "border-brand/40 bg-brand/10"
          : "border-border bg-muted/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}
