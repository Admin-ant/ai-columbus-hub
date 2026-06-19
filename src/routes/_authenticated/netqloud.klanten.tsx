import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/netqloud/klanten")({
  head: () => ({ meta: [{ title: "Netqloud — Klanten" }] }),
  component: () => (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Netqloud klanten</h1>
      <Card>
        <CardHeader>
          <CardTitle>Klantenoverzicht</CardTitle>
          <CardDescription>Hier komt het klantenoverzicht voor Netqloud.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Nog geen klanten toegevoegd.</CardContent>
      </Card>
    </div>
  ),
});
