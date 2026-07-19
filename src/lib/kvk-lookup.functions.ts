import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type KvkLookupResult = {
  name: string | null;
  kvk_number: string | null;
  trade_names: string[];
  legal_form: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
};

type BasisprofielResponse = {
  kvkNummer?: string;
  naam?: string;
  handelsnamen?: Array<{ naam?: string }>;
  formeleRegistratiedatum?: string;
  _embedded?: {
    hoofdvestiging?: {
      websites?: string[];
      adressen?: Array<{
        type?: string;
        straatnaam?: string;
        huisnummer?: number | string;
        huisnummerToevoeging?: string;
        postcode?: string;
        plaats?: string;
        land?: string;
      }>;
    };
    eigenaar?: {
      rechtsvorm?: string;
    };
  };
};

export const lookupKvk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { kvkNumber: string }) => {
    const raw = String(data?.kvkNumber ?? "").replace(/\s+/g, "");
    if (!/^[0-9]{8}$/.test(raw)) throw new Error("KvK-nummer moet 8 cijfers zijn");
    return { kvkNumber: raw };
  })
  .handler(async ({ data }): Promise<KvkLookupResult> => {
    const apiKey = process.env.KVK_API_KEY;
    if (!apiKey) throw new Error("KVK_API_KEY is niet geconfigureerd");

    const url = `https://api.kvk.nl/api/v1/basisprofielen/${data.kvkNumber}?geoData=false`;
    const res = await fetch(url, { headers: { apikey: apiKey, Accept: "application/hal+json" } });

    if (res.status === 404) throw new Error("KvK-nummer niet gevonden");
    if (res.status === 401 || res.status === 403) throw new Error("KvK API-key ongeldig of geen toegang");
    if (!res.ok) throw new Error(`KvK API fout (${res.status})`);

    const body = (await res.json()) as BasisprofielResponse;
    const hv = body._embedded?.hoofdvestiging;
    const bezoek = hv?.adressen?.find((a) => a?.type === "bezoekadres") ?? hv?.adressen?.[0];

    const straat = bezoek?.straatnaam ?? "";
    const nummer = bezoek?.huisnummer != null ? String(bezoek.huisnummer) : "";
    const toev = bezoek?.huisnummerToevoeging ?? "";
    const addressLine1 = [straat, [nummer, toev].filter(Boolean).join("")].filter(Boolean).join(" ").trim() || null;

    return {
      name: body.naam ?? body.handelsnamen?.[0]?.naam ?? null,
      kvk_number: body.kvkNummer ?? data.kvkNumber,
      trade_names: (body.handelsnamen ?? []).map((h) => h.naam ?? "").filter(Boolean),
      legal_form: body._embedded?.eigenaar?.rechtsvorm ?? null,
      address_line1: addressLine1,
      postal_code: bezoek?.postcode ?? null,
      city: bezoek?.plaats ?? null,
      country: bezoek?.land ?? "Nederland",
      website: hv?.websites?.[0] ?? null,
    };
  });
