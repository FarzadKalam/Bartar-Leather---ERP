-- Release 2.10.0: apply only after a verified backup and schema preflight.
-- Tested locally: transit/accepted quantities, partial receipts, replay protection, actor permissions,
-- stage-to-stage returns, legacy signatures, derived form snapshots and repeated migration.
-- Production gate: user acceptance, full-schema validation, backup verification and deployment approval.
-- Existing transfers and JSON handover forms are historical, already moved, and are NOT replayed.
BEGIN;

CREATE TABLE IF NOT EXISTS public.production_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  request_key text NOT NULL UNIQUE, order_id uuid NOT NULL REFERENCES public.production_orders(id),
  source_task_id uuid REFERENCES public.tasks(id), destination_task_id uuid NOT NULL REFERENCES public.tasks(id),
  created_by uuid NOT NULL REFERENCES public.profiles(id), sender_id uuid REFERENCES public.profiles(id),
  sender_role_id uuid REFERENCES public.org_roles(id), receiver_id uuid REFERENCES public.profiles(id),
  receiver_role_id uuid REFERENCES public.org_roles(id),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','partial','received','cancelled')),
  revision bigint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.production_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), receipt_id uuid NOT NULL REFERENCES public.production_receipts(id),
  product_id uuid NOT NULL REFERENCES public.products(id), unit text NOT NULL,
  source_shelf_id uuid NOT NULL REFERENCES public.shelves(id), target_shelf_id uuid NOT NULL REFERENCES public.shelves(id),
  source_bundle_id uuid NOT NULL REFERENCES public.product_bundles(id), target_bundle_id uuid REFERENCES public.product_bundles(id),
  transit_bundle_id uuid REFERENCES public.product_bundles(id),
  sent numeric NOT NULL CHECK(sent > 0 AND sent < 'Infinity'::numeric),
  received numeric NOT NULL DEFAULT 0 CHECK(received >= 0 AND received <= sent)
);
CREATE INDEX IF NOT EXISTS production_receipts_order_idx ON public.production_receipts(order_id,number DESC);
ALTER TABLE public.production_receipts ADD COLUMN IF NOT EXISTS returned_at timestamptz;
ALTER TABLE public.production_receipts ADD COLUMN IF NOT EXISTS request_fingerprint text;
CREATE INDEX IF NOT EXISTS production_receipts_destination_idx ON public.production_receipts(destination_task_id,status);
CREATE INDEX IF NOT EXISTS production_receipt_lines_receipt_idx ON public.production_receipt_lines(receipt_id);
CREATE UNIQUE INDEX IF NOT EXISTS production_receipt_lines_transit_idx ON public.production_receipt_lines(transit_bundle_id);
CREATE TABLE IF NOT EXISTS public.production_receipt_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), receipt_id uuid NOT NULL REFERENCES public.production_receipts(id),
  request_key uuid NOT NULL UNIQUE, action text NOT NULL, actor_id uuid NOT NULL REFERENCES public.profiles(id),
  proxy_reason text NOT NULL DEFAULT '', quantities jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS production_receipt_events_receipt_idx ON public.production_receipt_events(receipt_id,created_at);
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS receipt_line_id uuid REFERENCES public.production_receipt_lines(id),
  ADD COLUMN IF NOT EXISTS receipt_phase text CHECK(receipt_phase IN ('send','receive'));
CREATE TABLE IF NOT EXISTS public.production_transit_location (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), shelf_id uuid NOT NULL REFERENCES public.shelves(id)
);
DO $$ DECLARE w uuid; s uuid; BEGIN
  IF NOT EXISTS(SELECT 1 FROM production_transit_location) THEN
    INSERT INTO warehouses(name) VALUES('در انتظار دریافت تولید') RETURNING id INTO w;
    INSERT INTO shelves(warehouse_id,shelf_number,name) VALUES(w,'TRANSIT','ارسال‌شده؛ غیرقابل برداشت تا تأیید دریافت') RETURNING id INTO s;
    INSERT INTO production_transit_location(shelf_id) VALUES(s);
  END IF;
END $$;

ALTER TABLE public.production_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_receipt_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_transit_location ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.production_receipts,public.production_receipt_lines,public.production_receipt_events,public.production_transit_location FROM anon,authenticated;
GRANT SELECT ON public.production_transit_location TO authenticated;
DROP POLICY IF EXISTS read_transit_location ON public.production_transit_location;
CREATE POLICY read_transit_location ON public.production_transit_location FOR SELECT TO authenticated USING(true);

