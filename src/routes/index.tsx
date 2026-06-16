import { createFileRoute, Link } from "@tanstack/react-router";
import { Cloud, Sparkles, FileText, Users, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overzicht — Columbus AI Portaal" },
      { name: "description", content: "Centraal overzicht van alle interne tools en afdelingen." },
    ],
  }),
  component: Index,
});

const tiles = [
  {
    title: "Netqloud",
    description: "Cloud-infrastructuur, monitoring en beheer van de Netqloud-omgeving.",
    url: "/netqloud",
    icon: Cloud,
  },
  {
    title: "AI van Columbus",
    description: "AI-tools, modellen en assistenten ontwikkeld binnen Columbus.",
    url: "/ai-columbus",
    icon: Sparkles,
  },
  {
    title: "Administratie",
    description: "Documenten, facturen en administratieve processen.",
    url: "/administratie",
    icon: FileText,
  },
  {
    title: "Teams",
    description: "Teamoverzicht, contactpersonen en interne samenwerking.",
    url: "/teams",
    icon: Users,
  },
] as const;

function Index() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welkom bij het Columbus AI Portaal</h1>
        <p className="mt-2 text-muted-foreground">
          Eén centrale plek voor iedereen die bij Columbus werkt. Kies hieronder een onderdeel om te beginnen.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((tile) => (
          <Link key={tile.url} to={tile.url} className="group">
            <Card className="h-full transition-all hover:border-primary hover:shadow-md">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <tile.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="flex-1">{tile.title}</CardTitle>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{tile.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
