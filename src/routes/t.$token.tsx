import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getPublicTemplatePreview } from "@/lib/studio-public.functions";
import type {
  StudioPackage,
  StudioSection,
  StudioTheme,
} from "@/lib/offerte-studio";

type TemplateData = {
  template: {
    id: string;
    name: string;
    description: string | null;
    cover_image_url: string | null;
    theme: StudioTheme;
    sections: StudioSection[];
    packages: StudioPackage[];
    preview_token_expires_at: string | null;
  };
  organization: { name: string; logo_url: string | null; brand_color: string | null } | null;
};

const previewQuery = (token: string) =>
  queryOptions({
    queryKey: ["template-preview", token],
    queryFn: () => getPublicTemplatePreview({ data: { token } }) as Promise<TemplateData>,
    staleTime: 60_000,
  });

export const Route = createFileRoute("/t/$token")({
  head: () => ({
    meta: [
      { title: "Sjabloon preview" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(previewQuery(params.token));
    } catch {
      throw notFound();
    }
  },
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-black p-6 text-center text-white/70">
      <div>
        <div className="text-lg font-semibold text-white">Preview niet beschikbaar</div>
        <div className="mt-1 text-sm">Deze link is verlopen of ingetrokken.</div>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center bg-black p-6 text-center text-white/70">
      <div>
        <div className="text-lg font-semibold text-white">Preview niet beschikbaar</div>
        <div className="mt-1 text-sm">{error.message}</div>
      </div>
    </div>
  ),
  component: TemplatePreviewPage,
});

function TemplatePreviewPage() {
  const { token } = Route.useParams();
  const { data } = useSuspenseQuery(previewQuery(token));
  const { template: t, organization: org } = data;
  const accent = t.theme.accent;
  const expires = t.preview_token_expires_at ? new Date(t.preview_token_expires_at) : null;

  return (
    <div
      className="min-h-screen"
      style={{ background: t.theme.bg, color: t.theme.fg }}
    >
      <div
        className="sticky top-0 z-10 flex items-center justify-between border-b px-4 py-2 text-[11px] backdrop-blur"
        style={{
          borderColor: "rgba(255,255,255,0.08)",
          background: "rgba(0,0,0,0.55)",
          color: "rgba(255,255,255,0.7)",
        }}
      >
        <div className="flex items-center gap-2">
          {org?.logo_url && (
            <img src={org.logo_url} alt="" className="h-5 w-5 rounded" />
          )}
          <span>{org?.name ?? "Preview"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider"
            style={{ background: `${accent}26`, color: accent }}
          >
            Preview
          </span>
          {expires && (
            <span className="hidden sm:inline">
              Verloopt {expires.toLocaleString("nl-NL")}
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-3xl">
        <div
          className="relative flex min-h-[320px] flex-col justify-end px-6 py-10"
          style={{
            background: t.cover_image_url
              ? `linear-gradient(180deg, rgba(0,0,0,0.3), rgba(0,0,0,0.75)), url(${t.cover_image_url}) center/cover`
              : `radial-gradient(circle at 80% 10%, ${accent}33, transparent 55%), #0d0d0d`,
          }}
        >
          <div className="text-[10px] uppercase tracking-[0.25em]" style={{ color: accent }}>
            Sjabloon
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
            {t.name}
          </h1>
          {t.description && (
            <p className="mt-2 text-sm text-white/70">{t.description}</p>
          )}
        </div>

        {(t.sections ?? []).map((s) => (
          <section
            key={s.key}
            className="border-b px-6 py-8"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            <div className="text-[10px] uppercase tracking-[0.25em]" style={{ color: accent }}>
              {s.label}
            </div>
            <h2 className="mt-2 text-xl font-semibold text-white">{s.heading}</h2>
            {s.body && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/80">
                {s.body}
              </p>
            )}
          </section>
        ))}

        {(t.packages ?? []).length > 0 && (
          <div className="px-6 py-8">
            <div className="text-[10px] uppercase tracking-[0.25em]" style={{ color: accent }}>
              Pakketten
            </div>
            <div className="mt-3 grid gap-3">
              {t.packages.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border p-4"
                  style={{
                    borderColor: p.highlighted ? accent : "rgba(255,255,255,0.1)",
                    background: p.highlighted ? `${accent}14` : "rgba(255,255,255,0.02)",
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-sm font-semibold text-white">{p.name}</div>
                    <div className="text-sm font-semibold" style={{ color: accent }}>
                      € {p.price_eur.toLocaleString("nl-NL")}{" "}
                      <span className="text-[10px] font-normal text-white/50">{p.billing}</span>
                    </div>
                  </div>
                  {p.features.filter(Boolean).length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-white/70">
                      {p.features.filter(Boolean).map((f, i) => (
                        <li key={i}>• {f}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          className="px-6 py-6 text-center text-[11px]"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          Alleen-lezen preview — geen account vereist.
        </div>
      </div>
    </div>
  );
}
