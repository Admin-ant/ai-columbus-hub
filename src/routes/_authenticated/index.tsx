import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, FileText, Users, ArrowRight, Lock, LayoutDashboard, Cloud } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth, type AppRole } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Overzicht — AI van Columbus" }] }),
  component: Index,
});

type Tile = {
  title: string;
  description: string;
  url: string;
  icon: typeof LayoutDashboard;
  requiredRole?: AppRole;
};

const tiles: Tile[] = [
  {
    title: "AI van Columbus",
    description: "Leads funnel, AI-tools en assistenten van Columbus.",
    url: "/ai-columbus",
    icon: Sparkles,
  },
  {
    title: "Netqloud",
    description: "Klanten, servers en instellingen van Netqloud.",
    url: "/netqloud",
    icon: Cloud,
  },
  {
    title: "Teams",
    description: "Teamoverzicht en interne samenwerking.",
    url: "/teams",
    icon: Users,
  },
  {
    title: "Administratie",
    description: "Klanten, contracten en administratieve processen.",
    url: "/administratie",
    icon: FileText,
    requiredRole: "admin",
  },
];

function Index() {
  const { user, hasRole } = useAuth();
  const name = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "collega";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welkom bij AI van Columbus, {name}</h1>
        <p className="mt-2 text-muted-foreground">
          Kies hieronder een onderdeel. Sommige onderdelen zijn alleen toegankelijk voor admins.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((tile) => {
          const locked = !!tile.requiredRole && !hasRole(tile.requiredRole);
          if (locked) {
            return (
              <Card key={tile.url} className="opacity-60">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <tile.icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="flex-1">{tile.title}</CardTitle>
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>Alleen voor admins.</CardDescription>
                </CardContent>
              </Card>
            );
          }
          return (
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
          );
        })}
      </div>
    </div>
  );
}
