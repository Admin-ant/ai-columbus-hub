import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  createTicket, listTickets, TICKET_PRIORITIES, type TicketPriority, type TicketStatus,
} from "@/lib/tickets.functions";

const STATUS_LABEL: Record<TicketStatus, string> = {
  nieuw: "Nieuw",
  in_behandeling: "In behandeling",
  wachten_op_klant: "Wachten op klant",
  opgelost: "Opgelost",
  gesloten: "Gesloten",
};
const PRIORITY_LABEL: Record<TicketPriority, string> = {
  laag: "Laag", normaal: "Normaal", hoog: "Hoog", urgent: "Urgent",
};

export function ClientTicketsCard({
  clientId,
  organizationId,
}: {
  clientId: string;
  organizationId: string;
}) {
  const list = useServerFn(listTickets);
  const create = useServerFn(createTicket);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ subject: "", body: "", priority: "normaal" as TicketPriority });

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const res = await list({ data: { organization_id: organizationId, client_id: clientId, limit: 100 } });
      setRows(res.rows as any[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Laden mislukt");
    } finally {
      setLoading(false);
    }
  }, [organizationId, clientId, list]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function submit() {
    if (!form.subject.trim()) { toast.error("Onderwerp is verplicht"); return; }
    setSaving(true);
    try {
      const res = await create({
        data: {
          organization_id: organizationId,
          subject: form.subject.trim(),
          body: form.body,
          priority: form.priority,
          source: "manual",
          client_id: clientId,
        },
      });
      toast.success(`Ticket ${res.ticket_number} aangemaakt`);
      setOpen(false);
      setForm({ subject: "", body: "", priority: "normaal" });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aanmaken mislukt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <LifeBuoy className="h-4 w-4" /> Tickets
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Nieuw ticket</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nieuw ticket voor deze klant</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>Onderwerp</Label>
                <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Omschrijving</Label>
                <Textarea rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Prioriteit</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TicketPriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annuleren</Button>
              <Button onClick={submit} disabled={saving}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Aanmaken
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Laden...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nog geen tickets voor deze klant.</div>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  to="/tickets/$ticketId"
                  params={{ ticketId: r.id }}
                  className="flex items-center gap-3 py-2 hover:bg-muted/40"
                >
                  <span className="font-mono text-xs text-muted-foreground">{r.ticket_number}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{r.subject}</span>
                  <Badge variant="outline">{STATUS_LABEL[r.status as TicketStatus]}</Badge>
                  <Badge variant="secondary">{PRIORITY_LABEL[r.priority as TicketPriority]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
