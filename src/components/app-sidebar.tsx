import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Sparkles, FileText, Users, UserCog, LogOut } from "lucide-react";

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
} from "@/components/ui/sidebar";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  requiredRole?: AppRole;
};

const items: NavItem[] = [
  { title: "Overzicht", url: "/", icon: LayoutDashboard },
  { title: "AI van Columbus", url: "/ai-columbus", icon: Sparkles },
  { title: "Teams", url: "/teams", icon: Users },
  { title: "Administratie", url: "/administratie", icon: FileText, requiredRole: "admin" },
  { title: "Gebruikers", url: "/gebruikers", icon: UserCog, requiredRole: "admin" },
];

export function AppSidebar() {
  const { user, roles, hasRole, signOut } = useAuth();
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  const visibleItems = items.filter((i) => !i.requiredRole || hasRole(i.requiredRole));
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
  const roleLabel = roles.includes("admin") ? "Admin" : roles[0] ?? "—";

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth" });
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold leading-none">AI van Columbus</span>
            <span className="text-xs text-muted-foreground">Portaal</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigatie</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={currentPath === item.url}>
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
