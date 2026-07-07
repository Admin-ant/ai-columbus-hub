import { createFileRoute } from "@tanstack/react-router";
import { Receipt } from "lucide-react";

import { ExpensesTab } from "@/components/expenses-tab";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/_authenticated/inkoopfacturen")({
  head: () => ({
    meta: [
      { title: "Inkoopfacturen" },
      {
        name: "description",
        content:
          "Voer inkoopfacturen in, koppel bijlagen en boek ze door naar de administratie.",
      },
    ],
  }),
  component: InkoopfacturenPage,
});

function InkoopfacturenPage() {
  const { user } = useAuth();
  const { currentOrganization } = useWorkspace();

  if (!currentOrganization) {
    return (
      <div className="mx-auto max-w-md py-20 text-center text-sm text-muted-foreground">
        Selecteer eerst een organisatie in de zijbalk.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Receipt className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inkoopfacturen</h1>
          <p className="text-sm text-muted-foreground">
            Voer leveranciersfacturen in, upload de PDF als bijlage en boek ze
            door naar het grootboek.
          </p>
        </div>
      </div>

      <ExpensesTab orgId={currentOrganization.id} userId={user?.id ?? null} />
    </div>
  );
}
