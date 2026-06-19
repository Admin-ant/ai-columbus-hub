import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type OrgRole = "holding_admin" | "company_staff";

export interface Organization {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  invoice_prefix: string;
  brand_color: string | null;
}

export interface Membership {
  organization_id: string;
  role: OrgRole;
}

interface WorkspaceContextValue {
  organizations: Organization[];
  memberships: Membership[];
  currentOrganizationId: string | null;
  currentOrganization: Organization | null;
  isHoldingAdmin: boolean;
  loading: boolean;
  setCurrentOrganizationId: (id: string | null) => void;
  language: "nl" | "en";
  setLanguage: (lang: "nl" | "en") => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

const LS_ORG_KEY = "portal.activeOrg";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { i18n } = useTranslation();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentOrganizationId, setCurrentOrgIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setOrganizations([]);
      setMemberships([]);
      setCurrentOrgIdState(null);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const [orgRes, memRes] = await Promise.all([
        supabase.from("organizations").select("id, slug, name, logo_url, invoice_prefix, brand_color").order("name"),
        supabase.from("organization_members").select("organization_id, role").eq("user_id", user.id),
      ]);
      const orgs = (orgRes.data ?? []) as Organization[];
      const mems = (memRes.data ?? []) as Membership[];
      setOrganizations(orgs);
      setMemberships(mems);

      const stored = typeof window !== "undefined" ? localStorage.getItem(LS_ORG_KEY) : null;
      const isHA = mems.some((m) => m.role === "holding_admin");
      let active: string | null = null;
      if (stored && orgs.some((o) => o.id === stored)) active = stored;
      else if (!isHA && mems.length > 0) active = mems[0].organization_id;
      else if (orgs.length > 0) active = orgs[0].id;
      setCurrentOrgIdState(active);
      setLoading(false);
    })();
  }, [user, authLoading]);

  function setCurrentOrganizationId(id: string | null) {
    setCurrentOrgIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(LS_ORG_KEY, id);
      else localStorage.removeItem(LS_ORG_KEY);
    }
  }

  const currentOrganization = organizations.find((o) => o.id === currentOrganizationId) ?? null;
  const isHoldingAdmin = memberships.some((m) => m.role === "holding_admin");

  const language = (i18n.resolvedLanguage === "en" ? "en" : "nl") as "nl" | "en";
  function setLanguage(lang: "nl" | "en") {
    i18n.changeLanguage(lang);
  }

  return (
    <WorkspaceContext.Provider
      value={{
        organizations,
        memberships,
        currentOrganizationId,
        currentOrganization,
        isHoldingAdmin,
        loading,
        setCurrentOrganizationId,
        language,
        setLanguage,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace moet binnen WorkspaceProvider gebruikt worden");
  return ctx;
}
