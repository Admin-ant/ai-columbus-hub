import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, Users, Settings, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/ai-columbus/")({
  head: () => ({ meta: [{ title: "AI van Columbus — Dashboard" }] }),
  component: AiColumbusDashboard,
});

const tiles = [
  { title: "Leads funnel", description: "Beheer leads en verkoopfases.", url: "/ai-columbus/leads", icon: Sparkles },
  { title: "Teams", description: "Interne teams en samenwerking.", url: "/teams", icon: Users },
  { title: "Instellingen", description: "Voorkeuren voor AI van Columbus.", url: "/ai-columbus/instellingen", icon: Settings },
] as const;

function AiColumbusDashboard() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI van Columbus</h1>
        <p className="text-sm text-muted-foreground">Kies een onderdeel binnen deze omgeving.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.url} to={t.url} className="group">
            <Card className="h-full transition-all hover:border-primary hover:shadow-md">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
