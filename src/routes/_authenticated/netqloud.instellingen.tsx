import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/netqloud/instellingen")({
  head: () => ({ meta: [{ title: "Netqloud — Instellingen" }] }),
  component: () => (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Instellingen — Netqloud</h1>
      <Card>
        <CardHeader>
          <CardTitle>Voorkeuren</CardTitle>
          <CardDescription>Hier komen straks de instellingen voor Netqloud.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Nog leeg.</CardContent>
      </Card>
    </div>
  ),
});
