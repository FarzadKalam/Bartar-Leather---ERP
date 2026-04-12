BEGIN;

ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS catalog_role text NOT NULL DEFAULT 'standalone',
  ADD COLUMN IF NOT EXISTS parent_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_signature text,
  ADD COLUMN IF NOT EXISTS variant_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS site_remote_id text,
  ADD COLUMN IF NOT EXISTS site_sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS site_sync_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS site_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS site_sync_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_catalog_role_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_catalog_role_check
      CHECK (catalog_role IN ('standalone', 'parent', 'variant'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_parent_product_id
  ON public.products(parent_product_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_parent_variant_signature
  ON public.products(parent_product_id, variant_signature)
  WHERE parent_product_id IS NOT NULL AND variant_signature IS NOT NULL;

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_attributes_scope_type_check'
  ) THEN
    ALTER TABLE public.product_attributes
      ADD CONSTRAINT product_attributes_scope_type_check
      CHECK (scope_type IN ('global', 'parent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_attributes_value_type_check'
  ) THEN
    ALTER TABLE public.product_attributes
      ADD CONSTRAINT product_attributes_value_type_check
      CHECK (value_type IN ('select', 'multi_select', 'text', 'number', 'color'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_attributes_option_source_type_check'
  ) THEN
    ALTER TABLE public.product_attributes
      ADD CONSTRAINT product_attributes_option_source_type_check
      CHECK (option_source_type IN ('field', 'custom'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_attributes_parent
  ON public.product_attributes(parent_product_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_attributes_scope_key
  ON public.product_attributes(scope_type, COALESCE(parent_product_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

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

COMMIT;
