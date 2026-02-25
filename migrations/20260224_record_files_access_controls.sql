BEGIN;

CREATE TABLE IF NOT EXISTS public.record_files_access_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL CHECK (action IN ('view', 'insert', 'update', 'delete')),
  allowed_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  allowed_role_id uuid REFERENCES public.org_roles(id) ON DELETE CASCADE,
  allowed_login text,
  allowed_ip_cidr cidr,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_record_files_access_rules_action_active
  ON public.record_files_access_rules(action, is_active);

CREATE INDEX IF NOT EXISTS idx_record_files_access_rules_user
  ON public.record_files_access_rules(allowed_user_id);

CREATE INDEX IF NOT EXISTS idx_record_files_access_rules_role
  ON public.record_files_access_rules(allowed_role_id);

ALTER TABLE public.record_files_access_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service Manage Record Files Access Rules" ON public.record_files_access_rules;
CREATE POLICY "Service Manage Record Files Access Rules"
ON public.record_files_access_rules
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.request_client_ip()
RETURNS inet
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  headers jsonb;
  raw_ip text;
BEGIN
  BEGIN
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN others THEN
    headers := NULL;
  END;

  raw_ip := btrim(split_part(coalesce(headers->>'x-forwarded-for', headers->>'x-real-ip', ''), ',', 1));

  IF raw_ip <> '' THEN
    BEGIN
      RETURN raw_ip::inet;
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
  END IF;

  BEGIN
    RETURN inet_client_addr();
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_record_files(p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text := lower(coalesce(p_action, ''));
  v_user_id uuid := auth.uid();
  v_role_id uuid := public.get_current_user_role_id();
  v_login text := lower(coalesce((auth.jwt() ->> 'email'), ''));
  v_ip inet := public.request_client_ip();
  v_has_rules boolean := false;
BEGIN
  IF v_action = '' OR v_action NOT IN ('view', 'insert', 'update', 'delete') THEN
    RETURN false;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.record_files_access_rules r
    WHERE r.is_active = true
      AND lower(r.action) = v_action
  )
  INTO v_has_rules;

  IF NOT v_has_rules THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.record_files_access_rules r
    WHERE r.is_active = true
      AND lower(r.action) = v_action
      AND (r.allowed_user_id IS NULL OR r.allowed_user_id = v_user_id)
      AND (r.allowed_role_id IS NULL OR r.allowed_role_id = v_role_id)
      AND (coalesce(btrim(r.allowed_login), '') = '' OR lower(r.allowed_login) = v_login)
      AND (r.allowed_ip_cidr IS NULL OR (v_ip IS NOT NULL AND v_ip <<= r.allowed_ip_cidr))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_record_files(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_record_files(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_record_files(text) TO anon;

DROP POLICY IF EXISTS "Public Access Record Files" ON public.record_files;
DROP POLICY IF EXISTS "Public Insert Record Files" ON public.record_files;
DROP POLICY IF EXISTS "Public Update Record Files" ON public.record_files;
DROP POLICY IF EXISTS "Public Delete Record Files" ON public.record_files;
DROP POLICY IF EXISTS "Record Files Select Guard" ON public.record_files;
DROP POLICY IF EXISTS "Record Files Insert Guard" ON public.record_files;
DROP POLICY IF EXISTS "Record Files Update Guard" ON public.record_files;
DROP POLICY IF EXISTS "Record Files Delete Guard" ON public.record_files;

CREATE POLICY "Record Files Select Guard"
ON public.record_files
FOR SELECT
USING (public.can_access_record_files('view'));

CREATE POLICY "Record Files Insert Guard"
ON public.record_files
FOR INSERT
WITH CHECK (public.can_access_record_files('insert'));

CREATE POLICY "Record Files Update Guard"
ON public.record_files
FOR UPDATE
USING (public.can_access_record_files('update'))
WITH CHECK (public.can_access_record_files('update'));

CREATE POLICY "Record Files Delete Guard"
ON public.record_files
FOR DELETE
USING (public.can_access_record_files('delete'));

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Product Images" ON public.product_images;
DROP POLICY IF EXISTS "Public Insert Product Images" ON public.product_images;
DROP POLICY IF EXISTS "Public Delete Product Images" ON public.product_images;
DROP POLICY IF EXISTS "Public Update Product Images" ON public.product_images;
DROP POLICY IF EXISTS "Product Images Select Guard" ON public.product_images;
DROP POLICY IF EXISTS "Product Images Insert Guard" ON public.product_images;
DROP POLICY IF EXISTS "Product Images Delete Guard" ON public.product_images;
DROP POLICY IF EXISTS "Product Images Update Guard" ON public.product_images;

CREATE POLICY "Product Images Select Guard"
ON public.product_images
FOR SELECT
USING (public.can_access_record_files('view'));

CREATE POLICY "Product Images Insert Guard"
ON public.product_images
FOR INSERT
WITH CHECK (public.can_access_record_files('insert'));

CREATE POLICY "Product Images Delete Guard"
ON public.product_images
FOR DELETE
USING (public.can_access_record_files('delete'));

CREATE POLICY "Product Images Update Guard"
ON public.product_images
FOR UPDATE
USING (public.can_access_record_files('update'))
WITH CHECK (public.can_access_record_files('update'));

COMMIT;
