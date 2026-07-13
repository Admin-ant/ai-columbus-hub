import { z } from "zod";

/**
 * Rounding & currency helpers voor factuur-berekeningen.
 *
 * Alle geldbedragen worden intern in **cents** (integer) bijgehouden.
 * Voor input/output naar de UI worden ze omgezet naar euro's met een
 * "round-half-away-from-zero" strategie, exact zoals Postgres met
 * `ROUND()` op numeric doet. Zo blijven totalen consistent tussen
 * database, InvoiceTemplate en PDF.
 */

/** Round-half-away-from-zero (bank/BTW-safe, zelfde als PostgreSQL ROUND). */
export function roundHalfAwayFromZero(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

export function eurosToCents(euros: number | string | null | undefined): number {
  const n = typeof euros === "string" ? Number(euros.replace(",", ".")) : Number(euros ?? 0);
  if (!Number.isFinite(n)) return 0;
  return roundHalfAwayFromZero(n * 100);
}

export function centsToEuros(cents: number | null | undefined): number {
  const n = Number(cents ?? 0);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

/** Formatteer een cents-bedrag als EUR string. */
export function formatCents(
  cents: number | null | undefined,
  lang: string = "nl",
  currency: string = "EUR",
): string {
  return new Intl.NumberFormat(lang === "en" ? "en-IE" : "nl-NL", {
    style: "currency",
    currency,
  }).format(centsToEuros(cents));
}

/** Line-input types (accepteert product, servicekosten, korting, verzending). */
export type LineKind = "item" | "service_fee" | "discount" | "shipping";

export interface LineInput {
  line_type?: LineKind;
  description: string;
  quantity: number;
  unit_price_cents: number;
  vat_rate: number;
}

export interface LineTotals extends LineInput {
  line_type: LineKind;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
}

export interface InvoiceTotals {
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  /** Per BTW-tarief samengevat, gesorteerd oplopend op tarief. */
  vat_breakdown: Array<{ rate: number; base_cents: number; vat_cents: number }>;
  lines: LineTotals[];
}

/**
 * Bereken factuurregels + totalen deterministisch. Gebruikt round-half-away-from-zero
 * per regel (zelfde als DB en jsPDF), zodat het opgeslagen totaal exact
 * matcht met wat de UI/PDF laat zien.
 */
export function computeInvoiceTotals(lines: LineInput[]): InvoiceTotals {
  const computed: LineTotals[] = lines.map((l) => {
    const kind: LineKind = l.line_type ?? "item";
    const qty = Number(l.quantity ?? 0);
    const price = Number(l.unit_price_cents ?? 0);
    const rate = Math.max(0, Math.min(30, Number(l.vat_rate ?? 0)));
    // Korting: negatief bedrag
    const sign = kind === "discount" ? -1 : 1;
    const subtotal = sign * roundHalfAwayFromZero(qty * price);
    const vat = roundHalfAwayFromZero((subtotal * rate) / 100);
    return {
      line_type: kind,
      description: l.description,
      quantity: qty,
      unit_price_cents: price,
      vat_rate: rate,
      subtotal_cents: subtotal,
      vat_cents: vat,
      total_cents: subtotal + vat,
    };
  });

  const subtotal_cents = computed.reduce((s, l) => s + l.subtotal_cents, 0);
  const vat_cents = computed.reduce((s, l) => s + l.vat_cents, 0);
  const total_cents = subtotal_cents + vat_cents;

  // BTW-uitsplitsing per tarief
  const byRate = new Map<number, { base_cents: number; vat_cents: number }>();
  computed.forEach((l) => {
    const bucket = byRate.get(l.vat_rate) ?? { base_cents: 0, vat_cents: 0 };
    bucket.base_cents += l.subtotal_cents;
    bucket.vat_cents += l.vat_cents;
    byRate.set(l.vat_rate, bucket);
  });
  const vat_breakdown = Array.from(byRate.entries())
    .filter(([, v]) => v.base_cents !== 0 || v.vat_cents !== 0)
    .sort(([a], [b]) => a - b)
    .map(([rate, v]) => ({ rate, ...v }));

  return { subtotal_cents, vat_cents, total_cents, vat_breakdown, lines: computed };
}

/* -------------------------------------------------------------------------- */
/*  Zod-validatie voor formulieren en server functions                        */
/* -------------------------------------------------------------------------- */

/** Accepteert `12,50` of `12.50` en zet om naar cents (integer). */
export const currencyEurosToCents = z
  .union([z.string(), z.number()])
  .transform((v) => {
    const n = typeof v === "string" ? Number(v.replace(/\s/g, "").replace(",", ".")) : v;
    if (!Number.isFinite(n)) return NaN;
    return roundHalfAwayFromZero(n * 100);
  })
  .refine((n) => Number.isFinite(n), { message: "Ongeldig bedrag" })
  .refine((n) => n >= 0, { message: "Bedrag mag niet negatief zijn" })
  .refine((n) => n <= 100_000_000_00, { message: "Bedrag is te groot" });

export const currencyCents = z
  .number()
  .int({ message: "Bedrag moet in hele centen" })
  .min(-100_000_000_00)
  .max(100_000_000_00);

export const vatRate = z
  .number()
  .min(0, { message: "BTW-tarief mag niet negatief zijn" })
  .max(30, { message: "BTW-tarief lijkt onrealistisch" });

export const lineTypeEnum = z.enum(["item", "service_fee", "discount", "shipping"]);

export const invoiceLineSchema = z.object({
  line_type: lineTypeEnum.optional().default("item"),
  description: z.string().trim().min(1, "Omschrijving is verplicht").max(1000),
  quantity: z.number().positive("Aantal moet positief zijn").max(1_000_000),
  unit_price_cents: currencyCents,
  vat_rate: vatRate,
});

export type InvoiceLineInput = z.infer<typeof invoiceLineSchema>;
