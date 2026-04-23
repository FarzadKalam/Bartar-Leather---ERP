BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Repair product columns used by the catalog/variant UI. All additions are
-- idempotent so this migration can be applied safely on partially-upgraded DBs.
ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS product_category text,
  ADD COLUMN IF NOT EXISTS model_name text,
  ADD COLUMN IF NOT EXISTS brand_name text,
  ADD COLUMN IF NOT EXISTS related_bom uuid REFERENCES public.production_boms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS leather_colors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS leather_effect jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fitting_colors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lining_width text,
  ADD COLUMN IF NOT EXISTS catalog_role text DEFAULT 'standalone',
  ADD COLUMN IF NOT EXISTS parent_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_signature text,
  ADD COLUMN IF NOT EXISTS variant_values jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS site_remote_id text,
  ADD COLUMN IF NOT EXISTS site_sync_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS site_sync_status text DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS site_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS site_sync_error text;

UPDATE public.products
SET catalog_role = 'standalone'
WHERE catalog_role IS NULL
   OR catalog_role NOT IN ('standalone', 'parent', 'variant');

UPDATE public.products
SET parent_product_id = NULL
WHERE catalog_role <> 'variant';

UPDATE public.products
SET variant_values = '{}'::jsonb
WHERE variant_values IS NULL
   OR jsonb_typeof(variant_values) <> 'object';

UPDATE public.products
SET variant_signature = NULL
WHERE catalog_role <> 'variant';

UPDATE public.products
SET site_sync_enabled = false
WHERE site_sync_enabled IS NULL;

UPDATE public.products
SET site_sync_status = 'idle'
WHERE site_sync_status IS NULL
   OR btrim(site_sync_status) = '';

UPDATE public.products
SET leather_colors = '[]'::jsonb
WHERE leather_colors IS NULL
   OR jsonb_typeof(leather_colors) <> 'array';

UPDATE public.products
SET leather_effect = '[]'::jsonb
WHERE leather_effect IS NULL
   OR jsonb_typeof(leather_effect) <> 'array';

UPDATE public.products
SET fitting_colors = '[]'::jsonb
WHERE fitting_colors IS NULL
   OR jsonb_typeof(fitting_colors) <> 'array';

ALTER TABLE IF EXISTS public.products
  ALTER COLUMN catalog_role SET DEFAULT 'standalone',
  ALTER COLUMN catalog_role SET NOT NULL,
  ALTER COLUMN variant_values SET DEFAULT '{}'::jsonb,
  ALTER COLUMN variant_values SET NOT NULL,
  ALTER COLUMN site_sync_enabled SET DEFAULT false,
  ALTER COLUMN site_sync_enabled SET NOT NULL,
  ALTER COLUMN site_sync_status SET DEFAULT 'idle',
  ALTER COLUMN site_sync_status SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_catalog_role_check'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products DROP CONSTRAINT products_catalog_role_check;
  END IF;

  ALTER TABLE public.products
    ADD CONSTRAINT products_catalog_role_check
    CHECK (catalog_role IN ('standalone', 'parent', 'variant'));
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_parent_not_self_check'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_parent_not_self_check
      CHECK (parent_product_id IS NULL OR parent_product_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_parent_product_id
  ON public.products(parent_product_id);

-- If duplicate variant signatures already exist, keep the first canonical row
-- and make later duplicates unique without deleting any product data.
WITH duplicate_variants AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY parent_product_id, variant_signature
      ORDER BY created_at NULLS LAST, id
    ) AS duplicate_rank
  FROM public.products
  WHERE parent_product_id IS NOT NULL
    AND variant_signature IS NOT NULL
)
UPDATE public.products AS p
SET variant_signature = p.variant_signature || '#legacy-duplicate-' || duplicate_variants.duplicate_rank::text || '-' || p.id::text
FROM duplicate_variants
WHERE p.id = duplicate_variants.id
  AND duplicate_variants.duplicate_rank > 1;

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

UPDATE public.product_attributes
SET scope_type = 'parent'
WHERE scope_type IS NULL
   OR scope_type NOT IN ('global', 'parent');

UPDATE public.product_attributes
SET value_type = 'select'
WHERE value_type IS NULL
   OR value_type NOT IN ('select', 'multi_select', 'text', 'number', 'color');

UPDATE public.product_attributes
SET option_source_type = 'custom'
WHERE option_source_type IS NULL
   OR option_source_type NOT IN ('field', 'custom');

UPDATE public.product_attributes
SET key = lower(regexp_replace(btrim(label), '\s+', '_', 'g'))
WHERE (key IS NULL OR btrim(key) = '')
  AND label IS NOT NULL
  AND btrim(label) <> '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_attributes_scope_type_check'
      AND conrelid = 'public.product_attributes'::regclass
  ) THEN
    ALTER TABLE public.product_attributes DROP CONSTRAINT product_attributes_scope_type_check;
  END IF;

  ALTER TABLE public.product_attributes
    ADD CONSTRAINT product_attributes_scope_type_check
    CHECK (scope_type IN ('global', 'parent'));

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_attributes_value_type_check'
      AND conrelid = 'public.product_attributes'::regclass
  ) THEN
    ALTER TABLE public.product_attributes DROP CONSTRAINT product_attributes_value_type_check;
  END IF;

  ALTER TABLE public.product_attributes
    ADD CONSTRAINT product_attributes_value_type_check
    CHECK (value_type IN ('select', 'multi_select', 'text', 'number', 'color'));

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_attributes_option_source_type_check'
      AND conrelid = 'public.product_attributes'::regclass
  ) THEN
    ALTER TABLE public.product_attributes DROP CONSTRAINT product_attributes_option_source_type_check;
  END IF;

  ALTER TABLE public.product_attributes
    ADD CONSTRAINT product_attributes_option_source_type_check
    CHECK (option_source_type IN ('field', 'custom'));
END $$;

CREATE INDEX IF NOT EXISTS idx_product_attributes_parent
  ON public.product_attributes(parent_product_id);

WITH duplicate_attributes AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY scope_type, COALESCE(parent_product_id, '00000000-0000-0000-0000-000000000000'::uuid), key
      ORDER BY created_at NULLS LAST, id
    ) AS duplicate_rank
  FROM public.product_attributes
)
UPDATE public.product_attributes AS pa
SET key = pa.key || '_legacy_duplicate_' || duplicate_attributes.duplicate_rank::text
FROM duplicate_attributes
WHERE pa.id = duplicate_attributes.id
  AND duplicate_attributes.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_attributes_scope_key
  ON public.product_attributes(scope_type, COALESCE(parent_product_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

CREATE INDEX IF NOT EXISTS idx_product_attribute_options_attribute
  ON public.product_attribute_options(attribute_id);

WITH duplicate_options AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY attribute_id, value
      ORDER BY created_at NULLS LAST, id
    ) AS duplicate_rank
  FROM public.product_attribute_options
)
UPDATE public.product_attribute_options AS pao
SET value = pao.value || '_legacy_duplicate_' || duplicate_options.duplicate_rank::text
FROM duplicate_options
WHERE pao.id = duplicate_options.id
  AND duplicate_options.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_attribute_options_attribute_value
  ON public.product_attribute_options(attribute_id, value);

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
