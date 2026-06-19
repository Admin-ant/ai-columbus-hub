DROP POLICY IF EXISTS "Medewerkers kunnen leads aanmaken" ON public.leads;
DROP POLICY IF EXISTS "Medewerkers kunnen leads bewerken" ON public.leads;

CREATE POLICY "Medewerkers kunnen leads aanmaken" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Medewerkers kunnen leads bewerken" ON public.leads
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);