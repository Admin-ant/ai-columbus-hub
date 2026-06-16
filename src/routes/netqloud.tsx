import { createFileRoute } from "@tanstack/react-router";
import { Cloud, Server, Activity, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/netqloud")({
  head: () => ({
    meta: [
      { title: "Netqloud — Columbus AI Portaal" },
      { name: "description", content: "Cloud-infrastructuur en beheer van Netqloud." },
    ],
  }),
  component: NetqloudPage,
});

const sections = [
  { title: "Servers", description: "Status en beheer van actieve servers.", icon: Server },
  { title: "Monitoring", description: "Realtime monitoring en logging.", icon: Activity },
  { title: "Beveiliging", description: "Toegangsbeheer en security policies.", icon: Shield },
];

function NetqloudPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Cloud className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Netqloud</h1>
          <p className="text-sm text-muted-foreground">Cloud-infrastructuur en operationeel beheer.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {sections.map((s) => (
          <Card key={s.title}>
            <CardHeader>
              <s.icon className="mb-2 h-5 w-5 text-primary" />
              <CardTitle className="text-base">{s.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{s.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
