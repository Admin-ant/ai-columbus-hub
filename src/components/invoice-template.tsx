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

export interface InvoiceTemplateLine {
  date?: string | null;
  quantity: number;
  description: string;
  unit_price: number;
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
  vat_rate?: number;
  lines: InvoiceTemplateLine[];
  footer_note?: string | null;
  className?: string;
}

const eur = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
});

const fmtDate = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("nl-NL");
};

export function InvoiceTemplate({
  organization,
  client,
  invoice_number,
  issue_date,
  due_date,
  payment_days,
  vat_rate = 21,
  lines,
  footer_note,
  className,
}: InvoiceTemplateProps) {
  const subtotal = lines.reduce(
    (sum, l) => sum + Number(l.quantity ?? 0) * Number(l.unit_price ?? 0),
    0,
  );
  const vat = subtotal * (vat_rate / 100);
  const total = subtotal + vat;

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
    <Card className={cn("mx-auto max-w-[820px] border-border/60 shadow-sm", className)}>
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
              <div className="text-lg font-semibold tracking-tight text-foreground">
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
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Factuur</h1>
            <dl className="mt-4 space-y-1 text-sm">
              {client.customer_number && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Klantnummer:</dt>
                  <dd className="text-foreground">{client.customer_number}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Factuurnummer:</dt>
                <dd className="text-foreground">{invoice_number}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Factuurdatum:</dt>
                <dd className="text-foreground">{fmtDate(issue_date)}</dd>
              </div>
            </dl>
          </div>
          <address className="not-italic text-right text-sm leading-relaxed">
            {clientLines.map((l, i) => (
              <div key={i} className={i === 0 ? "font-semibold text-foreground" : "text-foreground/90"}>
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
              {lines.map((l, i) => (
                <TableRow key={i} className="odd:bg-muted/40">
                  <TableCell className="text-muted-foreground">{fmtDate(l.date)}</TableCell>
                  <TableCell className="tabular-nums">{l.quantity}</TableCell>
                  <TableCell>{l.description}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {eur.format(Number(l.unit_price ?? 0))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {eur.format(Number(l.quantity ?? 0) * Number(l.unit_price ?? 0))}
                  </TableCell>
                </TableRow>
              ))}

              <TableRow className="bg-muted/40 border-t border-border">
                <TableCell colSpan={3} />
                <TableCell className="text-right text-muted-foreground">Totaal excl. btw</TableCell>
                <TableCell className="text-right tabular-nums">{eur.format(subtotal)}</TableCell>
              </TableRow>
              <TableRow className="bg-muted/40">
                <TableCell colSpan={3} />
                <TableCell className="text-right text-muted-foreground">{vat_rate}% btw</TableCell>
                <TableCell className="text-right tabular-nums">{eur.format(vat)}</TableCell>
              </TableRow>
              <TableRow className="bg-muted/40">
                <TableCell colSpan={3} />
                <TableCell className="text-right font-semibold text-foreground">
                  Totaal incl. btw
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-foreground">
                  {eur.format(total)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>

        {/* Footer */}
        <footer className="mt-10 text-sm leading-relaxed text-muted-foreground">
          {footer_note ? (
            <p>{footer_note}</p>
          ) : (
            <p>
              Te betalen binnen{" "}
              <span className="text-foreground">{payment_days ?? 14}</span> dagen
              {due_date ? (
                <>
                  , voor <span className="text-foreground">{fmtDate(due_date)}</span>
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
              {" "}onder vermelding van klantnummer en factuurnummer.
            </p>
          )}
        </footer>
      </CardContent>
    </Card>
  );
}

export default InvoiceTemplate;
