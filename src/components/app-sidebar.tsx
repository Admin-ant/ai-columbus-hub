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
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { useLeadsFunnelVisible } from "@/hooks/use-leads-funnel-visible";
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

export function AppSidebar() {
  const { user, roles, hasRole, signOut } = useAuth();
  const { currentOrganization } = useWorkspace();
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const [leadsFunnelVisible] = useLeadsFunnelVisible();

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
        {activeGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {visibleAdmin.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Beheer</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdmin.map((item) => {
                  const isAdministratie = item.url === "/administratie";
                  const showSub =
                    isAdministratie &&
                    (currentPath === "/administratie" ||
                      administratieSubItems.some((s) => currentPath === s.url));
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)}>
                        <Link to={item.url} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      {showSub && (
                        <SidebarMenuSub>
                          {administratieSubItems.map((s) => (
                            <SidebarMenuSubItem key={s.url}>
                              <SidebarMenuSubButton asChild isActive={isActive(s.url)}>
                                <Link to={s.url} className="flex items-center gap-2">
                                  <s.icon className="h-3.5 w-3.5" />
                                  <span>{s.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
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
            <SidebarMenuButton onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              <span>Uitloggen</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
