import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Mic } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { DashboardOverview } from "@/components/dashboard-overview";
import { MonthlyPipelinePanel } from "@/components/monthly-pipeline-panel";
import type { PeriodKey } from "@/lib/dashboard-period";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Overzicht — AI van Columbus" }] }),
  component: Index,
});

function Index() {
  const { user } = useAuth();
  const { currentOrganizationId, currentOrganization } = useWorkspace();
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const name =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "collega";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="grid gap-4 sm:flex sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">Overzicht</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Welkom terug, {name}. Financieel overzicht voor{" "}
            {currentOrganization?.name ?? "je organisatie"}.
          </p>
        </div>
        <Button asChild size="lg" className="w-full shrink-0 gap-2 sm:w-auto">
          <Link to="/opname">
            <Mic className="h-5 w-5" />
            Opname
          </Link>
        </Button>
      </div>

      <DashboardOverview
        organizationId={currentOrganizationId}
        period={period}
        onPeriodChange={setPeriod}
      />

      <MonthlyPipelinePanel
        organizationId={currentOrganizationId}
        period={period}
      />
    </div>
  );
}
