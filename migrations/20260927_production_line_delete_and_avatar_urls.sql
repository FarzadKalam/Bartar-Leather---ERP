-- حذف خط تولید باید اتمیک باشد؛ حذف مستقیم قبلی به‌دلیل نبود policy حذف روی
-- production_lines با پاسخ 204 اما بدون حذف واقعی تمام می‌شد.

CREATE OR REPLACE FUNCTION public.delete_production_line_cascade(p_line_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_deleted_tasks integer := 0;
BEGIN
  IF auth.uid() IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'احراز هویت برای حذف خط تولید لازم است.';
  END IF;

  IF NOT public.has_module_permission('production_orders', 'edit') THEN
    RAISE EXCEPTION 'دسترسی ویرایش سفارش تولید برای حذف خط لازم است.';
  END IF;

  SELECT production_order_id
    INTO v_order_id
  FROM public.production_lines
  WHERE id = p_line_id
  FOR UPDATE;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'خط تولید پیدا نشد.';
  END IF;

  DELETE FROM public.tasks
  WHERE production_line_id = p_line_id;
  GET DIAGNOSTICS v_deleted_tasks = ROW_COUNT;

  DELETE FROM public.production_lines
  WHERE id = p_line_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'حذف خط تولید انجام نشد.';
  END IF;

  RETURN jsonb_build_object(
    'deleted_line_id', p_line_id,
    'deleted_task_count', v_deleted_tasks,
    'production_order_id', v_order_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_production_line_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_production_line_cascade(uuid) TO authenticated;

-- برای سازگاری با عملیات مستقیم و ابزارهای مدیریتی، حذف خط همان مجوز ویرایش
-- سفارش تولید را دارد. مسیر اصلی برنامه از RPC اتمیک بالا استفاده می‌کند.
DROP POLICY IF EXISTS "Role delete Production Lines" ON public.production_lines;
CREATE POLICY "Role delete Production Lines"
  ON public.production_lines
  FOR DELETE
  TO authenticated
  USING (public.has_module_permission('production_orders', 'edit'));

-- داده‌های قدیمی که با IP و HTTP ذخیره شده‌اند نباید دوباره Mixed Content بسازند.
UPDATE public.profiles
SET avatar_url = replace(
  avatar_url,
  'http://212.23.201.161:8000',
  'https://api-mehrbanoo.tazesystem.ir'
)
WHERE avatar_url LIKE 'http://212.23.201.161:8000/storage/v1/object/public/%';
