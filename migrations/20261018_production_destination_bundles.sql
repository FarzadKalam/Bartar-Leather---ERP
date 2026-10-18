-- بستهٔ مبدأ و مقصد در حواله‌های تولید مستقل هستند.
ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS source_bundle_id uuid REFERENCES public.product_bundles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_bundle_id uuid REFERENCES public.product_bundles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_transfers_source_bundle
  ON public.stock_transfers(source_bundle_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_target_bundle
  ON public.stock_transfers(target_bundle_id);

CREATE OR REPLACE FUNCTION public.apply_production_bundle_moves(
  p_moves jsonb,
  p_allow_negative boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  movement jsonb;
  movement_key text;
  product_id_value uuid;
  source_shelf_id_value uuid;
  target_shelf_id_value uuid;
  source_bundle_id_value uuid;
  target_bundle_id_value uuid;
  requested_target_bundle_id uuid;
  create_new_bundle boolean;
  movement_qty numeric;
  source_inventory public.product_inventory%ROWTYPE;
  target_inventory public.product_inventory%ROWTYPE;
  target_bundle_number text;
  remaining_source numeric;
  results jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'برای جابه‌جایی موجودی باید وارد سامانه شوید' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    COALESCE(public.has_module_permission('production_orders', 'edit'), false)
    OR COALESCE(public.has_module_permission('tasks', 'edit'), false)
    OR COALESCE(public.has_module_permission('stock_transfers', 'edit'), false)
  ) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ثبت تحویل تولید را ندارید' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(COALESCE(p_moves, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'فهرست جابه‌جایی بسته‌ها معتبر نیست';
  END IF;

  FOR movement IN SELECT value FROM jsonb_array_elements(COALESCE(p_moves, '[]'::jsonb))
  LOOP
    movement_key := COALESCE(movement->>'client_key', gen_random_uuid()::text);
    product_id_value := NULLIF(movement->>'product_id', '')::uuid;
    source_shelf_id_value := NULLIF(movement->>'source_shelf_id', '')::uuid;
    target_shelf_id_value := NULLIF(movement->>'target_shelf_id', '')::uuid;
    source_bundle_id_value := NULLIF(movement->>'source_bundle_id', '')::uuid;
    requested_target_bundle_id := NULLIF(movement->>'target_bundle_id', '')::uuid;
    create_new_bundle := COALESCE((movement->>'create_new_bundle')::boolean, false);
    movement_qty := COALESCE((movement->>'quantity')::numeric, 0);

    IF product_id_value IS NULL OR source_shelf_id_value IS NULL OR target_shelf_id_value IS NULL
       OR source_bundle_id_value IS NULL OR movement_qty <= 0 THEN
      RAISE EXCEPTION 'اطلاعات یکی از ردیف‌های جابه‌جایی بسته ناقص است';
    END IF;
    IF source_shelf_id_value = target_shelf_id_value THEN
      RAISE EXCEPTION 'قفسه مبدأ و مقصد نمی‌توانند یکسان باشند';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(source_bundle_id_value::text, 0));

    SELECT * INTO source_inventory
    FROM public.product_inventory
    WHERE product_id = product_id_value
      AND shelf_id = source_shelf_id_value
      AND bundle_id = source_bundle_id_value
    FOR UPDATE;

    IF source_inventory.id IS NULL THEN
      RAISE EXCEPTION 'بسته مبدأ در قفسه انتخاب‌شده موجود نیست';
    END IF;
    IF NOT p_allow_negative AND COALESCE(source_inventory.stock, 0) + 0.000000001 < movement_qty THEN
      RAISE EXCEPTION 'موجودی بسته مبدأ برای این تحویل کافی نیست';
    END IF;

    IF create_new_bundle THEN
      target_bundle_id_value := gen_random_uuid();
      target_bundle_number := 'PB-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' ||
        upper(substr(replace(target_bundle_id_value::text, '-', ''), 1, 6));
      INSERT INTO public.product_bundles(id, bundle_number, shelf_id)
      VALUES (target_bundle_id_value, target_bundle_number, target_shelf_id_value);
    ELSE
      target_bundle_id_value := COALESCE(requested_target_bundle_id, source_bundle_id_value);
      PERFORM pg_advisory_xact_lock(hashtextextended(target_bundle_id_value::text, 0));
      SELECT bundle_number INTO target_bundle_number
      FROM public.product_bundles
      WHERE id = target_bundle_id_value;
      IF target_bundle_number IS NULL THEN
        RAISE EXCEPTION 'بسته مقصد انتخاب‌شده وجود ندارد';
      END IF;
    END IF;

    remaining_source := COALESCE(source_inventory.stock, 0) - movement_qty;
    IF target_bundle_id_value = source_bundle_id_value AND remaining_source > 0.000000001 THEN
      RAISE EXCEPTION 'برای تحویل بخشی از یک بسته، باید «ساخت بسته جدید» یا یک بسته مقصد دیگر انتخاب شود';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.product_inventory inventory
      WHERE inventory.bundle_id = target_bundle_id_value
        AND inventory.shelf_id IS DISTINCT FROM target_shelf_id_value
        AND inventory.id IS DISTINCT FROM source_inventory.id
        AND COALESCE(inventory.stock, 0) > 0
    ) THEN
      RAISE EXCEPTION 'بسته مقصد در قفسه دیگری موجود است و قابل انتخاب نیست';
    END IF;

    IF abs(remaining_source) <= 0.000000001 THEN
      DELETE FROM public.product_inventory WHERE id = source_inventory.id;
    ELSE
      UPDATE public.product_inventory SET stock = remaining_source WHERE id = source_inventory.id;
    END IF;

    SELECT * INTO target_inventory
    FROM public.product_inventory
    WHERE product_id = product_id_value
      AND shelf_id = target_shelf_id_value
      AND bundle_id = target_bundle_id_value
    FOR UPDATE;

    IF target_inventory.id IS NULL THEN
      INSERT INTO public.product_inventory(product_id, shelf_id, warehouse_id, bundle_id, stock)
      SELECT product_id_value, target_shelf_id_value, shelves.warehouse_id, target_bundle_id_value, movement_qty
      FROM public.shelves
      WHERE shelves.id = target_shelf_id_value;
    ELSE
      UPDATE public.product_inventory
      SET stock = COALESCE(stock, 0) + movement_qty
      WHERE id = target_inventory.id;
    END IF;

    UPDATE public.product_bundles
    SET shelf_id = target_shelf_id_value
    WHERE id = target_bundle_id_value;

    results := results || jsonb_build_array(jsonb_build_object(
      'client_key', movement_key,
      'source_bundle_id', source_bundle_id_value,
      'target_bundle_id', target_bundle_id_value,
      'target_bundle_number', target_bundle_number
    ));
  END LOOP;

  RETURN results;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_production_bundle_moves(jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_production_bundle_moves(jsonb, boolean) TO authenticated;
