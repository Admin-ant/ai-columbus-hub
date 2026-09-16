-- Enums
DO $$ BEGIN
  CREATE TYPE public.ticket_status AS ENUM ('nieuw','in_behandeling','wachten_op_klant','opgelost','gesloten');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ticket_priority AS ENUM ('laag','normaal','hoog','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ticket_source AS ENUM ('manual','web','email','whatsapp','sms','intern');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Categories
CREATE TABLE public.ticket_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ticket_categories_org_name_idx ON public.ticket_categories (organization_id, lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_categories TO authenticated;
GRANT ALL ON public.ticket_categories TO service_role;
ALTER TABLE public.ticket_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ticket_categories org access" ON public.ticket_categories FOR ALL
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

-- Number sequences
CREATE TABLE public.ticket_number_sequences (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, year)
);
GRANT SELECT ON public.ticket_number_sequences TO authenticated;
GRANT ALL ON public.ticket_number_sequences TO service_role;
ALTER TABLE public.ticket_number_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view ticket sequences" ON public.ticket_number_sequences FOR SELECT
  USING (app_private.has_org_access(auth.uid(), organization_id));

-- Tickets
CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ticket_number text NOT NULL,
  subject text NOT NULL,
  status public.ticket_status NOT NULL DEFAULT 'nieuw',
  priority public.ticket_priority NOT NULL DEFAULT 'normaal',
  source public.ticket_source NOT NULL DEFAULT 'manual',
  category_id uuid REFERENCES public.ticket_categories(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.client_contacts(id) ON DELETE SET NULL,
  assigned_to uuid,
  requester_name text,
  requester_email text,
  requester_phone text,
  is_internal boolean NOT NULL DEFAULT false,
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tickets_org_number_idx ON public.tickets (organization_id, ticket_number);
CREATE INDEX tickets_org_status_idx ON public.tickets (organization_id, status);
CREATE INDEX tickets_client_idx ON public.tickets (client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tickets org access" ON public.tickets FOR ALL
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));
CREATE TRIGGER tickets_updated_at BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Messages
CREATE TABLE public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'out',
  is_internal boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  author_id uuid,
  author_name text,
  channel text NOT NULL DEFAULT 'app',
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_messages_ticket_idx ON public.ticket_messages (ticket_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_messages TO authenticated;
GRANT ALL ON public.ticket_messages TO service_role;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ticket_messages org access" ON public.ticket_messages FOR ALL
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

-- Attachments
CREATE TABLE public.ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_attachments_ticket_idx ON public.ticket_attachments (ticket_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_attachments TO authenticated;
GRANT ALL ON public.ticket_attachments TO service_role;
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ticket_attachments org access" ON public.ticket_attachments FOR ALL
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

-- Events (history)
CREATE TABLE public.ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_name text,
  field text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_events_ticket_idx ON public.ticket_events (ticket_id, created_at);
GRANT SELECT, INSERT ON public.ticket_events TO authenticated;
GRANT ALL ON public.ticket_events TO service_role;
ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ticket_events select" ON public.ticket_events FOR SELECT
  USING (app_private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "ticket_events insert" ON public.ticket_events FOR INSERT
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

-- Ticket number generator
CREATE OR REPLACE FUNCTION public.next_ticket_number(_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _year integer := EXTRACT(YEAR FROM now())::int;
  _num integer;
BEGIN
  INSERT INTO public.ticket_number_sequences (organization_id, year, last_number)
  VALUES (_org_id, _year, 1)
  ON CONFLICT (organization_id, year)
  DO UPDATE SET last_number = public.ticket_number_sequences.last_number + 1
  RETURNING last_number INTO _num;

  RETURN 'TCK-' || _year::text || '-' || lpad(_num::text, 4, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_ticket_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_ticket_number(uuid) TO service_role;

-- Keep last_message_at in sync
CREATE OR REPLACE FUNCTION public.touch_ticket_last_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tickets
     SET last_message_at = NEW.created_at,
         updated_at = now()
   WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_ticket_last_message() FROM PUBLIC;
CREATE TRIGGER ticket_messages_touch AFTER INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_ticket_last_message();