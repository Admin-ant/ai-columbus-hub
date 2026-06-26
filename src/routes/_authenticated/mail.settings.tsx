import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Mail as MailIcon, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
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

export const Route = createFileRoute("/_authenticated/mail/settings")({
  head: () => ({ meta: [{ title: "Mail instellingen" }] }),
  component: MailSettingsPage,
});

type Template = { id: string; name: string; channel: string };
type Settings = {
  from_email: string | null;
  from_name: string | null;
  reply_to: string | null;
  signature: string | null;
  default_email_template_id: string | null;
  default_linkedin_template_id: string | null;
  default_whatsapp_template_id: string | null;
};
const empty: Settings = {
  from_email: "",
  from_name: "",
  reply_to: "",
  signature: "",
  default_email_template_id: null,
  default_linkedin_template_id: null,
  default_whatsapp_template_id: null,
};

function MailSettingsPage() {
  const { currentOrganizationId, currentOrganization } = useWorkspace();
  const [s, setS] = useState<Settings>(empty);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentOrganizationId) return;
    (async () => {
      setLoading(true);
      const [a, b] = await Promise.all([
        supabase
          .from("mail_settings")
          .select("*")
          .eq("organization_id", currentOrganizationId)
          .maybeSingle(),
        supabase
          .from("outreach_message_templates")
          .select("id, name, channel")
          .eq("organization_id", currentOrganizationId)
          .order("name"),
      ]);
      if (a.data) setS({ ...empty, ...(a.data as Settings) });
      else setS(empty);
      setTemplates((b.data ?? []) as Template[]);
      setLoading(false);
    })();
  }, [currentOrganizationId]);

  async function save() {
    if (!currentOrganizationId) return;
    setSaving(true);
    const payload = {
      organization_id: currentOrganizationId,
      from_email: s.from_email?.trim() || null,
      from_name: s.from_name?.trim() || null,
      reply_to: s.reply_to?.trim() || null,
      signature: s.signature?.trim() || null,
      default_email_template_id: s.default_email_template_id,
      default_linkedin_template_id: s.default_linkedin_template_id,
      default_whatsapp_template_id: s.default_whatsapp_template_id,
    };
    const { error } = await supabase
      .from("mail_settings")
      .upsert(payload as never, { onConflict: "organization_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Opgeslagen");
  }

  const byChannel = (ch: string) => templates.filter((t) => t.channel === ch);

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white -m-4 p-6 md:-m-6 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link to="/mail" className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white">
            <ArrowLeft className="h-3 w-3" /> Terug naar Mail
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight flex items-center gap-2">
            <MailIcon className="h-6 w-6" style={{ color: "#ff2bd6" }} />
            Mail instellingen
          </h1>
          <p className="text-sm text-white/60">
            {currentOrganization?.name ?? ""} — afzender en standaard templates per bedrijf
          </p>
        </div>

        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-white/60" />
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/5 p-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Afzender naam">
                <Input
                  value={s.from_name ?? ""}
                  onChange={(e) => setS({ ...s, from_name: e.target.value })}
                  placeholder="Bijv. AI van Columbus"
                  className="bg-white/5 border-white/10 text-white"
                />
              </Field>
              <Field label="Afzender e-mail">
                <Input
                  value={s.from_email ?? ""}
                  onChange={(e) => setS({ ...s, from_email: e.target.value })}
                  placeholder="hello@bedrijf.nl"
                  className="bg-white/5 border-white/10 text-white"
                />
              </Field>
            </div>
            <Field label="Reply-to (optioneel)">
              <Input
                value={s.reply_to ?? ""}
                onChange={(e) => setS({ ...s, reply_to: e.target.value })}
                placeholder="antwoord@bedrijf.nl"
                className="bg-white/5 border-white/10 text-white"
              />
            </Field>
            <Field label="Handtekening (wordt automatisch toegevoegd)">
              <Textarea
                rows={5}
                value={s.signature ?? ""}
                onChange={(e) => setS({ ...s, signature: e.target.value })}
                className="bg-white/5 border-white/10 text-white font-mono text-sm"
                placeholder={"Met vriendelijke groet,\nNaam"}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <TplSel
                label="Standaard E-mail"
                value={s.default_email_template_id}
                onChange={(v) => setS({ ...s, default_email_template_id: v })}
                options={byChannel("email")}
              />
              <TplSel
                label="Standaard LinkedIn"
                value={s.default_linkedin_template_id}
                onChange={(v) => setS({ ...s, default_linkedin_template_id: v })}
                options={byChannel("linkedin")}
              />
              <TplSel
                label="Standaard WhatsApp"
                value={s.default_whatsapp_template_id}
                onChange={(v) => setS({ ...s, default_whatsapp_template_id: v })}
                options={byChannel("whatsapp")}
              />
            </div>

            <div className="flex justify-end">
              <Button
                onClick={save}
                disabled={saving}
                className="bg-[#ff2bd6] hover:bg-[#ff2bd6]/90 text-white"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Opslaan
              </Button>
            </div>

            <p className="text-[11px] text-white/40">
              Tip: voor verzending vanaf een eigen domein moet dit domein in Resend geverifieerd zijn.
              Anders blijft de fallback afzender (outreach@resend.dev) in gebruik.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wider text-white/60">{label}</Label>
      {children}
    </div>
  );
}

function TplSel({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: Template[];
}) {
  return (
    <Field label={label}>
      <Select
        value={value ?? "__none__"}
        onValueChange={(v) => onChange(v === "__none__" ? null : v)}
      >
        <SelectTrigger className="bg-white/5 border-white/10 text-white">
          <SelectValue placeholder="Geen" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Geen</SelectItem>
          {options.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
