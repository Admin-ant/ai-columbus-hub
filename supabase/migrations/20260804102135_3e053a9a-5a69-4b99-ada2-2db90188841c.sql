CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#F26A1F',
  lead_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

CREATE INDEX teams_org_idx ON public.teams(organization_id);
CREATE INDEX team_members_team_idx ON public.team_members(team_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view teams" ON public.teams FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "Org members can insert teams" ON public.teams FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "Org members can update teams" ON public.teams FOR UPDATE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "Org members can delete teams" ON public.teams FOR DELETE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can view team members" ON public.team_members FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_members.team_id AND app_private.has_org_access(auth.uid(), t.organization_id)));
CREATE POLICY "Org members can insert team members" ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_members.team_id AND app_private.has_org_access(auth.uid(), t.organization_id)));
CREATE POLICY "Org members can update team members" ON public.team_members FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_members.team_id AND app_private.has_org_access(auth.uid(), t.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_members.team_id AND app_private.has_org_access(auth.uid(), t.organization_id)));
CREATE POLICY "Org members can delete team members" ON public.team_members FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_members.team_id AND app_private.has_org_access(auth.uid(), t.organization_id)));

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();