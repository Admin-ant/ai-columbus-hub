import { createFileRoute, Link } from "@tanstack/react-router";
import { Link2, ArrowRight, Info, Workflow, Bell } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLeadsFunnelVisible } from "@/hooks/use-leads-funnel-visible";
import { useReminderSettings, DEFAULT_WINDOW_DAYS, DEFAULT_OVERDUE_DAYS } from "@/hooks/use-reminder-settings";


export const Route = createFileRoute("/_authenticated/ai-columbus/instellingen")({
  head: () => ({ meta: [{ title: "AI van Columbus — Instellingen" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const [leadsFunnelVisible, setLeadsFunnelVisible] = useLeadsFunnelVisible();
  const [reminderSettings, updateReminderSettings] = useReminderSettings();

  function onWindowChange(v: string) {
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 365) {
      updateReminderSettings({ windowDays: n });
    }
  }
  function onOverdueChange(v: string) {
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 365) {
      updateReminderSettings({ overdueDays: n });
    }
  }


  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Instellingen — AI van Columbus</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Koppelingen
          </CardTitle>
          <CardDescription>
            Verbind Columbus Portaal en inzet.nl. Factureerbare acties in die portalen
            komen dan automatisch hier binnen als factuur, offerte of klant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm">
            <Link to="/ai-columbus/koppelingen">
              Open koppelingen <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="h-4 w-4" /> Sidebar-onderdelen
          </CardTitle>
          <CardDescription>Verberg of toon extra menu-items in de zijbalk.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="leads-funnel-toggle" className="text-sm font-medium">
                  Leads funnel tonen
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      De losse Leads funnel is standaard verborgen omdat de Sales workflow
                      alle fases (nieuw, contact, offerte, gewonnen en verloren) al
                      afdekt. Zet dit aan als je toch de aparte Kanban-weergave wilt
                      gebruiken.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-xs text-muted-foreground">
                Toont het menu-item “Leads funnel” onder AI van Columbus.
              </p>
            </div>
            <Switch
              id="leads-funnel-toggle"
              checked={leadsFunnelVisible}
              onCheckedChange={setLeadsFunnelVisible}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Voorkeuren</CardTitle>
          <CardDescription>Overige instellingen voor deze omgeving.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Nog leeg.</CardContent>
      </Card>
    </div>
  );
}