CREATE OR REPLACE FUNCTION public.production_receipt_manager() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM profiles p LEFT JOIN org_roles r ON r.id=p.role_id WHERE p.id=auth.uid()
    AND (p.role IN ('admin','super_admin') OR r.permissions#>>'{production_orders,confirm_for_others}'='true'));
$$;
CREATE OR REPLACE FUNCTION public.production_receipt_actor(person uuid, role_value uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND (person=auth.uid() OR EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role_id=role_value));
$$;

-- A protected transit bundle cannot be consumed by any ordinary stock editor/RPC.
CREATE OR REPLACE FUNCTION public.guard_production_transit() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE protected boolean;
BEGIN
  IF TG_OP='DELETE' THEN
    SELECT EXISTS(SELECT 1 FROM production_transit_location WHERE shelf_id=OLD.shelf_id) INTO protected;
  ELSE
    SELECT EXISTS(SELECT 1 FROM production_transit_location WHERE shelf_id=NEW.shelf_id) INTO protected;
    IF TG_OP='UPDATE' THEN protected := protected OR EXISTS(SELECT 1 FROM production_transit_location WHERE shelf_id=OLD.shelf_id); END IF;
  END IF;
  IF protected AND NOT (coalesce(current_setting('erp.receipt_write',true),'')='on'
      AND current_user=pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='public.production_receipt_action(jsonb)'::regprocedure))) THEN
    RAISE EXCEPTION 'موجودی در انتظار دریافت فقط با تأیید دریافت قابل انتقال است';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_production_transit ON public.product_inventory;
CREATE TRIGGER guard_production_transit BEFORE INSERT OR UPDATE OR DELETE ON public.product_inventory
FOR EACH ROW EXECUTE FUNCTION public.guard_production_transit();

