
-- ============ CLIENTS TABLE ============
CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  monthly_value numeric(12,2) NOT NULL DEFAULT 0,
  start_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins beheren klanten" ON public.clients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed klanten
INSERT INTO public.clients (name, monthly_value, start_date) VALUES
  ('Inzet',           2000.00, '2026-06-01'),
  ('Creditsafe',       400.00, '2026-06-01'),
  ('Florian',         1200.00, '2026-08-01'),
  ('Hollandse glorie', 350.00, '2026-04-01'),
  ('Self reliance',    850.00, '2026-08-01'),
  ('PCES nv',          375.00, '2026-08-01'),
  ('XX (whatsapp)',    270.00, '2026-08-01'),
  ('Project SUR',        0.00, '2026-09-01'),
  ('Kredietbank',     2500.00, '2027-01-01'),
  ('Arbo Anders',      900.00, '2026-08-01'),
  ('De Haan person',  1500.00, '2026-07-01'),
  ('Mployee',         1500.00, '2026-07-01'),
  ('Young Cap',       2500.00, '2026-09-01');

-- ============ LEADS TABLE ============
CREATE TYPE public.lead_stage AS ENUM (
  'nieuwe','op_afspraak','in_afwachting','even_on_hold',
  'in_contact','klant','verloren','ai_columbus'
);

CREATE TABLE public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  stage public.lead_stage NOT NULL DEFAULT 'nieuwe',
  value numeric(12,2) NOT NULL DEFAULT 0,
  source text,
  rep text,
  phone text,
  email text,
  notes text,
  last_contact_at timestamptz,
  position int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Medewerkers kunnen leads bekijken" ON public.leads
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Medewerkers kunnen leads aanmaken" ON public.leads
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Medewerkers kunnen leads bewerken" ON public.leads
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins kunnen leads verwijderen" ON public.leads
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ AUTO-ADMIN FOR ah.hogervorst@gmail.com ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'medewerker');
  IF lower(NEW.email) = 'ah.hogervorst@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Promoveer account direct als het al bestaat
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE lower(email) = 'ah.hogervorst@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
