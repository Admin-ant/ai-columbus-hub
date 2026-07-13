import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  centsToEuros,
  computeInvoiceTotals,
  formatCents,
  type LineKind,
} from "@/lib/currency";

export type InvoiceTemplateLineKind = LineKind;

export interface InvoiceTemplateLine {
  line_type?: InvoiceTemplateLineKind;
  date?: string | null;
  quantity: number;
  description: string;
  /** Prijs per stuk in **euro's** (voor backwards-compat) — óf gebruik `unit_price_cents`. */
  unit_price?: number;
  unit_price_cents?: number;
  vat_rate?: number;
  /** Optioneel — precomputed door de DB. Als aanwezig gebruiken we deze in plaats van te rekenen. */
  subtotal_cents?: number;
  vat_cents?: number;
  total_cents?: number;
}

export interface InvoiceTemplateOrganization {
  name?: string | null;
  street?: string | null;
  postal_city?: string | null;
  country?: string | null;
  phone?: string | null;
  website?: string | null;
  kvk?: string | null;
  vat?: string | null;
  iban?: string | null;
  account_holder?: string | null;
  logo_url?: string | null;
}

export interface InvoiceTemplateClient {
  customer_number?: string | null;
  company_name?: string | null;
  street?: string | null;
  postal_city?: string | null;
}

export interface InvoiceTemplateProps {
  organization: InvoiceTemplateOrganization;
  client: InvoiceTemplateClient;
  invoice_number: string;
  issue_date: string;
  due_date?: string | null;
  payment_days?: number | null;
  /** Fallback-tarief als een regel geen `vat_rate` heeft. */
  default_vat_rate?: number;
  lines: InvoiceTemplateLine[];
  /** Overschrijf berekende totalen (bv. rechtstreeks uit DB `invoices` tabel). */
  precomputed_subtotal_cents?: number | null;
  precomputed_vat_cents?: number | null;
  precomputed_total_cents?: number | null;
  currency?: string;
  language?: string;
  footer_note?: string | null;
  payment_link_url?: string | null;
  className?: string;
}

const LINE_TYPE_LABELS: Record<InvoiceTemplateLineKind, string> = {
  item: "",
  service_fee: "Servicekosten",
  discount: "Korting",
  shipping: "Verzendkosten",
};

const fmtDate = (iso?: string | null, lang: string = "nl") => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "en" ? "en-IE" : "nl-NL");
};

function normalizeLineCents(l: InvoiceTemplateLine): number {
  if (typeof l.unit_price_cents === "number") return l.unit_price_cents;
  if (typeof l.unit_price === "number") return Math.round(l.unit_price * 100);
  return 0;
}

