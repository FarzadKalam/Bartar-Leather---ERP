ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS allow_negative_inventory boolean NOT NULL DEFAULT false;
