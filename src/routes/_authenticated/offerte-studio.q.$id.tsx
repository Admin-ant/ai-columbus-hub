import { createFileRoute } from "@tanstack/react-router";
import { OfferteStudioEditor } from "@/components/offerte-studio-editor";

export const Route = createFileRoute("/_authenticated/offerte-studio/q/$id")({
  head: () => ({ meta: [{ title: "Offerte bewerken" }] }),
  component: QuoteEditorPage,
});

function QuoteEditorPage() {
  const { id } = Route.useParams();
  return <OfferteStudioEditor kind="quote" id={id} />;
}
