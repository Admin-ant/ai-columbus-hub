// Free Dutch address lookup via PDOK Locatieserver (no API key needed)
// Docs: https://api.pdok.nl/bzk/locatieserver/search/v3_1/ui

export type PdokSuggestion = {
  id: string;
  label: string; // formatted display
  type: string; // "adres" | "postcode" | "weg" | "woonplaats" | ...
};

export type PdokAddress = {
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  province: string | null;
  country: string;
  address_line1: string | null;
};

const BASE = "https://api.pdok.nl/bzk/locatieserver/search/v3_1";

export async function pdokSuggest(query: string, signal?: AbortSignal): Promise<PdokSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = `${BASE}/suggest?q=${encodeURIComponent(q)}&fq=type:(adres OR postcode OR weg)&rows=8`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const body = await res.json();
  const docs = body?.response?.docs ?? [];
  return docs.map((d: { id: string; weergavenaam: string; type: string }) => ({
    id: d.id,
    label: d.weergavenaam,
    type: d.type,
  }));
}

export async function pdokLookup(id: string, signal?: AbortSignal): Promise<PdokAddress | null> {
  const url = `${BASE}/lookup?id=${encodeURIComponent(id)}&fl=*`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const body = await res.json();
  const doc = body?.response?.docs?.[0];
  if (!doc) return null;
  const street: string | null = doc.straatnaam ?? doc.openbareruimte ?? null;
  const nr: string | null = doc.huisnummer != null ? String(doc.huisnummer) : null;
  const nrToev: string = [doc.huisletter, doc.huisnummertoevoeging].filter(Boolean).join("");
  const houseNumber = nr ? nr + (nrToev ? ` ${nrToev}` : "") : null;
  const addressLine1 = street ? [street, houseNumber].filter(Boolean).join(" ").trim() : null;
  return {
    street,
    house_number: houseNumber,
    postal_code: doc.postcode ?? null,
    city: doc.woonplaatsnaam ?? null,
    province: doc.provincienaam ?? null,
    country: "Nederland",
    address_line1: addressLine1,
  };
}
