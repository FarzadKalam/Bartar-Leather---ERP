-- Add customer status field for CRM pipeline in customers module
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_status text NOT NULL DEFAULT 'new_lead';

UPDATE public.customers
SET customer_status = 'new_lead'
WHERE customer_status IS NULL OR btrim(customer_status) = '';
