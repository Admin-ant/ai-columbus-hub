
CREATE TABLE public.sequence_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequence_templates TO authenticated;
GRANT ALL ON public.sequence_templates TO service_role;

ALTER TABLE public.sequence_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sequence templates"
  ON public.sequence_templates
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX sequence_templates_user_idx ON public.sequence_templates(user_id, created_at DESC);

CREATE TRIGGER update_sequence_templates_updated_at
  BEFORE UPDATE ON public.sequence_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
