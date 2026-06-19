import { Check, ChevronDown, Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/hooks/use-workspace";

export function WorkspaceSwitcher() {
  const { t } = useTranslation();
  const { organizations, currentOrganization, currentOrganizationId, setCurrentOrganizationId, isHoldingAdmin, loading } =
    useWorkspace();

  if (loading) return null;
  if (organizations.length === 0) return null;
  if (!isHoldingAdmin && organizations.length === 1) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{currentOrganization?.name}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Building2 className="h-4 w-4" />
          <span className="max-w-[160px] truncate">
            {currentOrganization?.name ?? t("common.switch_organization")}
          </span>
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("common.active_organization")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => setCurrentOrganizationId(org.id)}
            className="flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: org.brand_color ?? "#888" }}
              />
              {org.name}
            </span>
            {currentOrganizationId === org.id && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
