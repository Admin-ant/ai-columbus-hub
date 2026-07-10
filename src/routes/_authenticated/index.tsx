import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { DashboardOverview } from "@/components/dashboard-overview";
import { MonthlyPipelinePanel } from "@/components/monthly-pipeline-panel";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Overzicht — AI van Columbus" }] }),
  component: Index,
});

function Index() {
  const { user } = useAuth();
  const { currentOrganizationId, currentOrganization } = useWorkspace();
  const name =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "collega";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overzicht</h1>
        <p className="mt-1 text-muted-foreground">
          Welkom terug, {name}. Financieel overzicht voor{" "}
          {currentOrganization?.name ?? "je organisatie"}.
        </p>
      </div>

      <DashboardOverview organizationId={currentOrganizationId} />

      <MonthlyPipelinePanel organizationId={currentOrganizationId} />
    </div>
  );
}
