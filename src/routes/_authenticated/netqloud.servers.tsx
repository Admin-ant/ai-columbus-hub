import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/netqloud/servers")({
  head: () => ({ meta: [{ title: "Netqloud — Servers" }] }),
  component: () => (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Netqloud servers</h1>
      <Card>
        <CardHeader>
          <CardTitle>Serveroverzicht</CardTitle>
          <CardDescription>Overzicht van actieve servers volgt.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Nog leeg.</CardContent>
      </Card>
    </div>
  ),
});
