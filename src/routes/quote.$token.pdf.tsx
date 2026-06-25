import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo } from "react";
import { getPublicQuote } from "@/lib/public-quote.functions";
import { sanitizeSignatureSvg } from "@/lib/signature-svg";

export const Route = createFileRoute("/quote/$token/pdf")({
  head: () => ({
    meta: [
      { title: "Offerte PDF" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: QuotePrintPage,
});

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

function QuotePrintPage() {
  const { token } = Route.useParams();
  const getFn = useServerFn(getPublicQuote);
  const { data, isLoading, error } = useQuery({
    queryKey: ["quote-pdf", token],
    queryFn: () => getFn({ data: { token } }),
    retry: false,
  });
  const eur = useMemo(
    () => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }),
    [],
  );

  useEffect(() => {
    if (data) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [data]);

  if (isLoading) return <div className="p-10 text-sm text-muted-foreground">Laden…</div>;
  if (error || !data) return <div className="p-10 text-sm text-red-600">Offerte niet gevonden.</div>;

  const { quote, organization } = data;
  const lines = ((quote.content_json as { lines?: LineItem[] } | null)?.lines ?? []) as LineItem[];
  const brand = organization?.brand_color ?? "#0f172a";

  return (
    <div className="mx-auto max-w-[800px] bg-white p-10 text-[#0f172a] print:p-0">
      <style>{`@page { size: A4; margin: 18mm 16mm; } @media print { .no-print { display:none } body{background:#fff} }`}</style>

      <header className="mb-8 flex items-start justify-between border-b-4 pb-4" style={{ borderColor: brand }}>
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500">{organization?.name}</div>
          <h1 className="mt-1 text-3xl font-bold">{quote.title}</h1>
          <div className="mt-1 text-sm text-gray-500">
            Uitgegeven op {new Date(quote.created_at).toLocaleDateString("nl-NL")}
          </div>
        </div>
        {organization?.logo_url ? (
          <img src={organization.logo_url} alt="" className="h-12 w-auto" />
        ) : null}
      </header>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-gray-500">
            <th className="py-2">Omschrijving</th>
            <th className="py-2 text-right">Aantal</th>
            <th className="py-2 text-right">Prijs</th>
            <th className="py-2 text-right">Totaal</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b align-top">
              <td className="py-3">{l.description || "—"}</td>
              <td className="py-3 text-right tabular-nums">{l.quantity}</td>
              <td className="py-3 text-right tabular-nums">{eur.format(Number(l.unit_price ?? 0))}</td>
              <td className="py-3 text-right tabular-nums">
                {eur.format(Number(l.quantity ?? 0) * Number(l.unit_price ?? 0))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 flex justify-end">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between border-t pt-3 text-base font-semibold">
            <span>Totaal</span>
            <span className="tabular-nums">{eur.format(Number(quote.total_amount ?? 0))}</span>
          </div>
        </div>
      </div>

      {(quote.accepted_at || quote.signature_svg) && (
        <section className="mt-10 rounded-md border p-4">
          <div className="mb-2 text-xs uppercase tracking-wider text-gray-500">Ondertekening</div>
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="text-gray-500">Naam ondertekenaar</div>
              <div className="font-medium">{quote.accepted_by_name ?? "—"}</div>
              <div className="mt-3 text-gray-500">Datum</div>
              <div className="font-medium">
                {quote.signed_at ? new Date(quote.signed_at).toLocaleString("nl-NL") : "—"}
              </div>
              <div className="mt-3 text-gray-500">Akkoord met voorwaarden</div>
              <div className="font-medium">Ja, geaccepteerd op{" "}
                {quote.signed_at ? new Date(quote.signed_at).toLocaleString("nl-NL") : "—"}
              </div>
            </div>
            <div>
              <div className="mb-1 text-gray-500">Handtekening</div>
              {quote.signature_svg ? (
                <div
                  className="rounded border bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: quote.signature_svg }}
                />
              ) : (
                <div className="text-gray-400">—</div>
              )}
            </div>
          </div>
        </section>
      )}

      <footer className="mt-10 text-xs text-gray-400">
        {organization?.name} · Offerte ID {quote.id}
      </footer>

      <div className="no-print mt-6 flex justify-center">
        <button
          onClick={() => window.print()}
          className="rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ background: brand }}
        >
          Download / Print PDF
        </button>
      </div>
    </div>
  );
}
