BEGIN;

ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS production_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS production_on_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS production_returned_at timestamptz;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS production_event_index integer;

-- The ordinary order editor and the group wizard can also change planning data.
CREATE OR REPLACE FUNCTION public.bump_production_order_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.production_revision := OLD.production_revision + 1;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS bump_production_order_revision ON public.production_orders;
CREATE TRIGGER bump_production_order_revision
  BEFORE UPDATE OF status,quantity,grid_materials,production_shelf_id,production_moves,production_group_order_id
  ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.bump_production_order_revision();

CREATE INDEX IF NOT EXISTS stock_transfers_order_history_idx
  ON public.stock_transfers(production_order_id, created_at, production_event_index, id) WHERE production_order_id IS NOT NULL;

-- Keep RLS and table grants of the signed-in operator. Each RPC call is one database transaction.
CREATE OR REPLACE FUNCTION public.commit_production_operation(command jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  operation text := command->>'kind';
  doc jsonb;
  task_doc jsonb;
  movement jsonb;
  order_row public.production_orders%ROWTYPE;
  task_row public.tasks%ROWTYPE;
  patch public.production_orders%ROWTYPE;
  log_row public.stock_transfers%ROWTYPE;
  inv public.product_inventory%ROWTYPE;
  delta_row record;
  p record;
  total numeric;
  next_stock numeric;
  allowed_negative boolean;
  ids uuid[];
  group_id uuid := (command->>'groupId')::uuid;
  stamp timestamptz;
  event_index integer := 0;
BEGIN
  IF auth.uid() IS NULL OR operation IS NULL OR operation NOT IN ('deliver','handover','complete','hold','return','resume') THEN
    RAISE EXCEPTION 'عملیات تولید معتبر نیست';
  END IF;
  IF NOT coalesce(has_module_permission('production_orders','edit'),false)
     AND NOT (operation='handover' AND coalesce(has_module_permission('tasks','edit'),false)) THEN
    RAISE EXCEPTION 'دسترسی ثبت عملیات تولید ندارید';
  END IF;
  SELECT array_agg((value->>'id')::uuid ORDER BY value->>'id') INTO ids FROM jsonb_array_elements(command->'orders');
  IF coalesce(cardinality(ids),0)=0 OR (operation <> 'deliver' AND cardinality(ids)<>1) THEN
    RAISE EXCEPTION 'سفارش تولید مشخص نشده است';
  END IF;
  IF cardinality(ids) <> (SELECT count(DISTINCT id) FROM unnest(ids) id) THEN
    RAISE EXCEPTION 'فهرست سفارش‌های تولید معتبر نیست';
  END IF;
  FOR doc IN SELECT value FROM jsonb_array_elements(command->'orders') ORDER BY value->>'id' LOOP
    SELECT * INTO order_row FROM production_orders WHERE id=(doc->>'id')::uuid FOR UPDATE;
    IF (operation <> 'handover' AND NOT doc ? 'revision') OR NOT FOUND OR order_row.status='completed' OR
      (doc ? 'revision' AND order_row.production_revision IS DISTINCT FROM (doc->>'revision')::bigint) THEN
      RAISE EXCEPTION 'سفارش تغییر کرده است. صفحه را تازه کنید';
    END IF;
    IF (order_row.production_on_hold AND operation NOT IN ('resume','return'))
       OR (operation='resume' AND NOT order_row.production_on_hold)
       OR (operation IN ('hold','complete','handover') AND order_row.status <> 'in_progress')
       OR (operation='return' AND NOT order_row.production_on_hold AND order_row.status <> 'in_progress') THEN
      RAISE EXCEPTION 'وضعیت سفارش با این عملیات سازگار نیست';
    END IF;
  END LOOP;

  stamp := clock_timestamp();
  IF operation IN ('hold','resume') AND (command ? 'deltas' OR command ? 'moves' OR command ? 'transfers' OR command ? 'tasks') THEN
    RAISE EXCEPTION 'توقف موقت یا ادامهٔ تولید نباید گردش انبار ایجاد کند';
  END IF;
  IF group_id IS NOT NULL AND operation <> 'deliver' THEN RAISE EXCEPTION 'عملیات گروهی معتبر نیست'; END IF;
  IF operation IN ('complete','hold','resume','return') AND command ? 'tasks' THEN
    RAISE EXCEPTION 'سند مرحله برای این عملیات معتبر نیست';
  END IF;
  IF operation NOT IN ('complete','handover') AND jsonb_array_length(coalesce(command->'deltas','[]'))>0 THEN
    RAISE EXCEPTION 'تغییر مستقیم موجودی برای این عملیات معتبر نیست';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(command->'transfers') t WHERE
    coalesce((t->>'delivered_qty')::numeric,0)<=0 OR t->>'product_id' IS NULL OR
    CASE WHEN operation='complete' THEN t->>'transfer_type' IS DISTINCT FROM 'production'
      OR (t->>'from_shelf_id' IS NULL) = (t->>'to_shelf_id' IS NULL)
    WHEN operation='handover' AND t->>'transfer_type'='waste' THEN
      (t->>'from_shelf_id' IS NULL) = (t->>'to_shelf_id' IS NULL)
    ELSE coalesce(t->>'transfer_type','') NOT IN ('production','production_stage')
      OR t->>'from_shelf_id' IS NULL OR t->>'to_shelf_id' IS NULL END
  ) THEN RAISE EXCEPTION 'نوع یا مقدار حوالهٔ تولید معتبر نیست'; END IF;
  IF operation='complete' AND (
    jsonb_array_length(coalesce(command->'moves','[]'))>0
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(command->'deltas') WHERE (value->>'delta')::numeric<0)
    OR (SELECT count(*) FROM jsonb_array_elements(command->'deltas') WHERE (value->>'delta')::numeric>0)<>1
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(command->'deltas') WHERE
      (value->>'delta')::numeric=(command#>>'{orders,0,patch,production_output_qty}')::numeric
      AND value->>'productId'=command#>>'{orders,0,patch,production_output_product_id}'
      AND value->>'shelfId'=command#>>'{orders,0,patch,production_output_shelf_id}')
  ) THEN RAISE EXCEPTION 'گردش مصرف و محصول نهایی کامل نیست'; END IF;
  IF EXISTS (
    WITH entries AS (
      SELECT value->>'productId' product,value->>'shelfId' shelf,value->>'bundleId' bundle,(value->>'delta')::numeric amount
      FROM jsonb_array_elements(command->'deltas')
      UNION ALL
      SELECT value->>'product_id',coalesce(value->>'to_shelf_id',value->>'from_shelf_id'),value->>'bundle_id',
        (value->>'delivered_qty')::numeric * CASE WHEN value->>'to_shelf_id' IS NULL THEN 1 ELSE -1 END
      FROM jsonb_array_elements(command->'transfers') WHERE operation='complete' OR value->>'transfer_type'='waste'
    ) SELECT 1 FROM entries GROUP BY product,shelf,bundle HAVING abs(sum(amount))>0.000000001
  ) THEN RAISE EXCEPTION 'مقدار حواله با تغییر موجودی مطابقت ندارد'; END IF;
  IF EXISTS (
    WITH entries AS (
      SELECT value->>'product_id' product, value->>'source_shelf_id' src, value->>'target_shelf_id' dst,
        value->>'source_bundle_id' src_bundle, value->>'target_bundle_id' dst_bundle, (value->>'quantity')::numeric amount
      FROM jsonb_array_elements(command->'moves')
      UNION ALL
      SELECT value->>'product_id', value->>'from_shelf_id', value->>'to_shelf_id',
        value->>'source_bundle_id', value->>'target_bundle_id', -(value->>'delivered_qty')::numeric
      FROM jsonb_array_elements(command->'transfers')
      WHERE value->>'from_shelf_id' IS NOT NULL AND value->>'to_shelf_id' IS NOT NULL
    )
    SELECT 1 FROM entries GROUP BY product,src,dst,src_bundle,dst_bundle HAVING abs(sum(amount))>0.000000001
  ) THEN RAISE EXCEPTION 'حواله با مسیر یا مقدار انتقال بسته مطابقت ندارد'; END IF;
  IF EXISTS (
    WITH affected AS (
      SELECT (value->>'product_id')::uuid id FROM jsonb_array_elements(command->'moves')
      UNION SELECT (value->>'productId')::uuid FROM jsonb_array_elements(command->'deltas')
    ), required AS (
      SELECT id FROM affected
      UNION SELECT parent_product_id FROM products JOIN affected USING (id) WHERE parent_product_id IS NOT NULL
    ), supplied AS (
      SELECT key::uuid id, value FROM jsonb_each_text(command->'factors')
    )
    SELECT 1 FROM required FULL JOIN supplied USING (id)
    WHERE required.id IS NULL OR supplied.id IS NULL OR supplied.value IS NULL OR supplied.value::numeric<0
  ) THEN RAISE EXCEPTION 'اطلاعات واحدهای محصولات این عملیات کامل نیست'; END IF;
  SELECT coalesce((SELECT allow_negative_inventory FROM company_settings LIMIT 1),false) INTO allowed_negative;
  -- Serialize writers for affected products and their catalog parents, including empty destination shelves.
  PERFORM id FROM products WHERE id IN (SELECT key::uuid FROM jsonb_each(command->'factors')) ORDER BY id FOR UPDATE;
  FOR movement IN SELECT value FROM jsonb_array_elements(command->'moves') LOOP
    IF (movement->>'new_bundle')::boolean THEN
      INSERT INTO product_bundles(id,shelf_id) VALUES ((movement->>'target_bundle_id')::uuid,(movement->>'target_shelf_id')::uuid);
      UPDATE product_bundles SET bundle_number=system_code WHERE id=(movement->>'target_bundle_id')::uuid AND nullif(bundle_number,'') IS NULL;
    END IF;
  END LOOP;
  IF jsonb_array_length(command->'moves')>0 THEN
    PERFORM apply_production_bundle_moves(command->'moves', CASE WHEN operation='return' THEN false ELSE allowed_negative END);
  END IF;

  FOR delta_row IN SELECT (value->>'productId')::uuid product_id,(value->>'shelfId')::uuid shelf_id,
    (value->>'bundleId')::uuid bundle_id,sum((value->>'delta')::numeric) delta
    FROM jsonb_array_elements(command->'deltas') GROUP BY 1,2,3 ORDER BY 1,2,3 LOOP
    SELECT * INTO inv FROM product_inventory WHERE product_id=delta_row.product_id AND shelf_id=delta_row.shelf_id
      AND bundle_id IS NOT DISTINCT FROM delta_row.bundle_id FOR UPDATE;
    next_stock := coalesce(inv.stock,0)+delta_row.delta;
    IF NOT allowed_negative AND next_stock < -0.000000001 THEN RAISE EXCEPTION 'موجودی بسته در قفسه برای این عملیات کافی نیست'; END IF;
    IF inv.id IS NOT NULL THEN
      IF abs(next_stock)<0.000000001 THEN DELETE FROM product_inventory WHERE id=inv.id;
      ELSE UPDATE product_inventory SET stock=next_stock WHERE id=inv.id; END IF;
      IF NOT FOUND THEN RAISE EXCEPTION 'ثبت ماندهٔ قفسه انجام نشد'; END IF;
    ELSIF abs(next_stock)>=0.000000001 THEN
      INSERT INTO product_inventory(product_id,shelf_id,bundle_id,warehouse_id,stock)
      VALUES(delta_row.product_id,delta_row.shelf_id,delta_row.bundle_id,(SELECT warehouse_id FROM shelves WHERE id=delta_row.shelf_id),next_stock);
    END IF;
  END LOOP;

  FOR doc IN SELECT value FROM jsonb_array_elements(command->'transfers') LOOP
    event_index := event_index + 1;
    log_row := jsonb_populate_record(NULL::stock_transfers,doc);
    IF log_row.production_order_id IS NULL OR NOT(log_row.production_order_id=ANY(ids)) THEN RAISE EXCEPTION 'سفارش حواله معتبر نیست'; END IF;
    INSERT INTO stock_transfers(transfer_type,product_id,required_qty,delivered_qty,production_order_id,from_shelf_id,to_shelf_id,
      bundle_id,source_bundle_id,target_bundle_id,sender_id,receiver_id,delivered_at,notes,stage_task_id,source_task_id,destination_task_id,created_at,production_event_index)
      VALUES(log_row.transfer_type,log_row.product_id,log_row.required_qty,log_row.delivered_qty,log_row.production_order_id,
        log_row.from_shelf_id,log_row.to_shelf_id,log_row.bundle_id,log_row.source_bundle_id,log_row.target_bundle_id,auth.uid(),auth.uid(),stamp,log_row.notes,log_row.stage_task_id,log_row.source_task_id,log_row.destination_task_id,stamp,event_index);
  END LOOP;
  FOR task_doc IN SELECT value FROM jsonb_array_elements(command->'tasks') ORDER BY value->>'id' LOOP
    SELECT * INTO task_row FROM tasks WHERE id=(task_doc->>'id')::uuid AND related_production_order=ANY(ids) FOR UPDATE;
    IF NOT FOUND OR task_row.recurrence_info IS DISTINCT FROM nullif(task_doc->'previous','null'::jsonb)
      OR task_row.production_shelf_id IS DISTINCT FROM (task_doc->>'shelf')::uuid THEN RAISE EXCEPTION 'مرحله تغییر کرده است. فرم را دوباره باز کنید'; END IF;
    UPDATE tasks SET recurrence_info=task_doc->'recurrence' WHERE id=task_row.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ثبت فرم مرحله انجام نشد'; END IF;
  END LOOP;

  FOR doc IN SELECT value FROM jsonb_array_elements(command->'orders') LOOP
    SELECT * INTO order_row FROM production_orders WHERE id=(doc->>'id')::uuid;
    IF (operation IN ('hold','resume','handover') AND coalesce(doc->'patch','{}') <> '{}')
       OR (operation='complete' AND (doc->'patch') - ARRAY['production_output_qty','production_output_shelf_id','production_output_product_id'] <> '{}')
       OR (operation='return' AND (doc->'patch') - ARRAY['production_moves','grid_materials','production_shelf_id'] <> '{}') THEN
      RAISE EXCEPTION 'فیلدهای سفارش برای این عملیات معتبر نیست';
    END IF;
    patch := jsonb_populate_record(order_row,coalesce(doc->'patch','{}'));
    IF operation='complete' AND (patch.production_output_qty IS NULL OR patch.production_output_qty<=0 OR patch.production_output_product_id IS NULL OR patch.production_output_shelf_id IS NULL) THEN
      RAISE EXCEPTION 'اطلاعات خروجی تولید کامل نیست';
    END IF;
    UPDATE production_orders SET
      status=CASE WHEN operation='complete' THEN 'completed' WHEN operation IN ('hold','return') THEN 'pending' ELSE 'in_progress' END,
      production_revision=production_revision+1, production_on_hold=(operation='hold'),
      production_returned_at=CASE WHEN operation='return' THEN stamp ELSE production_returned_at END,
      production_completed_at=CASE WHEN operation='complete' THEN stamp ELSE production_completed_at END,
      production_stopped_at=CASE WHEN operation IN ('hold','return') THEN stamp ELSE production_stopped_at END,
      production_started_at=CASE WHEN operation='deliver' AND order_row.status='pending' THEN stamp ELSE production_started_at END,
      production_moves=patch.production_moves, grid_materials=patch.grid_materials, production_shelf_id=patch.production_shelf_id,
      production_group_order_id=coalesce(group_id,order_row.production_group_order_id), quantity=patch.quantity,
      production_output_qty=patch.production_output_qty,production_output_shelf_id=patch.production_output_shelf_id,
      production_output_product_id=patch.production_output_product_id, updated_at=stamp
      WHERE id=order_row.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ثبت سفارش تولید انجام نشد'; END IF;
    IF operation='return' THEN
      UPDATE tasks SET recurrence_info=(recurrence_info-'production_handover') || jsonb_build_object(
        'production_handover_archive',coalesce(recurrence_info->'production_handover_archive','[]') || jsonb_build_array(recurrence_info->'production_handover'))
        WHERE related_production_order=order_row.id AND recurrence_info ? 'production_handover';
    END IF;
  END LOOP;
  IF group_id IS NOT NULL THEN
    UPDATE production_group_orders SET status='in_progress',started_at=coalesce(started_at,stamp),updated_at=stamp,updated_by=auth.uid()
      WHERE id=group_id AND status <> 'completed';
    IF NOT FOUND THEN RAISE EXCEPTION 'ثبت سفارش گروهی انجام نشد'; END IF;
  END IF;
  FOR p IN SELECT id,catalog_role FROM products WHERE id IN (SELECT key::uuid FROM jsonb_each(command->'factors'))
    ORDER BY (catalog_role='parent') ASC NULLS FIRST LOOP
    IF p.catalog_role='parent' THEN SELECT coalesce(sum(stock),0) INTO total FROM products WHERE parent_product_id=p.id AND catalog_role='variant';
    ELSE SELECT coalesce(sum(stock),0) INTO total FROM product_inventory WHERE product_id=p.id; END IF;
    UPDATE products SET stock=total,sub_stock=round(total*(command->'factors'->>p.id::text)::numeric,3) WHERE id=p.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ثبت جمع موجودی محصول انجام نشد'; END IF;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.commit_production_operation(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_production_operation(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
