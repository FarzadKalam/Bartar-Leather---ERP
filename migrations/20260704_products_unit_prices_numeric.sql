ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS main_unit_price numeric,
  ADD COLUMN IF NOT EXISTS sub_unit_price numeric;

ALTER TABLE public.products
  ALTER COLUMN main_unit_price TYPE numeric USING main_unit_price::numeric,
  ALTER COLUMN sub_unit_price TYPE numeric USING sub_unit_price::numeric;
