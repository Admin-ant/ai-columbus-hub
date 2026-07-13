
-- 1. Add missing organization columns
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS account_holder text;

-- 2. Invoice number sequences per year
CREATE TABLE IF NOT EXISTS public.invoice_number_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year integer NOT NULL,
  prefix text NOT NULL,
  next_seq integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, year)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_number_sequences TO authenticated;
GRANT ALL ON public.invoice_number_sequences TO service_role;

ALTER TABLE public.invoice_number_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view invoice sequences"
  ON public.invoice_number_sequences FOR SELECT
  TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id));

CREATE POLICY "Members can manage invoice sequences"
  ON public.invoice_number_sequences FOR ALL
  TO authenticated
  USING (app_private.has_org_access(auth.uid(), organization_id))
  WITH CHECK (app_private.has_org_access(auth.uid(), organization_id));

CREATE TRIGGER trg_invoice_number_sequences_updated_at
  BEFORE UPDATE ON public.invoice_number_sequences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Rewrite next_invoice_number to use per-year sequences
CREATE OR REPLACE FUNCTION app_private.next_invoice_number(_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _year integer := extract(year from now())::int;
  _year_txt text := _year::text;
  _prefix text;
  _seq integer;
  _org_prefix text;
  _org_seq integer;
BEGIN
  SELECT invoice_prefix, next_invoice_seq
    INTO _org_prefix, _org_seq
    FROM public.organizations
   WHERE id = _org_id;
  IF _org_prefix IS NULL THEN
    RAISE EXCEPTION 'Organization % not found', _org_id;
  END IF;

  -- Seed the row for this year if it does not exist yet.
  -- For the current year we take over the legacy organizations.next_invoice_seq,
  -- so existing numbering continues seamlessly.
  INSERT INTO public.invoice_number_sequences (organization_id, year, prefix, next_seq)
  VALUES (_org_id, _year, _org_prefix, GREATEST(_org_seq, 1))
  ON CONFLICT (organization_id, year) DO NOTHING;

  UPDATE public.invoice_number_sequences
     SET next_seq = next_seq + 1
   WHERE organization_id = _org_id AND year = _year
   RETURNING prefix, next_seq - 1
     INTO _prefix, _seq;

  RETURN _prefix || '-' || _year_txt || '-' || lpad(_seq::text, 5, '0');
END;
$function$;