CREATE OR REPLACE FUNCTION public.save_production_receipt_drafts(documents jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d jsonb; m jsonb; o production_orders%ROWTYPE; src tasks%ROWTYPE; dst tasks%ROWTYPE;
  rid uuid; pid uuid; unit_value text; source_task uuid; target_task uuid; fingerprint text;
BEGIN
  IF auth.uid() IS NULL OR NOT (has_module_permission('production_orders','edit') OR has_module_permission('tasks','edit')) THEN
    RAISE EXCEPTION 'دسترسی ثبت پیش‌نویس تحویل ندارید'; END IF;
  IF jsonb_typeof(documents)<>'array' OR jsonb_array_length(documents)=0 THEN RAISE EXCEPTION 'فرم تحویل خالی است'; END IF;
  FOR d IN SELECT value FROM jsonb_array_elements(documents) ORDER BY value->>'order_id',value->>'request_key' LOOP
    -- Unique request key makes retried draft saves idempotent; no stock mutation here.
    PERFORM pg_advisory_xact_lock(hashtextextended(d->>'request_key',0));
    SELECT md5(((d - 'lines') || jsonb_build_object('lines',coalesce(jsonb_agg(
      CASE WHEN coalesce((value->>'new_bundle')::boolean,false) THEN value - 'target_bundle_id' - 'target_bundle_number' ELSE value END ORDER BY ord),'[]')))::text)
      INTO fingerprint FROM jsonb_array_elements(d->'lines') WITH ORDINALITY x(value,ord);
    IF EXISTS(SELECT 1 FROM production_receipts WHERE request_key=d->>'request_key') THEN
      IF NOT EXISTS(SELECT 1 FROM production_receipts WHERE request_key=d->>'request_key' AND created_by=auth.uid() AND request_fingerprint=fingerprint) THEN
        RAISE EXCEPTION 'این پیش‌نویس قبلاً با اطلاعات دیگری ذخیره شده است؛ فرم ذخیره‌شده را باز کنید'; END IF;
      CONTINUE;
    END IF;
    SELECT * INTO o FROM production_orders WHERE id=(d->>'order_id')::uuid FOR UPDATE;
    IF NOT FOUND OR o.status='completed' OR o.production_on_hold THEN RAISE EXCEPTION 'وضعیت سفارش اجازهٔ ثبت تحویل نمی‌دهد'; END IF;
    IF d ? 'revision' AND (d->>'revision')::bigint<>o.production_revision THEN RAISE EXCEPTION 'سفارش تغییر کرده است؛ صفحه را تازه کنید'; END IF;
    target_task := nullif(d->>'destination_task_id','')::uuid;
    IF target_task IS NULL THEN
      IF (SELECT count(*) FROM tasks WHERE related_production_order=o.id AND production_shelf_id=(d->>'target_shelf_id')::uuid)<>1 THEN
        RAISE EXCEPTION 'مرحلهٔ مقصد باید مشخص باشد؛ قفسهٔ مشترک چند مرحله قابل تشخیص نیست'; END IF;
      SELECT id INTO target_task FROM tasks WHERE related_production_order=o.id AND production_shelf_id=(d->>'target_shelf_id')::uuid;
    END IF;
    SELECT * INTO dst FROM tasks WHERE id=target_task;
    IF dst.related_production_order IS DISTINCT FROM o.id OR dst.production_shelf_id IS DISTINCT FROM (d->>'target_shelf_id')::uuid THEN
      RAISE EXCEPTION 'مرحله و قفسهٔ مقصد با سفارش سازگار نیست'; END IF;
    source_task:=nullif(d->>'source_task_id','')::uuid;
    IF source_task IS NOT NULL THEN
      SELECT * INTO src FROM tasks WHERE id=source_task;
      IF src.related_production_order IS DISTINCT FROM o.id THEN RAISE EXCEPTION 'مرحلهٔ مبدأ معتبر نیست'; END IF;
    END IF;
    IF coalesce(dst.assignee_id,dst.assignee_role_id) IS NULL THEN RAISE EXCEPTION 'ابتدا مسئول مرحلهٔ مقصد را مشخص کنید'; END IF;
    INSERT INTO production_receipts(request_key,order_id,source_task_id,destination_task_id,created_by,sender_id,sender_role_id,receiver_id,receiver_role_id)
    VALUES(d->>'request_key',o.id,source_task,dst.id,auth.uid(),
      CASE WHEN source_task IS NULL THEN auth.uid() WHEN src.assignee_type='role' THEN NULL ELSE src.assignee_id END,
      CASE WHEN source_task IS NOT NULL AND src.assignee_type='role' THEN coalesce(src.assignee_role_id,src.assignee_id) END,
      CASE WHEN dst.assignee_type='role' THEN NULL ELSE dst.assignee_id END,
      CASE WHEN dst.assignee_type='role' THEN coalesce(dst.assignee_role_id,dst.assignee_id) END) RETURNING id INTO rid;
    UPDATE production_receipts SET request_fingerprint=fingerprint WHERE id=rid;
    IF jsonb_array_length(coalesce(d->'lines','[]'))=0 THEN RAISE EXCEPTION 'فرم تحویل خالی است'; END IF;
    FOR m IN SELECT value FROM jsonb_array_elements(d->'lines') LOOP
      pid := (m->>'product_id')::uuid;
      SELECT main_unit INTO unit_value FROM products WHERE id=pid;
      IF unit_value IS NULL OR unit_value IS DISTINCT FROM m->>'unit' THEN RAISE EXCEPTION 'واحد تحویل باید واحد اصلی موجودی محصول باشد'; END IF;
      IF source_task IS NOT NULL AND src.production_shelf_id IS DISTINCT FROM (m->>'source_shelf_id')::uuid THEN RAISE EXCEPTION 'قفسهٔ مبدأ با مرحله سازگار نیست'; END IF;
      IF (m->>'source_shelf_id')::uuid=dst.production_shelf_id OR EXISTS(SELECT 1 FROM production_transit_location WHERE shelf_id=(m->>'source_shelf_id')::uuid) THEN
        RAISE EXCEPTION 'مسیر برداشت معتبر نیست'; END IF;
      IF unit_value IN ('عدد','بسته') AND (m->>'quantity')::numeric<>trunc((m->>'quantity')::numeric) THEN RAISE EXCEPTION 'تعداد قطعه باید صحیح باشد'; END IF;
      INSERT INTO production_receipt_lines(receipt_id,product_id,unit,source_shelf_id,target_shelf_id,source_bundle_id,target_bundle_id,sent)
      VALUES(rid,pid,unit_value,(m->>'source_shelf_id')::uuid,dst.production_shelf_id,(m->>'source_bundle_id')::uuid,
        CASE WHEN coalesce((m->>'new_bundle')::boolean,false) OR m->>'target_bundle_id'=m->>'source_bundle_id' THEN NULL ELSE nullif(m->>'target_bundle_id','')::uuid END,(m->>'quantity')::numeric);
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.production_receipt_action(command jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h production_receipts%ROWTYPE; l production_receipt_lines%ROWTYPE; o production_orders%ROWTYPE;
  action_value text:=command->>'action'; reason text:=trim(coalesce(command->>'reason','')); actor_ok boolean;
  transit uuid; b uuid; amount numeric; total numeric:=0; quantity_map jsonb:='{}'; stamp timestamptz:=clock_timestamp(); result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (has_module_permission('production_orders','edit') OR has_module_permission('tasks','edit')) THEN RAISE EXCEPTION 'دسترسی ثبت تحویل ندارید'; END IF;
  -- Lock order before receipt/products for consistent ordering with completion and other writers.
  SELECT * INTO o FROM production_orders WHERE id=(SELECT order_id FROM production_receipts WHERE id=(command->>'id')::uuid) FOR UPDATE;
  SELECT * INTO h FROM production_receipts WHERE id=(command->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'فرم تحویل پیدا نشد'; END IF;
  IF EXISTS(SELECT 1 FROM production_receipt_events WHERE request_key=(command->>'request_key')::uuid AND receipt_id=h.id AND actor_id=auth.uid()) THEN RETURN; END IF;
  IF h.revision IS DISTINCT FROM (command->>'revision')::bigint THEN RAISE EXCEPTION 'فرم تغییر کرده است؛ دوباره آن را باز کنید'; END IF;
  IF action_value NOT IN ('send','receive','cancel') OR action_value IS NULL THEN RAISE EXCEPTION 'عملیات تحویل معتبر نیست'; END IF;
  IF o.status='completed' OR (o.production_on_hold AND action_value<>'cancel') THEN RAISE EXCEPTION 'سفارش متوقف یا تکمیل شده است'; END IF;
  actor_ok := CASE WHEN action_value='receive' THEN production_receipt_actor(h.receiver_id,h.receiver_role_id)
    ELSE production_receipt_actor(h.sender_id,h.sender_role_id) END;
  IF NOT coalesce(actor_ok,false) AND NOT (production_receipt_manager() AND length(reason)>=5) THEN
    RAISE EXCEPTION 'فقط مسئول تعیین‌شده می‌تواند تأیید کند؛ ثبت به نمایندگی نیازمند دسترسی مدیر و توضیح است'; END IF;
  IF action_value IN ('send','cancel') AND h.status<>'draft' THEN RAISE EXCEPTION 'فرم ارسال‌شده قابل ارسال دوباره یا حذف نیست'; END IF;
  IF action_value='receive' AND h.status NOT IN ('sent','partial') THEN RAISE EXCEPTION 'فرم هنوز ارسال نشده یا دریافت آن کامل شده است'; END IF;
  IF action_value='receive' AND (jsonb_typeof(command->'quantities') IS DISTINCT FROM 'object' OR EXISTS(
    SELECT 1 FROM jsonb_object_keys(command->'quantities') k WHERE NOT EXISTS(SELECT 1 FROM production_receipt_lines WHERE receipt_id=h.id AND id::text=k))) THEN
    RAISE EXCEPTION 'ردیف دریافت معتبر نیست'; END IF;
  IF action_value<>'cancel' THEN
    IF h.source_task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tasks WHERE id=h.source_task_id AND related_production_order=h.order_id
      AND production_shelf_id=(SELECT source_shelf_id FROM production_receipt_lines WHERE receipt_id=h.id LIMIT 1)
      AND CASE WHEN assignee_type='role' THEN coalesce(assignee_role_id,assignee_id)=h.sender_role_id ELSE assignee_id=h.sender_id END) THEN
      RAISE EXCEPTION 'مسئول یا قفسهٔ مبدأ تغییر کرده است؛ پیش‌نویس را اصلاح کنید'; END IF;
    IF NOT EXISTS(SELECT 1 FROM tasks WHERE id=h.destination_task_id AND related_production_order=h.order_id
      AND production_shelf_id=(SELECT target_shelf_id FROM production_receipt_lines WHERE receipt_id=h.id LIMIT 1)
      AND CASE WHEN assignee_type='role' THEN coalesce(assignee_role_id,assignee_id)=h.receiver_role_id ELSE assignee_id=h.receiver_id END) THEN
      RAISE EXCEPTION 'مسئول یا قفسهٔ مقصد تغییر کرده است؛ ابتدا فرم را بررسی کنید'; END IF;
    PERFORM id FROM products WHERE id IN (SELECT product_id FROM production_receipt_lines WHERE receipt_id=h.id) ORDER BY id FOR UPDATE;
    SELECT shelf_id INTO transit FROM production_transit_location;
    PERFORM set_config('erp.receipt_write','on',true);
    FOR l IN SELECT * FROM production_receipt_lines WHERE receipt_id=h.id ORDER BY product_id,source_bundle_id,id FOR UPDATE LOOP
      IF action_value='send' THEN
        b:=gen_random_uuid();
        INSERT INTO product_bundles(id,shelf_id) VALUES(b,transit);
        UPDATE product_bundles SET bundle_number=system_code WHERE id=b AND nullif(bundle_number,'') IS NULL;
        UPDATE production_receipt_lines SET transit_bundle_id=b WHERE id=l.id;
        amount:=l.sent;
        PERFORM apply_production_bundle_moves(jsonb_build_array(jsonb_build_object('product_id',l.product_id,'source_shelf_id',l.source_shelf_id,'target_shelf_id',transit,
          'source_bundle_id',l.source_bundle_id,'target_bundle_id',b,'quantity',amount)),false);
        INSERT INTO stock_transfers(transfer_type,product_id,required_qty,delivered_qty,production_order_id,from_shelf_id,to_shelf_id,source_bundle_id,target_bundle_id,bundle_id,sender_id,receiver_id,delivered_at,notes,stage_task_id,receipt_line_id,receipt_phase)
        VALUES('production_stage',l.product_id,amount,amount,h.order_id,l.source_shelf_id,transit,l.source_bundle_id,b,b,auth.uid(),NULL,stamp,'ارسال؛ در انتظار تأیید دریافت',h.destination_task_id,l.id,'send');
      ELSE
        amount:=coalesce((command->'quantities'->>l.id::text)::numeric,0);
        IF amount<0 OR amount>l.sent-l.received OR amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'مقدار دریافت از ماندهٔ ارسال بیشتر است یا معتبر نیست'; END IF;
        IF l.unit IN ('عدد','بسته') AND amount<>trunc(amount) THEN RAISE EXCEPTION 'تعداد قطعه باید صحیح باشد'; END IF;
        IF amount=0 THEN CONTINUE; END IF;
        b:=l.target_bundle_id;
        IF b IS NULL THEN
          b:=gen_random_uuid(); INSERT INTO product_bundles(id,shelf_id) VALUES(b,l.target_shelf_id);
          UPDATE product_bundles SET bundle_number=system_code WHERE id=b AND nullif(bundle_number,'') IS NULL;
          UPDATE production_receipt_lines SET target_bundle_id=b WHERE id=l.id;
        END IF;
        PERFORM apply_production_bundle_moves(jsonb_build_array(jsonb_build_object('product_id',l.product_id,'source_shelf_id',transit,'target_shelf_id',l.target_shelf_id,
          'source_bundle_id',l.transit_bundle_id,'target_bundle_id',b,'quantity',amount)),false);
        UPDATE production_receipt_lines SET received=received+amount WHERE id=l.id;
        INSERT INTO stock_transfers(transfer_type,product_id,required_qty,delivered_qty,production_order_id,from_shelf_id,to_shelf_id,source_bundle_id,target_bundle_id,bundle_id,sender_id,receiver_id,delivered_at,notes,stage_task_id,receipt_line_id,receipt_phase)
        VALUES('production_stage',l.product_id,amount,amount,h.order_id,transit,l.target_shelf_id,l.transit_bundle_id,b,b,NULL,auth.uid(),stamp,'دریافت واقعی تأییدشده',h.destination_task_id,l.id,'receive');
        -- Keep the existing order movement ledger compatible with pause/return and cost reporting.
        UPDATE production_orders SET production_moves=coalesce(production_moves,'[]') || jsonb_build_array(jsonb_build_object(
          'product_id',l.product_id,'from_shelf_id',l.source_shelf_id,'to_shelf_id',l.target_shelf_id,'bundle_id',l.source_bundle_id,
          'target_bundle_id',b,'quantity',amount,'unit',l.unit)) WHERE id=h.order_id AND h.source_task_id IS NULL;
      END IF;
      total:=total+amount; quantity_map:=quantity_map || jsonb_build_object(l.id::text,amount);
    END LOOP;
    PERFORM set_config('erp.receipt_write','off',true);
    IF total<=0 THEN RAISE EXCEPTION 'مقدار واقعی دریافت را وارد کنید'; END IF;
  END IF;
  UPDATE production_receipts SET revision=revision+1,status=CASE WHEN action_value='cancel' THEN 'cancelled' WHEN action_value='send' THEN 'sent'
    WHEN EXISTS(SELECT 1 FROM production_receipt_lines WHERE receipt_id=h.id AND received<sent) THEN 'partial' ELSE 'received' END WHERE id=h.id;
  INSERT INTO production_receipt_events(receipt_id,request_key,action,actor_id,proxy_reason,quantities)
    VALUES(h.id,(command->>'request_key')::uuid,action_value,auth.uid(),CASE WHEN coalesce(actor_ok,false) THEN '' ELSE reason END,quantity_map);
  IF action_value='send' THEN
    UPDATE production_orders SET status='in_progress',production_started_at=coalesce(production_started_at,stamp),
      production_shelf_id=coalesce(production_shelf_id,(SELECT target_shelf_id FROM production_receipt_lines WHERE receipt_id=h.id LIMIT 1)) WHERE id=h.order_id;
    UPDATE production_group_orders SET status='in_progress',started_at=coalesce(started_at,stamp) WHERE id=o.production_group_order_id;
  END IF;
  IF action_value='receive' AND h.source_task_id IS NOT NULL THEN
    UPDATE production_orders SET production_revision=production_revision+1 WHERE id=h.order_id;
  END IF;
  IF action_value='receive' THEN PERFORM project_production_receipt(h.id); END IF;
END $$;

-- Read-model compatibility for existing stage/source inventory and initial-delivery summaries.
-- Only accepted quantities are projected. The authoritative amounts and actor history stay in the receipt tables.
CREATE OR REPLACE FUNCTION public.project_production_receipt(receipt_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h production_receipts%ROWTYPE; task_row tasks%ROWTYPE; groups_doc jsonb; form_doc jsonb; old_handover jsonb; forms_doc jsonb;
  giver_doc jsonb; receiver_doc jsonb; key_value text;
BEGIN
  SELECT * INTO h FROM production_receipts WHERE id=receipt_id;
  SELECT * INTO task_row FROM tasks WHERE id=h.destination_task_id FOR UPDATE;
  key_value:='receipt:' || h.id::text;
  SELECT jsonb_build_object('confirmed',true,'userId',e.actor_id,'userName',p.full_name,'at',e.created_at)
    INTO giver_doc FROM production_receipt_events e JOIN profiles p ON p.id=e.actor_id WHERE e.receipt_id=h.id AND e.action='send' ORDER BY e.created_at LIMIT 1;
  SELECT jsonb_build_object('confirmed',true,'userId',e.actor_id,'userName',p.full_name,'at',e.created_at)
    INTO receiver_doc FROM production_receipt_events e JOIN profiles p ON p.id=e.actor_id WHERE e.receipt_id=h.id AND e.action='receive' ORDER BY e.created_at DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'key',l.id,'rowIndex',0,'categoryLabel',CASE to_jsonb(p)->>'category' WHEN 'leather' THEN 'چرم' WHEN 'lining' THEN 'آستر' WHEN 'fitting' THEN 'یراق' WHEN 'accessory' THEN 'خرجکار' ELSE coalesce(to_jsonb(p)->>'category','') END,
    'selectedProductId',p.id,'selectedProductName',p.name,'selectedProductCode',to_jsonb(p)->>'system_code',
    'sourceShelfId',l.source_shelf_id,'sourceBundleId',l.source_bundle_id,'targetShelfId',l.target_shelf_id,
    'deliveryType',CASE WHEN l.unit IN ('عدد','بسته') THEN 'piece' ELSE 'bulk' END,
    'pieces',jsonb_build_array(jsonb_build_object('key',l.id,'name',p.name,'quantity',l.received,'totalQuantity',l.received,'mainUnit',l.unit,'sourceQty',l.received,'handoverQty',l.received)),
    'orderPieces','[]'::jsonb,'deliveryRows',jsonb_build_array(jsonb_build_object('key',l.id,'name',p.name,'quantity',l.received,'mainQuantity',l.received,'deliveredQty',l.received,
      'mainUnit',l.unit,'sourceShelfId',l.source_shelf_id,'sourceBundleId',l.source_bundle_id,'targetBundleId',l.target_bundle_id,
      'deliveryType',CASE WHEN l.unit IN ('عدد','بسته') THEN 'piece' ELSE 'bulk' END)),
    'totalSourceQty',l.received,'totalHandoverQty',l.received,'totalOrderQty',0,'isConfirmed',true,'collapsed',true
  ) ORDER BY l.id),'[]') INTO groups_doc FROM production_receipt_lines l JOIN products p ON p.id=l.product_id WHERE l.receipt_id=h.id AND l.received>0;
  form_doc:=jsonb_build_object('id',key_value,'receiptId',h.id,'batchId',key_value,'direction','incoming','sourceTaskId',h.source_task_id,
    'sourceStageName',coalesce((SELECT name FROM tasks WHERE id=h.source_task_id),'انبار مرکزی'),'targetShelfId',task_row.production_shelf_id,
    'groups',groups_doc,'giverConfirmation',giver_doc,'receiverConfirmation',receiver_doc,
    'giver',jsonb_build_object('id',h.sender_id,'type','user','label',giver_doc->>'userName'),
    'receiver',jsonb_build_object('id',h.receiver_id,'type','user','label',receiver_doc->>'userName'),
    'createdAt',h.created_at,'updatedAt',clock_timestamp());
  old_handover:=coalesce(task_row.recurrence_info->'production_handover','{}');
  forms_doc:=coalesce(old_handover->'forms',CASE WHEN old_handover ? 'groups' THEN jsonb_build_array(old_handover || jsonb_build_object('id',coalesce(old_handover->>'activeFormId','legacy:' || task_row.id::text))) ELSE '[]'::jsonb END);
  SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]') INTO forms_doc FROM jsonb_array_elements(forms_doc) WITH ORDINALITY x(value,ord) WHERE value->>'id'<>key_value;
  UPDATE tasks SET recurrence_info=jsonb_set(coalesce(recurrence_info,'{}'),'{production_handover}',old_handover || form_doc || jsonb_build_object('activeFormId',key_value,'forms',forms_doc || jsonb_build_array(form_doc))) WHERE id=task_row.id;
