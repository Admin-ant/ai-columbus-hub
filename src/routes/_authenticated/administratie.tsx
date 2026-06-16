import { createFileRoute, Navigate } from "@tanstack/react-router";
import { FileText, Receipt, FolderArchive, ClipboardList, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/administratie")({
  head: () => ({ meta: [{ title: "Administratie — Columbus AI Portaal" }] }),
  component: AdministratiePage,
});

const items = [
  { title: "Facturen", description: "Inkomende en uitgaande facturen.", icon: Receipt },
  { title: "Documenten", description: "Archief en gedeelde documenten.", icon: FolderArchive },
  { title: "Processen", description: "Lopende administratieve taken.", icon: ClipboardList },
];

function AdministratiePage() {
  const { hasRole, loading } = useAuth();
  if (loading) return null;
  if (!hasRole("admin")) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <CardTitle>Geen toegang</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Administratie is alleen beschikbaar voor admins. Neem contact op met een beheerder als
              je toegang nodig hebt.
            </CardDescription>
          </CardContent>
        </Card>
      </div>
    );
  }

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
