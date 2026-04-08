ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS site_code text,
  ADD COLUMN IF NOT EXISTS site_product_link text;
