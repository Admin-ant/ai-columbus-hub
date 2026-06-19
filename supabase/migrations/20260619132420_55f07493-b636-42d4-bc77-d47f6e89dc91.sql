
-- Recreate helpers in app_private schema
CREATE OR REPLACE FUNCTION app_private.is_holding_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND role = 'holding_admin'
  );
$$;

CREATE OR REPLACE FUNCTION app_private.has_org_access(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id
      AND (role = 'holding_admin' OR organization_id = _org_id)
  );
$$;

CREATE OR REPLACE FUNCTION app_private.next_invoice_number(_org_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _prefix text;
  _seq integer;
  _year text := to_char(now(), 'YYYY');
BEGIN
  UPDATE public.organizations
  SET next_invoice_seq = next_invoice_seq + 1
  WHERE id = _org_id
  RETURNING invoice_prefix, next_invoice_seq - 1 INTO _prefix, _seq;
  IF _prefix IS NULL THEN
    RAISE EXCEPTION 'Organization % not found', _org_id;
  END IF;
  RETURN _prefix || '-' || _year || '-' || lpad(_seq::text, 5, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION app_private.is_holding_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.has_org_access(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.next_invoice_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.next_invoice_number(uuid) TO service_role;

-- Drop and recreate policies to use app_private
DROP POLICY IF EXISTS "Members can view their organizations" ON public.organizations;
DROP POLICY IF EXISTS "Holding admins manage organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Holding admins manage memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Org members can view leads" ON public.leads;
DROP POLICY IF EXISTS "Org members can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Org members can update leads" ON public.leads;
DROP POLICY IF EXISTS "Org members can delete leads" ON public.leads;
DROP POLICY IF EXISTS "Org members can view quotes" ON public.quotes;
DROP POLICY IF EXISTS "Org members manage quotes" ON public.quotes;
DROP POLICY IF EXISTS "Org members can view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Org members manage invoices" ON public.invoices;

CREATE POLICY "Members can view their organizations" ON public.organizations
  FOR SELECT TO authenticated USING (app_private.has_org_access(auth.uid(), id));
CREATE POLICY "Holding admins manage organizations" ON public.organizations
  FOR ALL TO authenticated
  USING (app_private.is_holding_admin(auth.uid()))
  WITH CHECK (app_private.is_holding_admin(auth.uid()));

CREATE POLICY "Users can view their own memberships" ON public.organization_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app_private.is_holding_admin(auth.uid()));
CREATE POLICY "Holding admins manage memberships" ON public.organization_members
  FOR ALL TO authenticated
  USING (app_private.is_holding_admin(auth.uid()))
  WITH CHECK (app_private.is_holding_admin(auth.uid()));

CREATE POLICY "Org members can view leads" ON public.leads
  FOR SELECT TO authenticated USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "Org members can insert leads" ON public.leads
  FOR INSERT TO authenticated WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "Org members can update leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "Org members can delete leads" ON public.leads
  FOR DELETE TO authenticated USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can view quotes" ON public.quotes
  FOR SELECT TO authenticated USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "Org members manage quotes" ON public.quotes
  FOR ALL TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can view invoices" ON public.invoices
  FOR SELECT TO authenticated USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "Org members manage invoices" ON public.invoices
  FOR ALL TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

-- Drop the public-schema duplicates
DROP FUNCTION IF EXISTS public.is_holding_admin(uuid);
DROP FUNCTION IF EXISTS public.has_org_access(uuid, uuid);
DROP FUNCTION IF EXISTS public.next_invoice_number(uuid);
