ALTER TABLE public.crm_activities
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.client_contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_crm_activities_contact ON public.crm_activities(contact_id);