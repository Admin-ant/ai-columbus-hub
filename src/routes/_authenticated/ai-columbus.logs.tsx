import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/ai-columbus/logs")({
  head: () => ({ meta: [{ title: "AI van Columbus — Logs" }] }),
  component: LogsPage,
});

function LogsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Logs</h1>
        <p className="text-sm text-muted-foreground">Activiteit en systeem-logs binnen AI van Columbus.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recente activiteit</CardTitle>
          <CardDescription>Hier verschijnen requests, fouten en audit-events.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Nog geen logs.</CardContent>
      </Card>
    </div>
  );
}
