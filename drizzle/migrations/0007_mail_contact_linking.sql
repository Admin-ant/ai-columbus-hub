ALTER TABLE public.client_contacts ADD COLUMN secondary_email text;
ALTER TABLE public.client_contacts ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.mail_messages ADD COLUMN auto_linked_contact_id uuid;
CREATE INDEX client_contacts_email_match ON public.client_contacts (organization_id, lower(btrim(email))) WHERE is_active;
CREATE INDEX client_contacts_secondary_email_match ON public.client_contacts (organization_id, lower(btrim(secondary_email))) WHERE is_active;

CREATE FUNCTION public.match_inbound_mail_contact() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE matching_clients uuid[]; matching_contact uuid; sender text;
BEGIN
 IF NEW.folder <> 'inbox' OR (NEW.client_id IS NOT NULL AND NEW.auto_linked_contact_id IS NULL) THEN RETURN NEW; END IF;
 sender := lower(btrim(CASE WHEN NEW.from_email LIKE '%<%>%' THEN substring(NEW.from_email FROM '<([^>]+)>') ELSE NEW.from_email END));
 SELECT array_agg(DISTINCT c.client_id), (array_agg(c.id ORDER BY c.is_primary DESC, c.created_at, c.id))[1]
 INTO matching_clients, matching_contact
 FROM public.client_contacts c JOIN public.clients cl ON cl.id=c.client_id AND cl.organization_id=c.organization_id
 WHERE c.organization_id=NEW.organization_id AND c.is_active
 AND sender IS NOT NULL AND sender <> ''
 AND (lower(btrim(c.email))=sender OR lower(btrim(c.secondary_email))=sender);
 IF cardinality(matching_clients)=1 THEN
   NEW.client_id := matching_clients[1]; NEW.auto_linked_contact_id := matching_contact;
 ELSIF NEW.auto_linked_contact_id IS NOT NULL THEN
   NEW.client_id := NULL; NEW.auto_linked_contact_id := NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.match_inbound_mail_contact() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER match_inbound_mail_contact BEFORE INSERT OR UPDATE OF from_email, organization_id, folder ON public.mail_messages FOR EACH ROW EXECUTE FUNCTION public.match_inbound_mail_contact();

CREATE FUNCTION public.relink_contact_mail_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN
   UPDATE public.mail_messages SET from_email=from_email WHERE organization_id=OLD.organization_id AND folder='inbox' AND (auto_linked_contact_id=OLD.id OR lower(btrim(from_email)) IN (lower(btrim(OLD.email)),lower(btrim(OLD.secondary_email))));
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
   UPDATE public.mail_messages SET from_email=from_email WHERE organization_id=NEW.organization_id AND folder='inbox' AND (client_id IS NULL OR auto_linked_contact_id IS NOT NULL) AND lower(btrim(CASE WHEN from_email LIKE '%<%>%' THEN substring(from_email FROM '<([^>]+)>') ELSE from_email END)) IN (lower(btrim(NEW.email)),lower(btrim(NEW.secondary_email)));
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.relink_contact_mail_history() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER relink_contact_mail_history AFTER INSERT OR UPDATE OF email, secondary_email, is_active, client_id, organization_id OR DELETE ON public.client_contacts FOR EACH ROW EXECUTE FUNCTION public.relink_contact_mail_history();

-- Backfill as part of the new automatic linking schema, preserving manually linked messages.
UPDATE public.mail_messages SET from_email=from_email WHERE folder='inbox' AND client_id IS NULL;