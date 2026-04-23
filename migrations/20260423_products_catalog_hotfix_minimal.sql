CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS product_category text,
  ADD COLUMN IF NOT EXISTS model_name text,
  ADD COLUMN IF NOT EXISTS brand_name text,
  ADD COLUMN IF NOT EXISTS lining_width text,
  ADD COLUMN IF NOT EXISTS production_order_id uuid REFERENCES public.production_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grid_materials jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sub_stock numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leather_colors jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS leather_effect jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fitting_colors jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS catalog_role text DEFAULT 'standalone',
  ADD COLUMN IF NOT EXISTS parent_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_signature text,
  ADD COLUMN IF NOT EXISTS variant_values jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS site_remote_id text,
  ADD COLUMN IF NOT EXISTS site_sync_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS site_sync_status text DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS site_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS site_sync_error text;

ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS related_bom uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'production_boms'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_related_bom_fkey'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_related_bom_fkey
      FOREIGN KEY (related_bom)
      REFERENCES public.production_boms(id)
      ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.products
SET catalog_role = 'standalone'
WHERE catalog_role IS NULL;

UPDATE public.products
SET grid_materials = '[]'::jsonb
WHERE grid_materials IS NULL;

UPDATE public.products
SET sub_stock = 0
WHERE sub_stock IS NULL;

UPDATE public.products
SET variant_values = '{}'::jsonb
WHERE variant_values IS NULL;

UPDATE public.products
SET site_sync_enabled = false
WHERE site_sync_enabled IS NULL;

UPDATE public.products
SET site_sync_status = 'idle'
WHERE site_sync_status IS NULL;

UPDATE public.products
SET leather_colors = '[]'::jsonb
WHERE leather_colors IS NULL;

UPDATE public.products
SET leather_effect = '[]'::jsonb
WHERE leather_effect IS NULL;

UPDATE public.products
SET fitting_colors = '[]'::jsonb
WHERE fitting_colors IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_parent_product_id
  ON public.products(parent_product_id);

CREATE INDEX IF NOT EXISTS idx_products_production_order_id
  ON public.products(production_order_id);

CREATE TABLE IF NOT EXISTS public.product_attributes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  scope_type text NOT NULL DEFAULT 'parent',
  parent_product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  value_type text NOT NULL DEFAULT 'select',
  option_source_type text NOT NULL DEFAULT 'custom',
  source_field_key text,
  is_variation boolean NOT NULL DEFAULT true,
  is_visible_on_site boolean NOT NULL DEFAULT true,
  sort_order int4 NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_attribute_options (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  attribute_id uuid NOT NULL REFERENCES public.product_attributes(id) ON DELETE CASCADE,
  label text NOT NULL,
  value text NOT NULL,
  sort_order int4 NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_attributes_parent
  ON public.product_attributes(parent_product_id);

CREATE INDEX IF NOT EXISTS idx_product_attribute_options_attribute
  ON public.product_attribute_options(attribute_id);

ALTER TABLE public.product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_attribute_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Product Attributes Access" ON public.product_attributes;
DROP POLICY IF EXISTS "Product Attribute Options Access" ON public.product_attribute_options;

CREATE POLICY "Product Attributes Access"
ON public.product_attributes
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Product Attribute Options Access"
ON public.product_attribute_options
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
