
CREATE TABLE public.client_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert','update','delete')),
  changed_fields TEXT[],
  old_data JSONB,
  new_data JSONB,
  actor_id UUID,
  actor_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.client_audit_log TO authenticated;
GRANT ALL ON public.client_audit_log TO service_role;

ALTER TABLE public.client_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view client audit log"
  ON public.client_audit_log FOR SELECT TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE INDEX idx_client_audit_log_client ON public.client_audit_log(client_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_client_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor UUID := auth.uid();
  _email TEXT;
  _changed TEXT[] := ARRAY[]::TEXT[];
  _old JSONB;
  _new JSONB;
  _k TEXT;
BEGIN
  IF _actor IS NOT NULL THEN
    SELECT email INTO _email FROM auth.users WHERE id = _actor;
  END IF;

  IF TG_OP = 'INSERT' THEN
    _new := to_jsonb(NEW);
    INSERT INTO public.client_audit_log(organization_id, client_id, action, new_data, actor_id, actor_email)
    VALUES (NEW.organization_id, NEW.id, 'insert', _new, _actor, _email);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    _old := to_jsonb(OLD);
    _new := to_jsonb(NEW);
    FOR _k IN SELECT jsonb_object_keys(_new) LOOP
      IF _k NOT IN ('updated_at') AND (_old->_k) IS DISTINCT FROM (_new->_k) THEN
        _changed := array_append(_changed, _k);
      END IF;
    END LOOP;
    IF array_length(_changed, 1) IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.client_audit_log(organization_id, client_id, action, changed_fields, old_data, new_data, actor_id, actor_email)
    VALUES (NEW.organization_id, NEW.id, 'update', _changed, _old, _new, _actor, _email);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _old := to_jsonb(OLD);
    INSERT INTO public.client_audit_log(organization_id, client_id, action, old_data, actor_id, actor_email)
    VALUES (OLD.organization_id, OLD.id, 'delete', _old, _actor, _email);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_client_audit ON public.clients;
CREATE TRIGGER trg_client_audit
AFTER INSERT OR UPDATE OR DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.log_client_changes();
