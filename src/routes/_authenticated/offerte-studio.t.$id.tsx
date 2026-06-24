import { createFileRoute } from "@tanstack/react-router";
import { OfferteStudioEditor } from "@/components/offerte-studio-editor";

export const Route = createFileRoute("/_authenticated/offerte-studio/t/$id")({
  head: () => ({ meta: [{ title: "Sjabloon bewerken" }] }),
  component: TemplateEditorPage,
});

function TemplateEditorPage() {
  const { id } = Route.useParams();
  return <OfferteStudioEditor kind="template" id={id} />;
}
