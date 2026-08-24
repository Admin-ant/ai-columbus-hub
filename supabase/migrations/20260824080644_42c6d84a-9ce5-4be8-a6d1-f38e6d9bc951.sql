ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS credit_note_id uuid NULL REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credit_of_invoice_id uuid NULL REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_credit_note_id ON public.invoices(credit_note_id);
CREATE INDEX IF NOT EXISTS idx_invoices_credit_of_invoice_id ON public.invoices(credit_of_invoice_id);