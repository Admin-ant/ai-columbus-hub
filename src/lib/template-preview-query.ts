import { queryOptions } from "@tanstack/react-query";
import { getPublicTemplatePreview } from "@/lib/studio-public.functions";
import type { StudioPackage, StudioSection, StudioTheme } from "@/lib/offerte-studio";

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

export const templatePreviewQuery = (token: string) =>
  queryOptions({
    queryKey: ["template-preview", token],
    queryFn: () => getPublicTemplatePreview({ data: { token } }) as unknown as Promise<TemplateData>,
    staleTime: 60_000,
  });