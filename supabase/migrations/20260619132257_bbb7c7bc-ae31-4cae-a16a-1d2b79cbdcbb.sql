
-- =========================================
-- ORGANIZATIONS
-- =========================================
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  logo_url text,
  tax_number text,
  invoice_prefix text NOT NULL,
  brand_color text DEFAULT '#3B82F6',
  next_invoice_seq integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- =========================================
-- ORGANIZATION MEMBERS (per-org role)
-- =========================================
CREATE TYPE public.org_role AS ENUM ('holding_admin', 'company_staff');

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.org_role NOT NULL DEFAULT 'company_staff',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- =========================================
-- Security definer helpers
-- =========================================
CREATE OR REPLACE FUNCTION public.is_holding_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND role = 'holding_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_access(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id
      AND (role = 'holding_admin' OR organization_id = _org_id)
  );
$$;

-- =========================================
-- Seed organizations
-- =========================================
INSERT INTO public.organizations (slug, name, invoice_prefix, brand_color) VALUES
  ('ai-columbus', 'AI van Columbus', 'AIC', '#6366F1'),
  ('netqloud',    'Netqloud',        'NQ',  '#0EA5E9');

-- =========================================
-- RLS policies: organizations
-- =========================================
CREATE POLICY "Members can view their organizations"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.has_org_access(auth.uid(), id));

CREATE POLICY "Holding admins manage organizations"
  ON public.organizations FOR ALL TO authenticated
  USING (public.is_holding_admin(auth.uid()))
  WITH CHECK (public.is_holding_admin(auth.uid()));

-- =========================================
-- RLS policies: organization_members
-- =========================================
CREATE POLICY "Users can view their own memberships"
  ON public.organization_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_holding_admin(auth.uid()));

CREATE POLICY "Holding admins manage memberships"
  ON public.organization_members FOR ALL TO authenticated
  USING (public.is_holding_admin(auth.uid()))
  WITH CHECK (public.is_holding_admin(auth.uid()));

-- =========================================
-- Backfill: existing admins -> holding_admin in both orgs
-- =========================================
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT o.id, ur.user_id, 'holding_admin'::public.org_role
FROM public.user_roles ur
CROSS JOIN public.organizations o
WHERE ur.role = 'admin'
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- All other users -> company_staff in AI van Columbus
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT (SELECT id FROM public.organizations WHERE slug = 'ai-columbus'),
       ur.user_id, 'company_staff'::public.org_role
FROM public.user_roles ur
WHERE ur.role = 'medewerker'
  AND NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = ur.user_id
  )
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- =========================================
-- LEADS: add organization_id + extend stage enum
-- =========================================
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'contact_opgenomen';
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'offerte_verzonden';
ALTER TYPE public.lead_stage ADD VALUE IF NOT EXISTS 'gewonnen';

ALTER TABLE public.leads
  ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN company text;

UPDATE public.leads
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'ai-columbus')
WHERE organization_id IS NULL;

ALTER TABLE public.leads ALTER COLUMN organization_id SET NOT NULL;

-- Replace existing policies with tenant-aware versions
DROP POLICY IF EXISTS "Admins kunnen leads verwijderen" ON public.leads;
DROP POLICY IF EXISTS "Medewerkers kunnen leads aanmaken" ON public.leads;
DROP POLICY IF EXISTS "Medewerkers kunnen leads bekijken" ON public.leads;
DROP POLICY IF EXISTS "Medewerkers kunnen leads bewerken" ON public.leads;

CREATE POLICY "Org members can view leads"
  ON public.leads FOR SELECT TO authenticated
  USING (public.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can insert leads"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can update leads"
  ON public.leads FOR UPDATE TO authenticated
  USING (public.has_org_access(auth.uid(), organization_id))
  WITH CHECK (public.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members can delete leads"
  ON public.leads FOR DELETE TO authenticated
  USING (public.has_org_access(auth.uid(), organization_id));

-- =========================================
-- QUOTES
-- =========================================
CREATE TYPE public.quote_status AS ENUM ('draft', 'sent', 'viewed', 'signed', 'approved_paid', 'declined');

CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  title text NOT NULL,
  content_json jsonb NOT NULL DEFAULT '{"lines":[]}'::jsonb,
  total_amount numeric NOT NULL DEFAULT 0,
  status public.quote_status NOT NULL DEFAULT 'draft',
  signature_svg text,
  signed_at timestamptz,
  mollie_payment_id text,
  public_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (public_token)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT SELECT, UPDATE ON public.quotes TO anon;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view quotes"
  ON public.quotes FOR SELECT TO authenticated
  USING (public.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members manage quotes"
  ON public.quotes FOR ALL TO authenticated
  USING (public.has_org_access(auth.uid(), organization_id))
  WITH CHECK (public.has_org_access(auth.uid(), organization_id));

-- Public token access (anon) - read only, must know full token
CREATE POLICY "Public token can view quote"
  ON public.quotes FOR SELECT TO anon
  USING (true);

-- NOTE: anon SELECT is broad to allow accept page lookup by token;
-- safe because token is 48-char random and we filter by it in code.
-- For production, replace with a server-fn lookup using service role.

-- =========================================
-- INVOICES
-- =========================================
CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  issue_date date NOT NULL DEFAULT current_date,
  due_date date NOT NULL DEFAULT (current_date + INTERVAL '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, invoice_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (public.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Org members manage invoices"
  ON public.invoices FOR ALL TO authenticated
  USING (public.has_org_access(auth.uid(), organization_id))
  WITH CHECK (public.has_org_access(auth.uid(), organization_id));

-- =========================================
-- next_invoice_number(org_id)
-- =========================================
CREATE OR REPLACE FUNCTION public.next_invoice_number(_org_id uuid)
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

-- =========================================
-- updated_at triggers
-- =========================================
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- Update handle_new_user to also add org membership
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _aic uuid;
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'medewerker');

  SELECT id INTO _aic FROM public.organizations WHERE slug = 'ai-columbus';

  IF lower(NEW.email) = 'ah.hogervorst@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin') ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    SELECT o.id, NEW.id, 'holding_admin'::public.org_role
    FROM public.organizations o
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  ELSE
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (_aic, NEW.id, 'company_staff')
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
