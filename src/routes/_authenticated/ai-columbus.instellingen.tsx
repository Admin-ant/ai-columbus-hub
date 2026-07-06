import { createFileRoute, Link } from "@tanstack/react-router";
import { Link2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/ai-columbus/instellingen")({
  head: () => ({ meta: [{ title: "AI van Columbus — Instellingen" }] }),
  component: () => (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Instellingen — AI van Columbus</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Koppelingen
          </CardTitle>
          <CardDescription>
            Verbind Columbus Portaal en inzet.nl. Factureerbare acties in die portalen
            komen dan automatisch hier binnen als factuur, offerte of klant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm">
            <Link to="/ai-columbus/koppelingen">
              Open koppelingen <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Voorkeuren</CardTitle>
          <CardDescription>Overige instellingen voor deze omgeving.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Nog leeg.</CardContent>
      </Card>
    </div>
  ),
});