export function InvoiceTemplate({
  organization,
  client,
  invoice_number,
  issue_date,
  due_date,
  payment_days,
  default_vat_rate = 21,
  lines,
  precomputed_subtotal_cents,
  precomputed_vat_cents,
  precomputed_total_cents,
  currency = "EUR",
  language = "nl",
  footer_note,
  payment_link_url,
  className,
}: InvoiceTemplateProps) {
  // Reken alles opnieuw voor consistente per-regel BTW én breakdown,
  // maar hou het door DB opgeslagen totaal als bron van waarheid voor
  // eind-bedragen (subtle rounding drift protection).
  const totals = computeInvoiceTotals(
    lines.map((l) => ({
      line_type: l.line_type ?? "item",
      description: l.description,
      quantity: Number(l.quantity ?? 0),
      unit_price_cents: normalizeLineCents(l),
      vat_rate: typeof l.vat_rate === "number" ? l.vat_rate : default_vat_rate,
    })),
  );

  const subtotal_cents = precomputed_subtotal_cents ?? totals.subtotal_cents;
  const vat_cents = precomputed_vat_cents ?? totals.vat_cents;
  const total_cents = precomputed_total_cents ?? totals.total_cents;
  const fmt = (c: number) => formatCents(c, language, currency);

  const orgLines = [
    organization.name,
    organization.street,
    organization.postal_city,
    organization.country,
  ].filter(Boolean) as string[];
  const contactLines = [organization.phone, organization.website].filter(Boolean) as string[];
  const legalLines = [
    organization.kvk ? `KvK: ${organization.kvk}` : null,
    organization.vat ? `BTW: ${organization.vat}` : null,
    organization.iban ? `IBAN: ${organization.iban}` : null,
  ].filter(Boolean) as string[];

  const clientLines = [
    client.company_name,
    client.street,
    client.postal_city,
  ].filter(Boolean) as string[];

  return (
    <Card className={cn("mx-auto max-w-[820px] border-border/60 bg-white text-[#0f172a] shadow-sm", className)}>
      <CardContent className="p-10">
        {/* Header */}
        <header className="flex items-start justify-between gap-8">
          <div className="flex min-h-[56px] items-center">
            {organization.logo_url ? (
              <img
                src={organization.logo_url}
                alt={organization.name ?? "Logo"}
                className="h-14 w-auto object-contain"
              />
            ) : (
              <div className="text-lg font-semibold tracking-tight">
                {organization.name}
              </div>
            )}
          </div>
          <address className="not-italic text-right text-sm leading-relaxed text-muted-foreground">
            {orgLines.map((l) => (
              <div key={l} className="text-foreground/90">{l}</div>
            ))}
            {contactLines.length > 0 && (
              <div className="mt-3">
                {contactLines.map((l) => (
                  <div key={l}>{l}</div>
                ))}
              </div>
            )}
            {legalLines.length > 0 && (
              <div className="mt-3">
                {legalLines.map((l) => (
                  <div key={l}>{l}</div>
                ))}
              </div>
            )}
          </address>
        </header>

        {/* Title + meta + client */}
        <section className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Factuur</h1>
            <dl className="mt-4 space-y-1 text-sm">
              {client.customer_number && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Klantnummer:</dt>
                  <dd>{client.customer_number}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Factuurnummer:</dt>
                <dd>{invoice_number}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Factuurdatum:</dt>
                <dd>{fmtDate(issue_date, language)}</dd>
              </div>
              {due_date && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Vervaldatum:</dt>
                  <dd>{fmtDate(due_date, language)}</dd>
                </div>
              )}
            </dl>
          </div>
          <address className="not-italic text-right text-sm leading-relaxed">
            {clientLines.map((l, i) => (
              <div key={i} className={i === 0 ? "font-semibold" : "text-foreground/90"}>
                {l}
              </div>
            ))}
          </address>
        </section>

        {/* Lines */}
        <section className="mt-10">
          <Table>
            <TableHeader>
              <TableRow className="border-b-2 border-border">
                <TableHead className="text-foreground">Datum</TableHead>
                <TableHead className="text-foreground">Aantal</TableHead>
                <TableHead className="text-foreground">Omschrijving</TableHead>
                <TableHead className="text-right text-foreground">Prijs per stuk</TableHead>
                <TableHead className="text-right text-foreground">Totaal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {totals.lines.map((l, i) => {
                const src = lines[i];
                const label = LINE_TYPE_LABELS[l.line_type];
                const isMeta = l.line_type !== "item";
                return (
                  <TableRow key={i} className={cn("odd:bg-muted/40", isMeta && "italic")}>
                    <TableCell className="text-muted-foreground">
                      {fmtDate(src?.date, language)}
                    </TableCell>
                    <TableCell className="tabular-nums">{l.quantity}</TableCell>
                    <TableCell>
                      {label && (
                        <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {label}
                        </span>
                      )}
                      {l.description}
                      {l.vat_rate !== default_vat_rate && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({l.vat_rate}% btw)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(normalizeLineCents(src))}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", l.subtotal_cents < 0 && "text-red-600")}>
                      {fmt(l.subtotal_cents)}
                    </TableCell>
                  </TableRow>
                );
              })}

              <TableRow className="bg-muted/40 border-t border-border">
                <TableCell colSpan={3} />
                <TableCell className="text-right text-muted-foreground">Totaal excl. btw</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(subtotal_cents)}</TableCell>
              </TableRow>

              {totals.vat_breakdown.length > 1
                ? totals.vat_breakdown.map((b) => (
                    <TableRow key={b.rate} className="bg-muted/40">
                      <TableCell colSpan={3} />
                      <TableCell className="text-right text-muted-foreground">
                        {b.rate}% btw over {fmt(b.base_cents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(b.vat_cents)}</TableCell>
                    </TableRow>
                  ))
                : (
                  <TableRow className="bg-muted/40">
                    <TableCell colSpan={3} />
                    <TableCell className="text-right text-muted-foreground">
                      {totals.vat_breakdown[0]?.rate ?? default_vat_rate}% btw
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(vat_cents)}</TableCell>
                  </TableRow>
                )}

              <TableRow className="bg-muted/40">
                <TableCell colSpan={3} />
                <TableCell className="text-right font-semibold">
                  Totaal incl. btw
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {fmt(total_cents)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>

        {/* Footer */}
        <footer className="mt-10 space-y-3 text-sm leading-relaxed text-muted-foreground">
          {footer_note ? (
            <p>{footer_note}</p>
          ) : (
            <p>
              Te betalen binnen{" "}
              <span className="text-foreground">{payment_days ?? 14}</span> dagen
              {due_date ? (
                <>
                  , voor <span className="text-foreground">{fmtDate(due_date, language)}</span>
                </>
              ) : null}
              {organization.iban ? (
                <>
                  , op rekeningnummer{" "}
                  <span className="text-foreground">{organization.iban}</span>
                </>
              ) : null}
              {organization.account_holder ? (
                <>
                  {" "}t.n.v. <span className="text-foreground">{organization.account_holder}</span>
                </>
              ) : null}
              {" "}onder vermelding van factuurnummer{" "}
              <span className="text-foreground">{invoice_number}</span>.
            </p>
          )}
          {payment_link_url && (
            <div className="flex items-start gap-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
              <div className="flex-1">
                <p>
                  💳 Direct online betalen:{" "}
                  <a href={payment_link_url} className="font-medium underline break-all">
                    {payment_link_url}
                  </a>
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  Totaal: {formatCents(total_cents, language, currency)} · Scan de QR-code met je bank-app
                </p>
              </div>
              <PaymentQrCode url={payment_link_url} />
            </div>
          )}
        </footer>

        <div className="mt-6 text-right text-xs text-muted-foreground">
          Bedragen in {currency}. Getoond totaal: {formatCents(total_cents, language, currency)} (
          {centsToEuros(total_cents).toFixed(2)}).
        </div>
      </CardContent>
    </Card>
  );
}

export default InvoiceTemplate;