END $$;
REVOKE ALL ON FUNCTION public.project_production_receipt(uuid) FROM PUBLIC;

-- Stop/completion/return must not silently consume or return stock still awaiting receipt.
CREATE OR REPLACE FUNCTION public.guard_pending_production_receipts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('completed','pending') OR NEW.production_on_hold AND NOT OLD.production_on_hold)
    AND EXISTS(SELECT 1 FROM production_receipts WHERE order_id=OLD.id AND status IN ('sent','partial')) THEN
    RAISE EXCEPTION 'این سفارش تحویلِ در انتظار دریافت دارد؛ ابتدا دریافت یا مغایرت آن را تعیین تکلیف کنید'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_pending_production_receipts ON public.production_orders;
CREATE TRIGGER guard_pending_production_receipts BEFORE UPDATE ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.guard_pending_production_receipts();

CREATE OR REPLACE FUNCTION public.list_production_receipts(order_ids uuid[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(doc ORDER BY n DESC),'[]') FROM (
  SELECT h.number n,jsonb_build_object('id',h.id,'number',h.number,'order_id',h.order_id,'order_name',o.name,'stage_name',t.name,
   'status',h.status,'returned_at',h.returned_at,'revision',h.revision,'sender_name',coalesce(sp.full_name,sr.title,'تعیین نشده'),'receiver_name',coalesce(rp.full_name,rr.title,'تعیین نشده'),
   'can_send',coalesce(production_receipt_actor(h.sender_id,h.sender_role_id),false),'can_receive',coalesce(production_receipt_actor(h.receiver_id,h.receiver_role_id),false),
   'can_proxy',production_receipt_manager(),
   'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'product_name',p.name,'unit',l.unit,'sent',l.sent,'received',l.received,
     'source_label',sb.bundle_number,'target_label',tb.bundle_number) ORDER BY l.id),'[]') FROM production_receipt_lines l JOIN products p ON p.id=l.product_id
     LEFT JOIN product_bundles sb ON sb.id=l.source_bundle_id LEFT JOIN product_bundles tb ON tb.id=l.target_bundle_id WHERE l.receipt_id=h.id),
   'events',(SELECT coalesce(jsonb_agg(jsonb_build_object('action',e.action,'actor',p.full_name,'at',e.created_at,'reason',e.proxy_reason,'quantities',e.quantities) ORDER BY e.created_at),'[]')
     FROM production_receipt_events e JOIN profiles p ON p.id=e.actor_id WHERE e.receipt_id=h.id)) doc
  FROM production_receipts h JOIN production_orders o ON o.id=h.order_id JOIN tasks t ON t.id=h.destination_task_id
    LEFT JOIN profiles sp ON sp.id=h.sender_id LEFT JOIN profiles rp ON rp.id=h.receiver_id LEFT JOIN org_roles sr ON sr.id=h.sender_role_id LEFT JOIN org_roles rr ON rr.id=h.receiver_role_id
  WHERE h.order_id=ANY(order_ids) AND auth.uid() IS NOT NULL AND (has_module_permission('production_orders','view') OR production_receipt_actor(h.sender_id,h.sender_role_id) OR production_receipt_actor(h.receiver_id,h.receiver_role_id))
 ) s;
