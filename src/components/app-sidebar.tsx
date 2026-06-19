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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  requiredRole?: AppRole;
};

type NavSection = {
  label: string;
  rootUrl: string;
  orgSlug: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
};

const topItems: NavItem[] = [
  { title: "Overzicht", url: "/", icon: LayoutDashboard },
  { title: "Boekhouding", url: "/boekhouding", icon: Receipt },
  { title: "Teams", url: "/teams", icon: Users },
];

const sections: NavSection[] = [
  {
    label: "AI van Columbus",
    rootUrl: "/ai-columbus",
    orgSlug: "ai-columbus",
    icon: Sparkles,
    items: [
      { title: "Dashboard", url: "/ai-columbus", icon: LayoutDashboard },
      { title: "Leads funnel", url: "/ai-columbus/leads", icon: Sparkles },
      { title: "Offertes", url: "/quotes", icon: FileSignature },
      { title: "Facturen", url: "/invoices", icon: Receipt },
      { title: "Modellen & gebruik", url: "/ai-columbus/modellen", icon: Cpu },
      { title: "Rapportages", url: "/ai-columbus/rapportages", icon: BarChart3 },
      { title: "Logs", url: "/ai-columbus/logs", icon: ScrollText },
      { title: "Instellingen", url: "/ai-columbus/instellingen", icon: Settings },
    ],
  },
  {
    label: "Netqloud",
    rootUrl: "/netqloud",
    orgSlug: "netqloud",
    icon: Cloud,
    items: [
      { title: "Dashboard", url: "/netqloud", icon: LayoutDashboard },
      { title: "Klanten", url: "/netqloud/klanten", icon: Users },
      { title: "Servers", url: "/netqloud/servers", icon: Server },
      { title: "Offertes", url: "/quotes", icon: FileSignature },
      { title: "Facturen", url: "/invoices", icon: Receipt },
      { title: "Instellingen", url: "/netqloud/instellingen", icon: Settings },
    ],
  },

];

const adminItems: NavItem[] = [
  { title: "Administratie", url: "/administratie", icon: FileText, requiredRole: "admin" },
  { title: "Gebruikers", url: "/gebruikers", icon: UserCog, requiredRole: "admin" },
];

export function AppSidebar() {
  const { user, roles, hasRole, signOut } = useAuth();
  const { organizations, setCurrentOrganizationId } = useWorkspace();
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  const switchToOrg = (slug: string) => {
    const org = organizations.find((o) => o.slug === slug);
    if (org) setCurrentOrganizationId(org.id);
  };

  const visibleAdmin = adminItems.filter((i) => !i.requiredRole || hasRole(i.requiredRole));
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
  const roleLabel = roles.includes("admin") ? "Admin" : roles[0] ?? "—";

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth" });
  }

  const isActive = (url: string) => currentPath === url;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold leading-none">Portaal</span>
            <span className="text-xs text-muted-foreground">Intern overzicht</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Algemeen</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {topItems.map((item) => (
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

        {sections.map((section) => {
          const inSection = currentPath === section.rootUrl || currentPath.startsWith(section.rootUrl + "/");
          return (
            <SidebarGroup key={section.rootUrl}>
              <SidebarGroupLabel className="flex items-center gap-2">
                <section.icon className="h-3.5 w-3.5" />
                {section.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive(section.rootUrl)}>
                      <Link
                        to={section.rootUrl}
                        onClick={() => switchToOrg(section.orgSlug)}
                        className="flex items-center gap-2"
                      >
                        <section.icon className="h-4 w-4" />
                        <span>Open omgeving</span>
                      </Link>
                    </SidebarMenuButton>
                    {inSection && (
                      <SidebarMenuSub>
                        {section.items
                          .filter((i) => i.url !== section.rootUrl)
                          .map((item) => (
                            <SidebarMenuSubItem key={item.url}>
                              <SidebarMenuSubButton asChild isActive={isActive(item.url)}>
                                <Link to={item.url} className="flex items-center gap-2">
                                  <item.icon className="h-3.5 w-3.5" />
                                  <span>{item.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}

        {visibleAdmin.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Beheer</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdmin.map((item) => (
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
