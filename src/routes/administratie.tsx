import { createFileRoute } from "@tanstack/react-router";
import { FileText, Receipt, FolderArchive, ClipboardList } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/administratie")({
  head: () => ({
    meta: [
      { title: "Administratie — Columbus AI Portaal" },
      { name: "description", content: "Administratieve processen en documenten." },
    ],
  }),
  component: AdministratiePage,
});

const items = [
  { title: "Facturen", description: "Inkomende en uitgaande facturen.", icon: Receipt },
  { title: "Documenten", description: "Archief en gedeelde documenten.", icon: FolderArchive },
  { title: "Processen", description: "Lopende administratieve taken.", icon: ClipboardList },
];

function AdministratiePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Administratie</h1>
          <p className="text-sm text-muted-foreground">Documenten, facturen en processen.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {items.map((i) => (
          <Card key={i.title}>
            <CardHeader>
              <i.icon className="mb-2 h-5 w-5 text-primary" />
              <CardTitle className="text-base">{i.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{i.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
