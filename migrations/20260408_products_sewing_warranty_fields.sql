ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS sewing_type text,
  ADD COLUMN IF NOT EXISTS warranty_months int4,
  ADD COLUMN IF NOT EXISTS after_sales_service_months int4;
