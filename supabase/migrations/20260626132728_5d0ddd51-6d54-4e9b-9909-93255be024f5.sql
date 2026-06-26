
CREATE TABLE IF NOT EXISTS public.mail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  folder text NOT NULL DEFAULT 'inbox' CHECK (folder IN ('inbox','sent','draft','trash')),
  thread_id uuid,
  from_email text,
  from_name text,
  to_emails text[] NOT NULL DEFAULT '{}',
  cc_emails text[] NOT NULL DEFAULT '{}',
  bcc_emails text[] NOT NULL DEFAULT '{}',
  subject text,
  body_text text,
  body_html text,
  in_reply_to text,
  message_id text,
  provider_message_id text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'received',
  error text,
  sent_at timestamptz,
  received_at timestamptz,
  read_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_messages TO authenticated;
GRANT ALL ON public.mail_messages TO service_role;

ALTER TABLE public.mail_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mail_select_org" ON public.mail_messages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = mail_messages.organization_id AND m.user_id = auth.uid()));

CREATE POLICY "mail_insert_org" ON public.mail_messages FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = mail_messages.organization_id AND m.user_id = auth.uid()));

CREATE POLICY "mail_update_org" ON public.mail_messages FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = mail_messages.organization_id AND m.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = mail_messages.organization_id AND m.user_id = auth.uid()));

CREATE POLICY "mail_delete_org" ON public.mail_messages FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = mail_messages.organization_id AND m.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS mail_messages_org_folder_idx ON public.mail_messages(organization_id, folder, received_at DESC, sent_at DESC);
CREATE INDEX IF NOT EXISTS mail_messages_thread_idx ON public.mail_messages(thread_id);
CREATE INDEX IF NOT EXISTS mail_messages_client_idx ON public.mail_messages(client_id);
CREATE INDEX IF NOT EXISTS mail_messages_provider_idx ON public.mail_messages(provider_message_id);

CREATE TRIGGER mail_messages_set_updated_at
BEFORE UPDATE ON public.mail_messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
