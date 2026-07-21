import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Sparkles,
  FileText,
  Users,
  UserCog,
  LogOut,
  Cloud,
  Server,
  Settings,
  Cpu,
  BarChart3,
  ScrollText,
  Receipt,
  FileSignature,
  Package,
  Wand2,
  Megaphone,
  Rocket,
  ClipboardList,
  Mail,
  Inbox,
  Mic,
  Workflow,
  CalendarDays,
  Palette,
  ChevronDown,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { useLeadsFunnelVisible } from "@/hooks/use-leads-funnel-visible";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  requiredRole?: AppRole;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

// Light-blue tinted card style for every main menu group — matches the reference card look.
// Contrast tuned for WCAG AA: sky-950 text on sky-50 (~6:1), sky-900 icon on sky-100 (~4.5:1).
// Active state uses a darker sky background with light text for clear focus/hover indication.
// High-contrast variants target `prefers-contrast: more` and Windows `forced-colors`.
const lightBlueTint = {
  btn: "bg-sky-50 border-sky-200 text-sky-950 hover:bg-sky-100 hover:border-sky-300 hover:text-sky-950 menu-lift dark:bg-sky-400/10 dark:border-sky-400/25 dark:text-sky-50 dark:hover:bg-sky-400/18 dark:hover:border-sky-400/40 dark:hover:text-sky-50 contrast-more:bg-sky-100 contrast-more:border-sky-950 contrast-more:text-sky-950 contrast-more:font-semibold dark:contrast-more:bg-sky-400/20 dark:contrast-more:border-sky-300 dark:contrast-more:text-sky-50 forced-colors:border-CanvasText forced-colors:bg-Canvas forced-colors:text-CanvasText",
  icon: "bg-sky-100 text-sky-900 transition-colors duration-200 ease-out dark:bg-sky-400/20 dark:text-sky-200 contrast-more:bg-sky-200 contrast-more:text-sky-950 dark:contrast-more:bg-sky-400/30 dark:contrast-more:text-sky-50 forced-colors:bg-CanvasText forced-colors:text-Canvas",
  active: "!bg-sky-700 !border-sky-800 !text-sky-50 ring-1 ring-sky-300 menu-glow dark:menu-glow-dark dark:!bg-sky-400/30 dark:!border-sky-400/50 dark:!text-sky-50 dark:ring-sky-400/40 contrast-more:!bg-sky-800 contrast-more:!border-sky-950 contrast-more:!text-sky-50 dark:contrast-more:!bg-sky-400/40 dark:contrast-more:!border-sky-300 dark:contrast-more:!text-sky-50 forced-colors:!bg-Highlight forced-colors:!text-HighlightText forced-colors:!border-CanvasText",
  activeIcon: "!bg-sky-500 !text-sky-50 transition-colors duration-200 ease-out dark:!bg-sky-400/40 dark:!text-sky-50 contrast-more:!bg-sky-400 contrast-more:!text-sky-950 dark:contrast-more:!bg-sky-400/50 dark:contrast-more:!text-sky-50 forced-colors:!bg-CanvasText forced-colors:!text-Canvas",
};
const groupTint: Record<string, { btn: string; icon: string; active: string; activeIcon: string }> = {
  Algemeen: lightBlueTint,
  "Sales & Marketing": lightBlueTint,
  Administratie: lightBlueTint,
  Communicatie: lightBlueTint,
  "AI & Rapportages": lightBlueTint,
  Overig: lightBlueTint,
  Netqloud: lightBlueTint,
  Beheer: lightBlueTint,
};
const defaultTint = lightBlueTint;

const columbusGroups: NavGroup[] = [
  {
    label: "Algemeen",
    items: [
      { title: "Overzicht", url: "/", icon: LayoutDashboard },
      { title: "Dashboard", url: "/ai-columbus", icon: Sparkles },
      { title: "Sales Workflow", url: "/sales-workflow", icon: Workflow },
      { title: "Projecten (uitvoering)", url: "/ai-columbus/projecten", icon: LayoutDashboard },
      { title: "Klanten", url: "/ai-columbus/klanten", icon: Users },
    ],
  },
  {
    label: "Sales & Marketing",
    items: [
      { title: "Offerte Studio", url: "/offerte-studio", icon: Wand2 },
      { title: "Cold Outreach", url: "/outreach", icon: Megaphone },
      { title: "Leads", url: "/leads", icon: Inbox },
      { title: "Mail templates", url: "/outreach/templates", icon: FileText },
      { title: "Mail-flow overzicht", url: "/mail/flow", icon: Workflow },
      { title: "CRM Activiteiten", url: "/crm/activities", icon: ClipboardList },
    ],
  },
  {
    label: "Administratie",
    items: [
      { title: "Offertes", url: "/quotes", icon: FileSignature },
      { title: "Facturen", url: "/invoices", icon: Receipt },
      { title: "Inkoopfacturen", url: "/inkoopfacturen", icon: Receipt },
      { title: "Contracten", url: "/contracten", icon: FileSignature },
    ],
  },
  {
    label: "Communicatie",
    items: [
      { title: "Mail", url: "/mail", icon: Mail },
      { title: "Agenda", url: "/agenda", icon: CalendarDays },
      { title: "Mail skins", url: "/mail/skins", icon: Palette },
      { title: "Mail instellingen", url: "/mail/settings", icon: Settings },
    ],
  },
  {
    label: "AI & Rapportages",
    items: [
      { title: "Modellen & gebruik", url: "/ai-columbus/modellen", icon: Cpu },
      { title: "Rapportages", url: "/ai-columbus/rapportages", icon: BarChart3 },
      { title: "Logs", url: "/ai-columbus/logs", icon: ScrollText },
    ],
  },
  {
    label: "Overig",
    items: [
      { title: "Enterprise", url: "/enterprise", icon: Rocket },
      { title: "Teams", url: "/teams", icon: Users },
      { title: "Instellingen", url: "/ai-columbus/instellingen", icon: Settings },
    ],
  },
];

