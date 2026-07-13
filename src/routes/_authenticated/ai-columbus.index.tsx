import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, Users, Settings, ArrowRight, Workflow } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectRemindersCard } from "@/components/project-reminders-card";

export const Route = createFileRoute("/_authenticated/ai-columbus/")({
  head: () => ({ meta: [{ title: "AI van Columbus — Dashboard" }] }),
  component: AiColumbusDashboard,
});

const tiles = [
  {
    title: "Sales pipeline",
    description:
      "Volledige lead-funnel: van nieuw t/m gewonnen en verloren, met klantwensen, offerte en facturatie.",
    url: "/sales-workflow",
    icon: Workflow,
    featured: true,
  },
  { title: "Klanten", description: "Beheer klanten van AI van Columbus.", url: "/ai-columbus/klanten", icon: Users, featured: false },
  { title: "Projecten (uitvoering)", description: "Loop lopende projecten door.", url: "/ai-columbus/projecten", icon: Sparkles, featured: false },
  { title: "Instellingen", description: "Voorkeuren voor AI van Columbus.", url: "/ai-columbus/instellingen", icon: Settings, featured: false },
] as const;

function AiColumbusDashboard() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI van Columbus</h1>
        <p className="text-sm text-muted-foreground">Kies een onderdeel binnen deze omgeving.</p>
      </div>
      <ProjectRemindersCard />
      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.url} to={t.url} className="group">
            <Card
              className={`h-full transition-all hover:border-brand hover:shadow-md ${
                t.featured ? "border-brand/60 bg-brand/5" : ""
              }`}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <t.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="flex-1">{t.title}</CardTitle>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{t.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
