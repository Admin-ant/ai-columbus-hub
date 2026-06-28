import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert, BarChart3, Receipt, Package, FileText } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/administratie")({
  head: () => ({ meta: [{ title: "Administratie" }] }),
  component: AdministratiePage,
});

const tiles = [
  {
    title: "Analytics",
    description: "Inzicht in pipeline, conversie en omzettrends.",
    to: "/analytics",
    icon: BarChart3,
  },
  {
    title: "Boekhouding",
    description: "Journaal, BTW, debiteuren en crediteuren.",
    to: "/boekhouding",
    icon: Receipt,
  },
  {
    title: "Producten & Prijzen",
    description: "Beheer producten, abonnementen en tarieven.",
    to: "/producten",
    icon: Package,
  },
];

function AdministratiePage() {
  const { hasRole } = useAuth();
  if (!hasRole("admin")) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">Geen toegang</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Administratie is alleen toegankelijk voor admins.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-brand" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Administratie</h1>
          <p className="text-sm text-muted-foreground">
            Overzicht van administratie-onderdelen.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="group rounded-xl border bg-card p-5 transition hover:border-brand/40 hover:shadow-sm"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <t.icon className="h-5 w-5" />
              </span>
              <h2 className="text-base font-semibold">{t.title}</h2>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{t.description}</p>
            <span className="mt-4 inline-block text-xs font-medium text-brand opacity-0 transition group-hover:opacity-100">
              Openen →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