const netqloudGroups: NavGroup[] = [
  {
    label: "Netqloud",
    items: [
      { title: "Dashboard", url: "/netqloud", icon: LayoutDashboard },
      { title: "Klanten", url: "/netqloud/klanten", icon: Users },
      { title: "Servers", url: "/netqloud/servers", icon: Server },
    ],
  },
  {
    label: "Administratie",
    items: [
      { title: "Offertes", url: "/quotes", icon: FileSignature },
      { title: "Facturen", url: "/invoices", icon: Receipt },
      { title: "Inkoopfacturen", url: "/inkoopfacturen", icon: Receipt },
    ],
  },
  {
    label: "Overig",
    items: [{ title: "Instellingen", url: "/netqloud/instellingen", icon: Settings }],
  },
];

const adminItems: NavItem[] = [
  { title: "Opname", url: "/opname", icon: Mic },
  { title: "Administratie", url: "/administratie", icon: FileText, requiredRole: "admin" },
  { title: "Gebruikers", url: "/gebruikers", icon: UserCog, requiredRole: "admin" },
];

const administratieSubItems: NavItem[] = [
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Boekhouding", url: "/boekhouding", icon: Receipt },
  { title: "Inkoopfacturen", url: "/inkoopfacturen", icon: Receipt },
  { title: "Producten & Prijzen", url: "/producten", icon: Package },
];

function useUpcomingAppointmentsCount(organizationId: string | null) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!organizationId) {
      setCount(0);
      return;
    }

    const fetchCount = async () => {
      const now = new Date().toISOString();
      const { count: c, error } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .neq("status", "cancelled")
        .gte("starts_at", now);

      if (!error) {
        setCount(c ?? 0);
      }
    };

    fetchCount();

    const channel = supabase
      .channel("appointments-badge")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `organization_id=eq.${organizationId}`,
        },
        fetchCount,
      )
      .subscribe();

    const interval = setInterval(fetchCount, 60_000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

  return count;
}

