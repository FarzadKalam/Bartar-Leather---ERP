-- دادهٔ ویجت نوارهای تولید باید در سرور محدود شود؛ فیلتر کردن در مرورگر
-- برای جلوگیری از مشاهدهٔ دادهٔ مراحل دیگران کافی نیست.

CREATE INDEX IF NOT EXISTS idx_tasks_dashboard_production_assignee
  ON public.tasks (related_production_order, assignee_id, assignee_role_id, sort_order)
  WHERE related_production_order IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_dashboard_production_workflow(
  p_include_all boolean DEFAULT false,
  p_statuses text[] DEFAULT NULL
)
RETURNS TABLE (
  group_id uuid,
  group_name text,
  group_status text,
  production_order_id uuid,
  production_order_name text,
  production_order_status text,
  stage_id uuid,
  stage_name text,
  stage_status text,
  due_date timestamptz,
  assignee_name text,
  assignee_avatar_url text,
  assignee_is_role boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role_id uuid;
  v_permissions jsonb := '{}'::jsonb;
  v_dashboard jsonb := '{}'::jsonb;
  v_fields jsonb := '{}'::jsonb;
  v_role_title text := '';
  v_can_view_all boolean := false;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RETURN;
  END IF;

  SELECT p.role_id INTO v_role_id
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_role_id IS NOT NULL THEN
    SELECT coalesce(r.permissions, '{}'::jsonb), coalesce(r.title, '')
    INTO v_permissions, v_role_title
    FROM public.org_roles r
    WHERE r.id = v_role_id;
  END IF;

  v_dashboard := coalesce(v_permissions -> '__dashboard_widgets', '{}'::jsonb);
  v_fields := coalesce(v_dashboard -> 'fields', '{}'::jsonb);
  IF coalesce(v_dashboard ->> 'view', 'true') = 'false'
     OR coalesce(v_fields ->> 'production_lines', 'true') = 'false' THEN
    RETURN;
  END IF;

  -- سازگاری با نقش‌های مدیریتی از پیش ایجادشده، در کنار اجازهٔ صریح نقش.
  v_can_view_all := coalesce((v_fields ->> 'production_lines_all')::boolean, false)
    OR v_role_title ~* '(مدیر|management|manager|admin|administrator|مالک)';

  RETURN QUERY
  SELECT
    grp.id,
    coalesce(grp.name, 'سفارش‌های بدون گروه'),
    grp.status,
    po.id,
    po.name,
    po.status,
    t.id,
    t.name,
    t.status,
    t.due_date,
    CASE
      WHEN t.assignee_type = 'role' OR t.assignee_role_id IS NOT NULL
        THEN coalesce(assigned_role.title, 'نقش تعیین‌نشده')
      ELSE coalesce(assignee.full_name, 'مسئول تعیین‌نشده')
    END,
    CASE WHEN t.assignee_type = 'role' OR t.assignee_role_id IS NOT NULL THEN NULL ELSE assignee.avatar_url END,
    (t.assignee_type = 'role' OR t.assignee_role_id IS NOT NULL)
  FROM public.tasks t
  JOIN public.production_orders po ON po.id = t.related_production_order
  LEFT JOIN LATERAL (
    SELECT g.id, g.name, g.status, g.updated_at
    FROM public.production_group_orders g
    WHERE g.id = po.production_group_order_id
       OR g.production_order_ids @> jsonb_build_array(po.id)
    ORDER BY (g.id = po.production_group_order_id) DESC
    LIMIT 1
  ) grp ON true
  LEFT JOIN public.profiles assignee ON assignee.id = t.assignee_id
  LEFT JOIN public.org_roles assigned_role ON assigned_role.id = coalesce(t.assignee_role_id, CASE WHEN t.assignee_type = 'role' THEN t.assignee_id ELSE NULL END)
  WHERE t.related_production_order IS NOT NULL
    AND (p_statuses IS NULL OR cardinality(p_statuses) = 0 OR po.status = ANY(p_statuses))
    AND (
      (p_include_all AND v_can_view_all)
      OR t.assignee_id = v_user_id
      OR (v_role_id IS NOT NULL AND (t.assignee_role_id = v_role_id OR (t.assignee_type = 'role' AND t.assignee_id = v_role_id)))
    )
  ORDER BY coalesce(grp.updated_at, po.updated_at) DESC NULLS LAST, po.name, t.production_line_id, t.sort_order, t.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_production_workflow(boolean, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_production_workflow(boolean, text[]) TO authenticated;
