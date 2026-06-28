import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

/**
 * Public visual-regression harness. Renders every themed primitive so
 * Playwright can snapshot button/input/card/link/badge styles and fail
 * when semantic tokens or the brand color drift.
 *
 * Route is intentionally undiscoverable (no nav link). Safe to publish:
 * read-only, no data, no secrets.
 */
export const Route = createFileRoute("/__visual")({
  head: () => ({
    meta: [
      { title: "Visual regression harness" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: VisualHarness,
});

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} data-testid={id} className="space-y-3 rounded-lg border border-border bg-card p-6">
      <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

function VisualHarness() {
  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">Visual regression harness</h1>
          <p className="text-sm text-muted-foreground">
            Snapshot deze pagina om kleur- en theme-afwijkingen te detecteren.
          </p>
        </header>

        <Section id="buttons" title="Buttons">
          <Button variant="default">Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button className="bg-brand text-brand-foreground hover:bg-brand/90">Brand</Button>
          <Button disabled>Disabled</Button>
        </Section>

        <Section id="inputs" title="Inputs">
          <div className="grid w-full gap-2 sm:max-w-sm">
            <Label htmlFor="vh-input">Label</Label>
            <Input id="vh-input" placeholder="Placeholder tekst" />
          </div>
          <Input placeholder="Disabled" disabled />
        </Section>

        <Section id="cards" title="Cards">
          <Card className="w-full sm:max-w-sm">
            <CardHeader>
              <CardTitle>Card titel</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Card body met muted tekst en standaard border.
            </CardContent>
          </Card>
          <Card className="w-full border-brand sm:max-w-sm">
            <CardHeader>
              <CardTitle className="text-brand">Brand card</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Border en accent gebruiken het brand token.
            </CardContent>
          </Card>
        </Section>

        <Section id="badges" title="Badges">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge className="bg-brand text-brand-foreground">Brand</Badge>
        </Section>

        <Section id="links" title="Links">
          <Link to="/" className="text-primary underline-offset-4 hover:underline">
            Primary link
          </Link>
          <a href="#" className="text-brand underline-offset-4 hover:underline">
            Brand link
          </a>
          <a href="#" className="text-muted-foreground hover:text-foreground">
            Muted link
          </a>
        </Section>

        <Section id="surfaces" title="Surfaces">
          <div className="h-16 w-24 rounded-md bg-background ring-1 ring-border" />
          <div className="h-16 w-24 rounded-md bg-card ring-1 ring-border" />
          <div className="h-16 w-24 rounded-md bg-muted" />
          <div className="h-16 w-24 rounded-md bg-primary" />
          <div className="h-16 w-24 rounded-md bg-secondary" />
          <div className="h-16 w-24 rounded-md bg-accent" />
          <div className="h-16 w-24 rounded-md bg-destructive" />
          <div className="h-16 w-24 rounded-md bg-brand" />
        </Section>
      </div>
    </div>
  );
}