export function AppSidebar() {
  const { user, roles, hasRole, signOut } = useAuth();
  const { currentOrganization } = useWorkspace();
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const [leadsFunnelVisible] = useLeadsFunnelVisible();
  const upcomingAppointments = useUpcomingAppointmentsCount(currentOrganization?.id ?? null);

  const visibleAdmin = adminItems.filter((i) => !i.requiredRole || hasRole(i.requiredRole));
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
  const roleLabel = roles.includes("admin") ? "Admin" : roles[0] ?? "—";

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth" });
  }

  const isActive = (url: string) => currentPath === url;
  const orgInitial = (currentOrganization?.name ?? "?").slice(0, 1).toUpperCase();
  const brandColor = currentOrganization?.brand_color || undefined;

  const baseGroups =
    currentOrganization?.slug === "netqloud" ? netqloudGroups : columbusGroups;

  const activeGroups: NavGroup[] =
    currentOrganization?.slug !== "netqloud" && leadsFunnelVisible
      ? baseGroups.map((g) =>
          g.label === "Algemeen"
            ? {
                ...g,
                items: [
                  ...g.items,
                  { title: "Leads funnel", url: "/ai-columbus/leads", icon: Inbox },
                ],
              }
            : g,
        )
      : baseGroups;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            style={brandColor ? { backgroundColor: brandColor } : undefined}
          >
            {currentOrganization?.slug === "netqloud" ? (
              <Cloud className="h-5 w-5" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold leading-none">
              {currentOrganization?.name ?? "Portaal"}
            </span>
            <span className="text-xs text-muted-foreground">Actieve omgeving</span>
          </div>
        </div>
        <div
          className="mx-2 mb-2 flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 group-data-[collapsible=icon]:hidden"
          title={currentOrganization ? `Actieve omgeving: ${currentOrganization.name}` : "Geen actieve omgeving"}
        >
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary text-[11px] font-semibold text-primary-foreground"
            style={brandColor ? { backgroundColor: brandColor } : undefined}
          >
            {orgInitial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">
              Wissel bovenin van bedrijf
            </div>
            <div className="truncate text-xs font-semibold">
              {currentOrganization?.name ?? "Geen geselecteerd"}
            </div>
          </div>
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {activeGroups.map((group) => {
          const isOpen = group.items.some((i) => isActive(i.url));
          const tint = groupTint[group.label] ?? defaultTint;
          return (
            <Collapsible key={group.label} defaultOpen={isOpen} className="group/collapsible">
              <SidebarGroup>
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger className="flex w-full items-center justify-between hover:text-foreground">
                    {group.label}
                    <ChevronDown className="h-4 w-4 transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu className="gap-1.5">
                        {group.items.map((item) => (
                          <SidebarMenuItem key={item.url}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <SidebarMenuButton
                                  asChild
                                  isActive={isActive(item.url)}
                                  className={`h-auto py-2.5 rounded-lg border ${tint.btn} ${isActive(item.url) ? tint.active : ""}`}
                                >
                                  <Link to={item.url} className="flex items-center gap-2.5">
                                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${tint.icon} ${isActive(item.url) ? tint.activeIcon : ""}`}>
                                      <item.icon className="h-4 w-4" />
                                    </span>
                                    <span className="truncate font-medium">{item.title}</span>
                                  </Link>
                                </SidebarMenuButton>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs">
                                <p>{item.title}</p>
                              </TooltipContent>
                            </Tooltip>
                            {item.url === "/agenda" && upcomingAppointments > 0 && (
                              <SidebarMenuBadge asChild className="bg-primary text-primary-foreground rounded-full px-1.5 shadow-sm hover:bg-primary/90 cursor-pointer group-data-[collapsible=icon]:flex">
                                <Link
                                  to="/agenda"
                                  search={{ view: "upcoming" }}
                                  aria-label={`${upcomingAppointments} aankomende afspraken bekijken`}
                                >
                                  {upcomingAppointments}
                                </Link>
                              </SidebarMenuBadge>
                            )}
                          </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}

        {visibleAdmin.length > 0 && (
          <Collapsible
            defaultOpen={visibleAdmin.some((i) => isActive(i.url)) || administratieSubItems.some((s) => isActive(s.url))}
            className="group/collapsible"
          >
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center justify-between hover:text-foreground">
                  Beheer
                  <ChevronDown className="h-4 w-4 transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1.5">
                    {visibleAdmin.map((item) => {
                      const tint = groupTint.Beheer;
                      const isAdministratie = item.url === "/administratie";
                      const showSub =
                        isAdministratie &&
                        (currentPath === "/administratie" ||
                          administratieSubItems.some((s) => currentPath === s.url));
                      return (
                        <SidebarMenuItem key={item.url}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <SidebarMenuButton
                                asChild
                                isActive={isActive(item.url)}
                                className={`h-auto py-2.5 rounded-lg border ${tint.btn} ${isActive(item.url) ? tint.active : ""}`}
                              >
                                <Link to={item.url} className="flex items-center gap-2.5">
                                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${tint.icon} ${isActive(item.url) ? tint.activeIcon : ""}`}>
                                    <item.icon className="h-4 w-4" />
                                  </span>
                                  <span className="truncate font-medium">{item.title}</span>
                                </Link>
                              </SidebarMenuButton>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs">
                              <p>{item.title}</p>
                            </TooltipContent>
                          </Tooltip>
                          {showSub && (
                            <SidebarMenuSub>
                              {administratieSubItems.map((s) => (
                                <SidebarMenuSubItem key={s.url}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <SidebarMenuSubButton asChild isActive={isActive(s.url)} className="transition-all duration-200 ease-out hover:translate-x-0.5 hover:bg-sky-50 dark:hover:bg-sky-400/10">
                                        <Link to={s.url} className="flex items-center gap-2">
                                          <s.icon className="h-3.5 w-3.5" />
                                          <span>{s.title}</span>
                                        </Link>
                                      </SidebarMenuSubButton>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="max-w-xs">
                                      <p>{s.title}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          )}
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t">
        <div className="flex items-center gap-2 px-2 py-2 group-data-[collapsible=icon]:hidden">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-medium">{user?.email}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{roleLabel}</span>
          </div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton onClick={handleSignOut} className="transition-all duration-200 ease-out hover:translate-x-0.5 hover:bg-sky-50 dark:hover:bg-sky-400/10">
                  <LogOut className="h-4 w-4" />
                  <span>Uitloggen</span>
                </SidebarMenuButton>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p>Uitloggen uit het portaal</p>
              </TooltipContent>
            </Tooltip>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
