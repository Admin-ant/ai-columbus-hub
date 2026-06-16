import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/teams")({
  head: () => ({ meta: [{ title: "Teams — Columbus AI Portaal" }] }),
  component: TeamsPage,
});

const teams = [
  { name: "Engineering", members: 8, lead: "JD" },
  { name: "AI Research", members: 5, lead: "MA" },
  { name: "Operations", members: 6, lead: "PV" },
  { name: "Sales & Support", members: 4, lead: "SK" },
];

function TeamsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teams</h1>
          <p className="text-sm text-muted-foreground">Overzicht van alle teams binnen Columbus.</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {teams.map((t) => (
          <Card key={t.name}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback className="bg-primary/10 text-primary">{t.lead}</AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle className="text-base">{t.name}</CardTitle>
                  <CardDescription>{t.members} teamleden</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Bekijk teamleden, lopende projecten en interne afspraken.
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
