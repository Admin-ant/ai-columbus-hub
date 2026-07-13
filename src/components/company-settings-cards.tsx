import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Hash, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface OrgFormRow {
  name: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  kvk_number: string;
  tax_number: string;
  iban: string;
  bic: string;
  account_holder: string;
  invoice_prefix: string;
}

const EMPTY: OrgFormRow = {
  name: "",
  address_line1: "",
  address_line2: "",
  postal_code: "",
  city: "",
  country: "",
  phone: "",
  email: "",
  website: "",
  kvk_number: "",
  tax_number: "",
  iban: "",
  bic: "",
  account_holder: "",
  invoice_prefix: "",
};

// --- Validation helpers ---
function normalizeIban(v: string) {
  return v.replace(/\s+/g, "").toUpperCase();
}
function isValidIban(raw: string): boolean {
  const v = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
  const rearranged = v.slice(4) + v.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  // mod-97 in chunks (JS numbers can't hold full IBAN)
  let remainder = 0;
  for (let i = 0; i < expanded.length; i += 7) {
    const block = String(remainder) + expanded.slice(i, i + 7);
    remainder = parseInt(block, 10) % 97;
  }
  return remainder === 1;
}
function isValidKvk(raw: string): boolean {
  return /^\d{8}$/.test(raw.replace(/\s+/g, ""));
}
function isValidVat(raw: string): boolean {
  // EU VAT: 2-letter country code + up to 12 alphanumerics. NL: NL + 9 digits + B + 2 digits.
  const v = raw.replace(/\s+/g, "").toUpperCase();
  if (/^NL/.test(v)) return /^NL\d{9}B\d{2}$/.test(v);
  return /^[A-Z]{2}[A-Z0-9]{2,12}$/.test(v);
}

function validateField(key: "iban" | "kvk_number" | "tax_number", value: string): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (key === "iban" && !isValidIban(v)) return "Ongeldig IBAN (controleer landcode en controlegetal)";
  if (key === "kvk_number" && !isValidKvk(v)) return "KvK-nummer moet uit 8 cijfers bestaan";
  if (key === "tax_number" && !isValidVat(v)) return "Ongeldig BTW-nummer (bijv. NL123456789B01)";
  return null;
}

interface SeqRow {
  id: string;
  year: number;
  prefix: string;
  next_seq: number;
}

