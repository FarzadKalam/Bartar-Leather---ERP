BEGIN;

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

  v_permissions jsonb := '{}'::jsonb;
  v_files_fields jsonb := '{}'::jsonb;
  v_allowed_logins text := '';
  v_allowed_ips text := '';

  v_has_rules boolean := false;
BEGIN
  IF v_action = '' OR v_action NOT IN ('view', 'insert', 'update', 'delete') THEN
    RETURN false;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_role_id IS NOT NULL THEN
    SELECT coalesce(r.permissions, '{}'::jsonb)
    INTO v_permissions
    FROM public.org_roles r
    WHERE r.id = v_role_id;

    v_files_fields := coalesce(v_permissions -> '__files_access' -> 'fields', '{}'::jsonb);
  END IF;

  v_allowed_logins := btrim(coalesce(v_files_fields ->> 'allowed_login', ''));
  IF v_allowed_logins <> '' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM regexp_split_to_table(v_allowed_logins, E'[\\s,;\\n\\r\\t]+') AS token
      WHERE btrim(token) <> ''
        AND lower(btrim(token)) = v_login
    ) THEN
      RETURN false;
    END IF;
  END IF;

  v_allowed_ips := btrim(coalesce(v_files_fields ->> 'allowed_ip_cidrs', ''));
  IF v_allowed_ips <> '' THEN
    IF v_ip IS NULL THEN
      RETURN false;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM regexp_split_to_table(v_allowed_ips, E'[\\s,;\\n\\r\\t]+') AS token
      WHERE btrim(token) <> ''
        AND btrim(token) ~ '^[0-9]{1,3}(\\.[0-9]{1,3}){3}(/[0-9]{1,2})?$'
        AND v_ip <<= (btrim(token))::cidr
    ) THEN
      RETURN false;
    END IF;
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

COMMIT;
