import { createFileRoute, Link } from "@tanstack/react-router";
import { Cloud, Server, Users, Settings, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/netqloud/")({
  head: () => ({ meta: [{ title: "Netqloud — Dashboard" }] }),
  component: NetqloudDashboard,
});

const tiles = [
  { title: "Klanten", description: "Beheer Netqloud klanten en abonnementen.", url: "/netqloud/klanten", icon: Users },
  { title: "Servers", description: "Overzicht van actieve servers en services.", url: "/netqloud/servers", icon: Server },
  { title: "Instellingen", description: "Configuratie van de Netqloud-omgeving.", url: "/netqloud/instellingen", icon: Settings },
] as const;

function NetqloudDashboard() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Cloud className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Netqloud</h1>
          <p className="text-sm text-muted-foreground">Eigen omgeving voor alles rondom Netqloud.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.url} to={t.url} className="group">
            <Card className="h-full transition-all hover:border-brand hover:shadow-md">
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
