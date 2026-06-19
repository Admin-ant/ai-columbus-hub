import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/ai-columbus/modellen")({
  head: () => ({ meta: [{ title: "AI van Columbus — Modellen & gebruik" }] }),
  component: ModellenPage,
});

function ModellenPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Modellen & gebruik</h1>
        <p className="text-sm text-muted-foreground">Overzicht van gebruikte AI-modellen en verbruik.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Verbruik per model</CardTitle>
          <CardDescription>Tokens, kosten en aantal aanvragen verschijnen hier zodra metingen beschikbaar zijn.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Nog geen data.</CardContent>
      </Card>
    </div>
  );
}
