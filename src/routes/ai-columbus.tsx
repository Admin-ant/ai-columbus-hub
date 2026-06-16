import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, Bot, Brain, MessageSquare } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/ai-columbus")({
  head: () => ({
    meta: [
      { title: "AI van Columbus — Portaal" },
      { name: "description", content: "AI-tools en modellen van Columbus." },
    ],
  }),
  component: AIColumbusPage,
});

const tools = [
  { title: "Assistenten", description: "Interne AI-assistenten voor medewerkers.", icon: Bot },
  { title: "Modellen", description: "Beheer en versies van AI-modellen.", icon: Brain },
  { title: "Chat", description: "Chat-interface voor dagelijks gebruik.", icon: MessageSquare },
];

function AIColumbusPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI van Columbus</h1>
          <p className="text-sm text-muted-foreground">AI-oplossingen ontwikkeld binnen Columbus.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {tools.map((t) => (
          <Card key={t.title}>
            <CardHeader>
              <t.icon className="mb-2 h-5 w-5 text-primary" />
              <CardTitle className="text-base">{t.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{t.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
