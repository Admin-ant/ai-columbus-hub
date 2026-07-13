ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'nl';

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS preferred_locale text;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_locale_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_locale_check CHECK (locale IN ('nl','en','de'));

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_preferred_locale_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_preferred_locale_check CHECK (preferred_locale IS NULL OR preferred_locale IN ('nl','en','de'));