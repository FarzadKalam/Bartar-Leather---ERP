-- Shelf changes are allowed only before this stage has received any material.
BEGIN;

CREATE OR REPLACE FUNCTION public.production_delivery_row_quantity(p_row jsonb)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE field_name text; raw_value text; result numeric := 1;
BEGIN
  FOREACH field_name IN ARRAY ARRAY['mainQuantity', 'main_quantity', 'deliveredQty', 'delivered_qty'] LOOP
    raw_value := NULLIF(p_row->>field_name, '');
    IF raw_value IS NOT NULL THEN
      raw_value := regexp_replace(translate(raw_value, '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩٫', '01234567890123456789.'), '[,٬\s]', '', 'g');
      IF raw_value !~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$' THEN RETURN 0; END IF;
      RETURN GREATEST(0, raw_value::numeric);
    END IF;
  END LOOP;
  FOREACH field_name IN ARRAY ARRAY['length', 'width', 'quantity'] LOOP
    raw_value := regexp_replace(translate(COALESCE(p_row->>field_name, '0'), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩٫', '01234567890123456789.'), '[,٬\s]', '', 'g');
    IF raw_value !~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$' THEN RETURN 0; END IF;
    result := result * GREATEST(0, raw_value::numeric);
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.production_stage_has_receipts(p_task_id uuid, p_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH handovers AS (
    SELECT t.id, t.recurrence_info::jsonb->'production_handover' AS h
    FROM public.tasks t
    WHERE t.id = p_task_id OR (p_order_id IS NOT NULL AND t.related_production_order = p_order_id)
  ), forms AS (
    SELECT h.id AS owner_id, f.value AS form
    FROM handovers h
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(CASE WHEN jsonb_typeof(h.h->'forms') = 'array' THEN NULLIF(h.h->'forms', '[]'::jsonb) END, jsonb_build_array(h.h))
    ) f
  )
  SELECT EXISTS (
    SELECT 1 FROM forms f
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(f.form->'groups') = 'array' THEN f.form->'groups' ELSE '[]'::jsonb END) g
    WHERE (
      f.form->>'destinationTaskId' = p_task_id::text
      OR (f.owner_id = p_task_id AND COALESCE(f.form->>'direction',
        CASE WHEN f.form->>'sourceTaskId' = f.owner_id::text THEN 'outgoing' ELSE 'incoming' END) <> 'outgoing')
    ) AND (
      public.production_delivery_row_quantity(jsonb_build_object('mainQuantity', g.value->'totalHandoverQty')) > 0
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(g.value->'deliveryRows') = 'array' THEN g.value->'deliveryRows' ELSE '[]'::jsonb END) r
        WHERE public.production_delivery_row_quantity(r.value) > 0
      )
    )
  ) OR EXISTS (
    SELECT 1 FROM public.production_orders o
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.grid_materials::jsonb) = 'array' THEN o.grid_materials::jsonb ELSE '[]'::jsonb END) g
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(g.value->'delivery_rows') = 'array' THEN g.value->'delivery_rows' ELSE '[]'::jsonb END) r
    WHERE o.id = p_order_id
      AND COALESCE(NULLIF(r.value->>'targetStageTaskId', ''), NULLIF(r.value->>'target_stage_task_id', ''), g.value->>'target_stage_task_id') = p_task_id::text
      AND public.production_delivery_row_quantity(r.value) > 0
  );
$$;

CREATE OR REPLACE FUNCTION public.production_stage_shelf_is_locked(p_task_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE order_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    COALESCE(public.has_module_permission('production_orders', 'edit'), false)
    OR COALESCE(public.has_module_permission('tasks', 'edit'), false)
  ) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ویرایش قفسه مرحله را ندارید' USING ERRCODE = '42501';
  END IF;
  SELECT related_production_order INTO order_id FROM public.tasks WHERE id = p_task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'فعالیت پیدا نشد'; END IF;
  RETURN public.production_stage_has_receipts(p_task_id, order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_production_stage_shelf()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.production_shelf_id IS DISTINCT FROM OLD.production_shelf_id
    AND public.production_stage_has_receipts(OLD.id, OLD.related_production_order) THEN
    RAISE EXCEPTION 'قفسه این مرحله قابل تغییر نیست؛ قبلاً برای آن تحویل ثبت شده است.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_production_stage_shelf ON public.tasks;
CREATE TRIGGER guard_production_stage_shelf BEFORE UPDATE OF production_shelf_id ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.guard_production_stage_shelf();

REVOKE ALL ON FUNCTION public.production_delivery_row_quantity(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.production_stage_has_receipts(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_production_stage_shelf() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.production_stage_shelf_is_locked(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.production_stage_shelf_is_locked(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
