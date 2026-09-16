import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, LifeBuoy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/support/$orgSlug")({
  head: () => ({
    meta: [
      { title: "Support aanvragen — meld je vraag of storing" },
      { name: "description", content: "Meld je vraag, storing of verzoek aan. Je ontvangt direct een ticketnummer per e-mail." },
      { property: "og:title", content: "Support aanvragen" },
      { property: "og:description", content: "Meld je vraag of storing en ontvang direct een ticketnummer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportFormPage,
});

function SupportFormPage() {
  const { orgSlug } = Route.useParams();
  const [orgName, setOrgName] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", subject: "", message: "", priority: "normaal", company: "",
  });

  useEffect(() => {
    fetch(`/api/public/hooks/ticket-intake?org=${encodeURIComponent(orgSlug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setOrgName(d?.name ?? null))
      .catch(() => setOrgName(null));
  }, [orgSlug]);

  async function toBase64(file: File) {
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const attachments = await Promise.all(
        files.map(async (f) => ({
          filename: f.name,
          mime_type: f.type || "application/octet-stream",
          base64: await toBase64(f),
        })),
      );
      const res = await fetch(`/api/public/hooks/ticket-intake?org=${encodeURIComponent(orgSlug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, attachments }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Versturen mislukt");
      setDone(body?.ticket_number ?? "aangemaakt");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Versturen mislukt");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <LifeBuoy className="h-5 w-5" /> Support{orgName ? ` — ${orgName}` : ""}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Laat je vraag of storing achter. Je krijgt direct een ticketnummer per e-mail.
          </p>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-primary" />
              <p className="text-lg font-semibold">Bedankt, je melding staat klaar</p>
              <p className="text-sm text-muted-foreground">Ticketnummer: <span className="font-mono">{done}</span></p>
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={submit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="name">Naam</Label>
                  <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Telefoon (optioneel)</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>Urgentie</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="laag">Laag</SelectItem>
                      <SelectItem value="normaal">Normaal</SelectItem>
                      <SelectItem value="hoog">Hoog</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="subject">Onderwerp</Label>
                <Input id="subject" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="message">Omschrijving</Label>
                <Textarea id="message" rows={6} required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              </div>
              <input
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={sending}>
                {sending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Melding versturen
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
