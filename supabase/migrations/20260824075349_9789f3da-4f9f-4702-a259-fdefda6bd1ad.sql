ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'handmatig',
  ADD COLUMN IF NOT EXISTS emailed_at timestamptz;

CREATE OR REPLACE FUNCTION public.announce_new_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.announcements (organization_id, title, body, category, source, created_by)
  VALUES (
    NEW.organization_id,
    'Nieuwe lead: ' || coalesce(nullif(NEW.company, ''), nullif(NEW.name, ''), 'onbekend'),
    coalesce(nullif(NEW.name, ''), '') ||
      coalesce(' — ' || nullif(NEW.email, ''), '') ||
      E'\nStatus: ' || coalesce(NEW.stage::text, 'nieuwe'),
    'update',
    'lead_nieuw',
    NEW.created_by
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.announce_lead_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO public.announcements (organization_id, title, body, category, source, created_by)
    VALUES (
      NEW.organization_id,
      'Lead bijgewerkt: ' || coalesce(nullif(NEW.company, ''), nullif(NEW.name, ''), 'onbekend'),
      'Status gewijzigd van ' || coalesce(OLD.stage::text, '-') || ' naar ' || coalesce(NEW.stage::text, '-') || '.',
      'update',
      'lead_status',
      NEW.created_by
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.announce_new_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.announcements (organization_id, title, body, category, source, created_by)
  VALUES (
    NEW.organization_id,
    'Nieuwe klant: ' || coalesce(nullif(NEW.name, ''), 'onbekend'),
    'Er is een nieuw bedrijf toegevoegd aan de klantenlijst.' || coalesce(E'\n' || nullif(NEW.email, ''), ''),
    'update',
    'klant_nieuw',
    NEW.created_by
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_announce_new_lead ON public.leads;
CREATE TRIGGER trg_announce_new_lead
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.announce_new_lead();

DROP TRIGGER IF EXISTS trg_announce_lead_stage_change ON public.leads;
CREATE TRIGGER trg_announce_lead_stage_change
AFTER UPDATE OF stage ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.announce_lead_stage_change();

DROP TRIGGER IF EXISTS trg_announce_new_client ON public.clients;
CREATE TRIGGER trg_announce_new_client
AFTER INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.announce_new_client();