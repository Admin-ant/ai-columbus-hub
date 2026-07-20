import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({ meta: [{ title: "Cron jobs — status & logs" }] }),
  component: JobsPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Niet gevonden</div>,
});

type Run = {
  id: string;
  job_name: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  error: string | null;
};

const JOBS = ["outreach-sequence", "quote-followups"] as const;

function statusBadge(s: string) {
  if (s === "ok") return <Badge variant="default" className="bg-emerald-600"><CheckCircle2 className="mr-1 h-3 w-3" />OK</Badge>;
  if (s === "error") return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Fout</Badge>;
  if (s === "running") return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Bezig</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "medium" });
}

function JobsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [hoursBack, setHoursBack] = useState<number>(24);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
    let q = supabase
      .from("cron_job_runs")
      .select("*")
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(500);
    if (jobFilter !== "all") q = q.eq("job_name", jobFilter);
    const { data, error } = await q;
    if (!error && data) setRuns(data as Run[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [jobFilter, hoursBack]);

  // Hourly aggregation per job
  const hourly = useMemo(() => {
    const byKey = new Map<string, { hour: string; job: string; runs: number; ok: number; error: number; sent: number; skipped: number; failed: number }>();
    for (const r of runs) {
      const d = new Date(r.started_at);
      d.setMinutes(0, 0, 0);
      const hour = d.toISOString();
      const key = `${hour}|${r.job_name}`;
      const cur = byKey.get(key) ?? { hour, job: r.job_name, runs: 0, ok: 0, error: 0, sent: 0, skipped: 0, failed: 0 };
      cur.runs++;
      if (r.status === "ok") cur.ok++;
      if (r.status === "error") cur.error++;
      cur.sent += r.sent ?? 0;
      cur.skipped += r.skipped ?? 0;
      cur.failed += r.failed ?? 0;
      byKey.set(key, cur);
    }
    return Array.from(byKey.values()).sort((a, b) => b.hour.localeCompare(a.hour) || a.job.localeCompare(b.job));
  }, [runs]);

  const summary = useMemo(() => {
    const s: Record<string, { ok: number; error: number; running: number; total: number; last?: Run }> = {};
    for (const job of JOBS) s[job] = { ok: 0, error: 0, running: 0, total: 0 };
    for (const r of runs) {
      const bucket = s[r.job_name] ?? (s[r.job_name] = { ok: 0, error: 0, running: 0, total: 0 });
      bucket.total++;
      if (r.status === "ok") bucket.ok++;
      else if (r.status === "error") bucket.error++;
      else if (r.status === "running") bucket.running++;
      if (!bucket.last) bucket.last = r;
    }
    return s;
  }, [runs]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cron jobs — status & logs</h1>
          <p className="text-sm text-muted-foreground">Overzicht van outreach-sequence en quote-followups runs, per uur en per run.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={jobFilter} onValueChange={setJobFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle jobs</SelectItem>
              {JOBS.map((j) => <SelectItem key={j} value={j}>{j}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(hoursBack)} onValueChange={(v) => setHoursBack(Number(v))}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="6">Laatste 6 uur</SelectItem>
              <SelectItem value="24">Laatste 24 uur</SelectItem>
              <SelectItem value="72">Laatste 3 dagen</SelectItem>
              <SelectItem value="168">Laatste 7 dagen</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {JOBS.map((job) => {
          const s = summary[job];
          return (
            <Card key={job}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{job}</CardTitle>
                <CardDescription>Laatste run: {s.last ? fmtTime(s.last.started_at) : "—"} — {s.last ? statusBadge(s.last.status) : null}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm flex gap-4">
                <div><span className="text-muted-foreground">Totaal:</span> <b>{s.total}</b></div>
                <div className="text-emerald-600">OK: <b>{s.ok}</b></div>
                <div className="text-destructive">Fouten: <b>{s.error}</b></div>
                <div className="text-muted-foreground">Bezig: <b>{s.running}</b></div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Per uur</CardTitle>
          <CardDescription>Aantallen samengevat per uur en per job.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Uur</TableHead>
                <TableHead>Job</TableHead>
                <TableHead className="text-right">Runs</TableHead>
                <TableHead className="text-right">OK</TableHead>
                <TableHead className="text-right">Fouten</TableHead>
                <TableHead className="text-right">Verzonden</TableHead>
                <TableHead className="text-right">Overgeslagen</TableHead>
                <TableHead className="text-right">Mislukt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hourly.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Geen runs in deze periode</TableCell></TableRow>
              ) : hourly.map((h) => (
                <TableRow key={`${h.hour}-${h.job}`}>
                  <TableCell className="font-mono text-xs">{new Date(h.hour).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                  <TableCell>{h.job}</TableCell>
                  <TableCell className="text-right">{h.runs}</TableCell>
                  <TableCell className="text-right text-emerald-600">{h.ok}</TableCell>
                  <TableCell className="text-right text-destructive">{h.error}</TableCell>
                  <TableCell className="text-right">{h.sent}</TableCell>
                  <TableCell className="text-right">{h.skipped}</TableCell>
                  <TableCell className="text-right">{h.failed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Runs</CardTitle>
          <CardDescription>Detail per uitvoering.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gestart</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duur</TableHead>
                <TableHead className="text-right">Verwerkt</TableHead>
                <TableHead className="text-right">Verzonden</TableHead>
                <TableHead className="text-right">Overgeslagen</TableHead>
                <TableHead className="text-right">Mislukt</TableHead>
                <TableHead>Fout</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Geen runs</TableCell></TableRow>
              ) : runs.map((r) => {
                const dur = r.finished_at ? Math.max(0, new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{fmtTime(r.started_at)}</TableCell>
                    <TableCell>{r.job_name}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell>{dur == null ? "—" : `${(dur / 1000).toFixed(1)}s`}</TableCell>
                    <TableCell className="text-right">{r.processed}</TableCell>
                    <TableCell className="text-right">{r.sent}</TableCell>
                    <TableCell className="text-right">{r.skipped}</TableCell>
                    <TableCell className="text-right">{r.failed}</TableCell>
                    <TableCell className="text-xs text-destructive max-w-[280px] truncate" title={r.error ?? ""}>{r.error ?? ""}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
