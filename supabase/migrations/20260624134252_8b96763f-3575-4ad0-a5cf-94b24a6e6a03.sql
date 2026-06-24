-- 1) quotes: remove the unconditional anon SELECT policy
DROP POLICY IF EXISTS "Public token can view quote" ON public.quotes;

-- 2) studio_quotes: drop unrestricted anon UPDATE (acceptance now goes through
-- the secure server function that uses the service role).
DROP POLICY IF EXISTS "Public can accept shared studio quotes" ON public.studio_quotes;

-- 3) clients: scope all policies to authenticated only
DROP POLICY IF EXISTS "Org members can view clients" ON public.clients;
DROP POLICY IF EXISTS "Org members can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Org members can update clients" ON public.clients;
DROP POLICY IF EXISTS "Org members can delete clients" ON public.clients;

CREATE POLICY "Org members can view clients" ON public.clients
  FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "Org members can insert clients" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "Org members can update clients" ON public.clients
  FOR UPDATE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "Org members can delete clients" ON public.clients
  FOR DELETE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

-- 4) profiles: scope SELECT to self or same-organization members
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles viewable by self or org members" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.organization_members me
      JOIN public.organization_members them
        ON them.organization_id = me.organization_id
      WHERE me.user_id = auth.uid()
        AND them.user_id = profiles.id
    )
  );

-- 5) SECURITY DEFINER functions: revoke broad EXECUTE, grant narrowly
REVOKE EXECUTE ON FUNCTION public.accept_quote_by_token(text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.track_quote_view(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_organization() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_project_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_chart(uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.next_invoice_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.post_invoice_journal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_invoice_journal(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.post_expense_journal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_expense_journal(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.post_expense_journal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_expense_journal(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reverse_expense_journal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_expense_journal(uuid, text) TO authenticated;