ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS model_name text;

ALTER TABLE IF EXISTS public.production_boms
  ADD COLUMN IF NOT EXISTS model_name text;

ALTER TABLE IF EXISTS public.production_orders
  ADD COLUMN IF NOT EXISTS model_name text;