$$;
REVOKE ALL ON FUNCTION public.production_receipt_manager(),public.production_receipt_actor(uuid,uuid),public.save_production_receipt_drafts(jsonb),public.production_receipt_action(jsonb),public.list_production_receipts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_production_receipt_drafts(jsonb),public.production_receipt_action(jsonb),public.list_production_receipts(uuid[]) TO authenticated;
-- Legacy forms only receive an audited signature. Their stock already moved in the old release.
CREATE OR REPLACE FUNCTION public.confirm_legacy_production_receipt(task_id uuid,form_id text,confirmation_side text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t tasks%ROWTYPE; h jsonb; f jsonb; forms jsonb; person jsonb; confirmation jsonb; field_name text;
BEGIN
  IF auth.uid() IS NULL OR confirmation_side NOT IN ('giver','receiver') OR confirmation_side IS NULL
    OR NOT(has_module_permission('production_orders','edit') OR has_module_permission('tasks','edit')) THEN RAISE EXCEPTION 'دسترسی تأیید ندارید'; END IF;
  SELECT * INTO t FROM tasks WHERE id=task_id FOR UPDATE;
  h:=t.recurrence_info->'production_handover';
  forms:=coalesce(h->'forms',jsonb_build_array(h || jsonb_build_object('id',coalesce(h->>'activeFormId',form_id))));
  SELECT value INTO f FROM jsonb_array_elements(forms) WHERE value->>'id'=form_id;
  IF f IS NULL THEN RAISE EXCEPTION 'فرم قدیمی پیدا نشد'; END IF;
  person:=f->CASE WHEN confirmation_side='giver' THEN 'giver' ELSE 'receiver' END;
  IF NOT coalesce(production_receipt_actor(CASE WHEN person->>'type'<>'role' THEN nullif(person->>'id','')::uuid END,
    CASE WHEN person->>'type'='role' THEN nullif(person->>'id','')::uuid END),false) THEN RAISE EXCEPTION 'این تأیید باید با حساب مسئول ثبت‌شده انجام شود'; END IF;
  field_name:=confirmation_side || 'Confirmation';
  IF f#>>ARRAY[field_name,'confirmed']='true' THEN RETURN f->field_name; END IF;
  confirmation:=jsonb_build_object('confirmed',true,'userId',auth.uid(),'userName',(SELECT full_name FROM profiles WHERE id=auth.uid()),'at',clock_timestamp(),'legacy',true);
  SELECT jsonb_agg(CASE WHEN value->>'id'=form_id THEN value || jsonb_build_object(field_name,confirmation) ELSE value END ORDER BY ord)
    INTO forms FROM jsonb_array_elements(forms) WITH ORDINALITY x(value,ord);
  h:=h || jsonb_build_object('forms',forms);
  IF h->>'activeFormId'=form_id THEN h:=h || jsonb_build_object(field_name,confirmation); END IF;
  UPDATE tasks SET recurrence_info=jsonb_set(coalesce(recurrence_info,'{}'),'{production_handover}',h) WHERE id=task_id;
  RETURN confirmation;
END $$;
REVOKE ALL ON FUNCTION public.confirm_legacy_production_receipt(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_legacy_production_receipt(uuid,text,text) TO authenticated;

-- Return planning uses the accepted, net path. Physical transit legs remain in the audit ledger.
CREATE OR REPLACE FUNCTION public.production_return_history(order_id uuid, since_at timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; BEGIN
  IF auth.uid() IS NULL OR NOT has_module_permission('production_orders','edit') THEN RAISE EXCEPTION 'دسترسی برگشت موجودی ندارید'; END IF;
  IF EXISTS(SELECT 1 FROM production_receipts h WHERE h.order_id=production_return_history.order_id AND h.status IN ('sent','partial')) THEN
    RAISE EXCEPTION 'ابتدا ماندهٔ در انتظار دریافت را تعیین تکلیف کنید'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.created_at,s.production_event_index NULLS FIRST,s.id),'[]') INTO result FROM (
    SELECT t.id,t.created_at,t.production_event_index,t.product_id,t.delivered_qty,t.to_shelf_id,t.target_bundle_id,t.bundle_id,t.notes,t.stage_task_id,
      CASE WHEN t.receipt_phase='receive' THEN l.source_shelf_id ELSE t.from_shelf_id END from_shelf_id,
      CASE WHEN t.receipt_phase='receive' THEN l.source_bundle_id ELSE t.source_bundle_id END source_bundle_id,
      CASE WHEN t.receipt_phase='receive' THEN h.source_task_id ELSE t.source_task_id END source_task_id,
      CASE WHEN t.receipt_phase='receive' THEN h.destination_task_id ELSE t.destination_task_id END destination_task_id
    FROM stock_transfers t LEFT JOIN production_receipt_lines l ON l.id=t.receipt_line_id LEFT JOIN production_receipts h ON h.id=l.receipt_id
    WHERE t.production_order_id=production_return_history.order_id AND t.transfer_type IN ('production','production_stage','waste')
      AND t.receipt_phase IS DISTINCT FROM 'send' AND (since_at IS NULL OR t.created_at>since_at)
  ) s;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.production_return_history(uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.production_return_history(uuid,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_pending_receipt_task() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
  IF (NEW.production_shelf_id,NEW.assignee_id,NEW.assignee_role_id,NEW.assignee_type,NEW.related_production_order)
    IS DISTINCT FROM (OLD.production_shelf_id,OLD.assignee_id,OLD.assignee_role_id,OLD.assignee_type,OLD.related_production_order)
    AND EXISTS(SELECT 1 FROM production_receipts WHERE status IN ('sent','partial') AND (source_task_id=OLD.id OR destination_task_id=OLD.id)) THEN
    RAISE EXCEPTION 'تا تعیین تکلیف تحویل در انتظار دریافت، مسئول و قفسهٔ مرحله قابل تغییر نیست'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_pending_receipt_task ON public.tasks;
CREATE TRIGGER guard_pending_receipt_task BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.guard_pending_receipt_task();

-- Old clients cannot bypass the two-sided workflow through the former delivery RPC.
DO $$ BEGIN
  IF to_regprocedure('public.commit_production_operation_before_receipts(jsonb)') IS NULL THEN
    ALTER FUNCTION public.commit_production_operation(jsonb) RENAME TO commit_production_operation_before_receipts;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.commit_production_operation_before_receipts(jsonb) FROM PUBLIC,authenticated;
CREATE OR REPLACE FUNCTION public.commit_production_operation(command jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE task_row tasks%ROWTYPE; remaining jsonb; active jsonb; order_value uuid; BEGIN
  IF command->>'kind' IN ('deliver','handover') THEN RAISE EXCEPTION 'برای تحویل از روال جدید پیش‌نویس، ارسال و دریافت استفاده کنید'; END IF;
  PERFORM commit_production_operation_before_receipts(command);
  IF command->>'kind'='return' THEN
    order_value:=(command#>>'{orders,0,id}')::uuid;
    UPDATE production_receipts SET returned_at=clock_timestamp() WHERE order_id=order_value AND status='received' AND returned_at IS NULL;
    -- Clear only the derived current-cycle forms; historical receipt/audit tables are retained.
    FOR task_row IN SELECT * FROM tasks WHERE related_production_order=order_value FOR UPDATE LOOP
      IF jsonb_typeof(task_row.recurrence_info#>'{production_handover,forms}')='array' THEN
        SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]') INTO remaining
          FROM jsonb_array_elements(task_row.recurrence_info#>'{production_handover,forms}') WITH ORDINALITY x(value,ord)
          WHERE NOT (value ? 'receiptId');
        active:=coalesce(remaining->(jsonb_array_length(remaining)-1),'{}');
        UPDATE tasks SET recurrence_info=jsonb_set(recurrence_info,'{production_handover}',active || jsonb_build_object('forms',remaining,'activeFormId',active->>'id')) WHERE id=task_row.id;
      END IF;
    END LOOP;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.commit_production_operation(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_production_operation(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
