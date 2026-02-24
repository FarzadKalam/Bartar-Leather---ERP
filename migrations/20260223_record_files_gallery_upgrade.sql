BEGIN;

ALTER TABLE IF EXISTS public.production_orders
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE IF EXISTS public.production_boms
  ADD COLUMN IF NOT EXISTS image_url text;

CREATE TABLE IF NOT EXISTS public.record_files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id text NOT NULL,
  record_id uuid NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL DEFAULT 'file',
  file_name text,
  mime_type text,
  sort_order int4 NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.record_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Record Files" ON public.record_files;
DROP POLICY IF EXISTS "Public Insert Record Files" ON public.record_files;
DROP POLICY IF EXISTS "Public Update Record Files" ON public.record_files;
DROP POLICY IF EXISTS "Public Delete Record Files" ON public.record_files;

CREATE POLICY "Public Access Record Files"
ON public.record_files
FOR SELECT
USING (true);

CREATE POLICY "Public Insert Record Files"
ON public.record_files
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public Update Record Files"
ON public.record_files
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "Public Delete Record Files"
ON public.record_files
FOR DELETE
USING (true);

CREATE INDEX IF NOT EXISTS idx_record_files_module_record
ON public.record_files(module_id, record_id);

CREATE INDEX IF NOT EXISTS idx_record_files_created_at
ON public.record_files(created_at DESC);

INSERT INTO public.record_files (
  module_id,
  record_id,
  file_url,
  file_type,
  file_name,
  mime_type,
  sort_order,
  created_at
)
SELECT
  'products',
  pi.product_id,
  pi.image_url,
  'image',
  NULL,
  NULL,
  COALESCE(pi.sort_order, 0),
  COALESCE(pi.created_at, now())
FROM public.product_images pi
WHERE pi.product_id IS NOT NULL
  AND pi.image_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.record_files rf
    WHERE rf.module_id = 'products'
      AND rf.record_id = pi.product_id
      AND rf.file_url = pi.image_url
  );

COMMIT;
