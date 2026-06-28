import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileText } from "lucide-react";
import { TemplatesManager } from "@/components/outreach/templates-manager";
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/_authenticated/outreach/templates")({
  head: () => ({ meta: [{ title: "Mail templates" }] }),
  component: OutreachTemplatesPage,
});

function OutreachTemplatesPage() {
  const { currentOrganizationId, currentOrganization } = useWorkspace();
  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link
              to="/outreach"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Terug naar pipeline
            </Link>
            <h1 className="mt-1 text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-6 w-6" style={{ color: "var(--primary)" }} />
              Mail templates
            </h1>
            <p className="text-sm text-muted-foreground">
              {currentOrganization?.name ?? ""} — beheer e-mail, LinkedIn en WhatsApp sjablonen
            </p>
          </div>
        </div>
        <TemplatesManager organizationId={currentOrganizationId} />
      </div>
    </div>
  );
}
