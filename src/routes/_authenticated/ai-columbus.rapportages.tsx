import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/ai-columbus/rapportages")({
  head: () => ({ meta: [{ title: "AI van Columbus — Rapportages" }] }),
  component: RapportagesPage,
});

function RapportagesPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rapportages</h1>
        <p className="text-sm text-muted-foreground">Exporteer en bekijk periodieke rapporten.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Maandoverzichten</CardTitle>
          <CardDescription>Hier komen rapporten over leads, conversies en verbruik.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Nog geen rapporten beschikbaar.</CardContent>
      </Card>
    </div>
  );
}
