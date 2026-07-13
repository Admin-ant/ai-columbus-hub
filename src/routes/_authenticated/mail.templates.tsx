import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, LayoutTemplate } from "lucide-react";
import { TemplatesManager } from "@/components/outreach/templates-manager";
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/_authenticated/mail/templates")({
  head: () => ({ meta: [{ title: "E-mail templates — Beheer" }] }),
  component: MailTemplatesPage,
});

function MailTemplatesPage() {
  const { currentOrganizationId, currentOrganization } = useWorkspace();

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-[1400px] space-y-6 p-4">
        <div>
          <Link
            to="/mail"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Terug naar Mail
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
            <LayoutTemplate className="h-6 w-6 text-brand" />
            Templatebeheer
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentOrganization?.name ?? ""} — gedeelde e-mail-, LinkedIn- en WhatsApp-sjablonen.
            Sjablonen die je hier opslaat zijn direct beschikbaar in <em>Mail opstellen</em> én in het
            e-maildialoog van een factuur.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
          <TemplatesManager organizationId={currentOrganizationId ?? null} />
        </div>
      </div>
    </div>
  );
}
