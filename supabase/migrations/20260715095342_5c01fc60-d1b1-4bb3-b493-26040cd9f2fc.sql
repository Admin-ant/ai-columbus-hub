
CREATE TABLE public.chat_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent text,
  prompt text NOT NULL,
  reply text,
  status text NOT NULL CHECK (status IN ('success','failed')),
  error text,
  source text,
  model text,
  duration_ms integer,
  message_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.chat_audit_log TO authenticated;
GRANT ALL ON public.chat_audit_log TO service_role;

ALTER TABLE public.chat_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own chat audit log"
  ON public.chat_audit_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_chat_audit_log_user_created
  ON public.chat_audit_log (user_id, created_at DESC);
