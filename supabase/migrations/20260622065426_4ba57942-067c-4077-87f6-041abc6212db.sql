
-- Extend clients with NAW + KvK + organization scoping
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS kvk_number text,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Nederland',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Backfill organization_id to AI Columbus for existing rows
UPDATE public.clients
SET organization_id = 'd30d790a-7167-4ede-94b4-ad6b7d408a8a'
WHERE organization_id IS NULL;

-- monthly_value should be optional going forward (NAW-only contacts)
ALTER TABLE public.clients ALTER COLUMN monthly_value DROP NOT NULL;
ALTER TABLE public.clients ALTER COLUMN monthly_value SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_clients_org ON public.clients(organization_id);

-- Replace admin-only policy with org-scoped policies (mirror projects)
DROP POLICY IF EXISTS "Admins beheren klanten" ON public.clients;

CREATE POLICY "Org members can view clients"
  ON public.clients FOR SELECT
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can insert clients"
  ON public.clients FOR INSERT
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can update clients"
  ON public.clients FOR UPDATE
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can delete clients"
  ON public.clients FOR DELETE
  USING (app_private.has_org_access(auth.uid(), organization_id));

-- updated_at trigger
DROP TRIGGER IF EXISTS clients_set_updated_at ON public.clients;
CREATE TRIGGER clients_set_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