export function CompanySettingsCards() {
  const { currentOrganizationId } = useWorkspace();
  const orgId = currentOrganizationId;
  const [form, setForm] = useState<OrgFormRow>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seqs, setSeqs] = useState<SeqRow[]>([]);
  const [newYear, setNewYear] = useState<string>(String(new Date().getFullYear() + 1));
  const [newStart, setNewStart] = useState<string>("1");
  const [seqSaving, setSeqSaving] = useState<string | null>(null);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const [orgRes, seqRes] = await Promise.all([
      supabase
        .from("organizations")
        .select(
          "name,address_line1,address_line2,postal_code,city,country,phone,email,website,kvk_number,tax_number,iban,bic,account_holder,invoice_prefix",
        )
        .eq("id", orgId)
        .maybeSingle(),
      supabase
        .from("invoice_number_sequences")
        .select("id,year,prefix,next_seq")
        .eq("organization_id", orgId)
        .order("year", { ascending: false }),
    ]);
    if (orgRes.error) toast.error(orgRes.error.message);
    if (orgRes.data) {
      const o = orgRes.data as Record<string, string | null>;
      setForm({
        name: o.name ?? "",
        address_line1: o.address_line1 ?? "",
        address_line2: o.address_line2 ?? "",
        postal_code: o.postal_code ?? "",
        city: o.city ?? "",
        country: o.country ?? "",
        phone: o.phone ?? "",
        email: o.email ?? "",
        website: o.website ?? "",
        kvk_number: o.kvk_number ?? "",
        tax_number: o.tax_number ?? "",
        iban: o.iban ?? "",
        bic: o.bic ?? "",
        account_holder: o.account_holder ?? "",
        invoice_prefix: o.invoice_prefix ?? "",
      });
    }
    setSeqs((seqRes.data ?? []) as SeqRow[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  function patch<K extends keyof OrgFormRow>(k: K, v: OrgFormRow[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  const errors = {
    iban: validateField("iban", form.iban),
    kvk_number: validateField("kvk_number", form.kvk_number),
    tax_number: validateField("tax_number", form.tax_number),
  };
  const hasErrors = Boolean(errors.iban || errors.kvk_number || errors.tax_number);

  async function saveOrg() {
    if (!orgId) return;
    if (hasErrors) {
      toast.error("Corrigeer de gemarkeerde velden voor je opslaat");
      return;
    }
    setSaving(true);
    // Empty string -> null so template hides the field.
    const nullify = (s: string) => (s.trim() === "" ? null : s.trim());
    const payload = {
      name: form.name.trim() || "Onbenoemde organisatie",
      address_line1: nullify(form.address_line1),
      address_line2: nullify(form.address_line2),
      postal_code: nullify(form.postal_code),
      city: nullify(form.city),
      country: nullify(form.country),
      phone: nullify(form.phone),
      email: nullify(form.email),
      website: nullify(form.website),
      kvk_number: form.kvk_number.trim() === "" ? null : form.kvk_number.replace(/\s+/g, ""),
      tax_number: form.tax_number.trim() === "" ? null : form.tax_number.replace(/\s+/g, "").toUpperCase(),
      iban: form.iban.trim() === "" ? null : normalizeIban(form.iban),
      bic: nullify(form.bic),
      account_holder: nullify(form.account_holder),
      invoice_prefix: form.invoice_prefix.trim() || "INV",
    };
    const { error } = await supabase.from("organizations").update(payload).eq("id", orgId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Bedrijfsgegevens opgeslagen");
  }

  async function updateSeq(row: SeqRow, next_seq: number, prefix: string) {
    if (!orgId) return;
    setSeqSaving(row.id);
    const { error } = await supabase
      .from("invoice_number_sequences")
      .update({ next_seq, prefix })
      .eq("id", row.id);
    setSeqSaving(null);
    if (error) return toast.error(error.message);
    toast.success(`Reeks ${row.year} bijgewerkt`);
    void load();
  }

  async function deleteSeq(row: SeqRow) {
    if (!window.confirm(`Reeks voor ${row.year} verwijderen?`)) return;
    const { error } = await supabase.from("invoice_number_sequences").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Reeks verwijderd");
    void load();
  }

  async function addSeq() {
    if (!orgId) return;
    const y = parseInt(newYear, 10);
    const s = parseInt(newStart, 10);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) return toast.error("Ongeldig jaar");
    if (!Number.isFinite(s) || s < 1) return toast.error("Startnummer moet ≥ 1 zijn");
    const { error } = await supabase.from("invoice_number_sequences").insert({
      organization_id: orgId,
      year: y,
      prefix: form.invoice_prefix.trim() || "INV",
      next_seq: s,
    } as never);
    if (error) return toast.error(error.message);
    toast.success(`Reeks ${y} aangemaakt`);
    setNewStart("1");
    setNewYear(String(y + 1));
    void load();
  }

  if (!orgId) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Bedrijfsgegevens
          </CardTitle>
          <CardDescription>
            Deze gegevens worden gebruikt in de header van elke factuur. Lege velden worden
            automatisch weggelaten.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Laden…
            </div>
          ) : (
            <>
              <Field label="Bedrijfsnaam" value={form.name} onChange={(v) => patch("name", v)} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Straat + huisnummer" value={form.address_line1} onChange={(v) => patch("address_line1", v)} />
                <Field label="Adres regel 2 (optioneel)" value={form.address_line2} onChange={(v) => patch("address_line2", v)} />
                <Field label="Postcode" value={form.postal_code} onChange={(v) => patch("postal_code", v)} />
                <Field label="Plaats" value={form.city} onChange={(v) => patch("city", v)} />
                <Field label="Land" value={form.country} onChange={(v) => patch("country", v)} />
                <Field label="Telefoonnummer" value={form.phone} onChange={(v) => patch("phone", v)} />
                <Field label="E-mail" value={form.email} onChange={(v) => patch("email", v)} />
                <Field label="Website" value={form.website} onChange={(v) => patch("website", v)} />
                <Field label="KvK-nummer" value={form.kvk_number} onChange={(v) => patch("kvk_number", v)} error={errors.kvk_number} placeholder="12345678" />
                <Field label="BTW-nummer" value={form.tax_number} onChange={(v) => patch("tax_number", v)} error={errors.tax_number} placeholder="NL123456789B01" />
                <Field label="IBAN" value={form.iban} onChange={(v) => patch("iban", v)} error={errors.iban} placeholder="NL33 RABO 0176 0067 37" />
                <Field label="BIC" value={form.bic} onChange={(v) => patch("bic", v)} />
                <Field label="Tenaamstelling (t.n.v.)" value={form.account_holder} onChange={(v) => patch("account_holder", v)} />
                <Field label="Factuurprefix" value={form.invoice_prefix} onChange={(v) => patch("invoice_prefix", v)} />
              </div>
              <div className="flex justify-end">
                <Button onClick={saveOrg} disabled={saving || hasErrors} size="sm">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Opslaan
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="h-4 w-4" /> Factuurnummering per jaar
          </CardTitle>
          <CardDescription>
            Stel per jaar het volgende factuurnummer en (optioneel) een afwijkende prefix in.
            Voorbeeld: startnummer 3470 voor 2026 geeft <code className="rounded bg-muted px-1">{form.invoice_prefix || "AIC"}-2026-03470</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Laden…
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Jaar</th>
                      <th className="px-3 py-2 text-left">Prefix</th>
                      <th className="px-3 py-2 text-left">Volgend nummer</th>
                      <th className="px-3 py-2 text-left">Voorbeeld</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {seqs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-xs text-muted-foreground">
                          Nog geen jaar-reeksen. De eerste factuur van een jaar maakt de rij automatisch aan.
                        </td>
                      </tr>
                    )}
                    {seqs.map((row) => (
                      <SeqEditor
                        key={row.id}
                        row={row}
                        currentYear={currentYear}
                        onSave={updateSeq}
                        onDelete={deleteSeq}
                        saving={seqSaving === row.id}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/20 p-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nieuw jaar</Label>
                  <Input
                    type="number"
                    className="h-9 w-28"
                    value={newYear}
                    onChange={(e) => setNewYear(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Startnummer</Label>
                  <Input
                    type="number"
                    className="h-9 w-32"
                    value={newStart}
                    onChange={(e) => setNewStart(e.target.value)}
                  />
                </div>
                <Button onClick={addSeq} size="sm">
                  <Plus className="mr-1 h-4 w-4" /> Reeks toevoegen
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className={error ? "border-destructive focus-visible:ring-destructive" : undefined}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SeqEditor({
  row,
  currentYear,
  onSave,
  onDelete,
  saving,
}: {
  row: SeqRow;
  currentYear: number;
  onSave: (row: SeqRow, next_seq: number, prefix: string) => void;
  onDelete: (row: SeqRow) => void;
  saving: boolean;
}) {
  const [prefix, setPrefix] = useState(row.prefix);
  const [seq, setSeq] = useState(String(row.next_seq));
  useEffect(() => {
    setPrefix(row.prefix);
    setSeq(String(row.next_seq));
  }, [row.prefix, row.next_seq]);
  const parsed = parseInt(seq, 10);
  const preview = `${prefix || "?"}-${row.year}-${String(Number.isFinite(parsed) ? parsed : 0).padStart(5, "0")}`;
  const dirty = prefix !== row.prefix || String(row.next_seq) !== seq;
  return (
    <tr className="border-t">
      <td className="px-3 py-2 font-medium">
        {row.year}
        {row.year === currentYear && (
          <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] uppercase text-emerald-700">
            huidig
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="h-8 w-24" />
      </td>
      <td className="px-3 py-2">
        <Input type="number" value={seq} onChange={(e) => setSeq(e.target.value)} className="h-8 w-28" />
      </td>
      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{preview}</td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={!dirty || saving || !Number.isFinite(parsed) || parsed < 1}
            onClick={() => onSave(row, parsed, prefix.trim())}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(row)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
