import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '../../.tmp-tests/pg-validation/node_modules/@electric-sql/pglite/dist/index.js';

export async function receiptDatabase() {
  const db = new PGlite();
  const ids = Object.fromEntries(['sender','receiver','other','admin','role','order','source','stage','bundle','product','task','group'].map(k=>[k,randomUUID()]));
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    alter default privileges in schema public grant execute on functions to anon,authenticated;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
    create function has_module_permission(text,text) returns boolean language sql as $$select coalesce(current_setting('test.permission',true),'on')='on'$$;
    create table org_roles(id uuid primary key,title text,permissions jsonb);
    create table profiles(id uuid primary key,full_name text,role text,role_id uuid);
    create table warehouses(id uuid primary key default gen_random_uuid(),name text);
    create table shelves(id uuid primary key default gen_random_uuid(),warehouse_id uuid,shelf_number text,name text);
    create table company_settings(allow_negative_inventory boolean);
    create table products(id uuid primary key,name text,main_unit text,stock numeric,sub_stock numeric,catalog_role text,parent_product_id uuid);
    create table product_bundles(id uuid primary key default gen_random_uuid(),bundle_number text,system_code text default 'BND-TEST',shelf_id uuid);
    create table product_inventory(id uuid primary key default gen_random_uuid(),product_id uuid,shelf_id uuid,bundle_id uuid,warehouse_id uuid,stock numeric);
    create table production_orders(id uuid primary key,name text,status text,production_moves jsonb,grid_materials jsonb,production_shelf_id uuid,production_group_order_id uuid,quantity numeric,
      production_completed_at timestamptz,production_started_at timestamptz,production_stopped_at timestamptz,production_output_qty numeric,
      production_output_product_id uuid,production_output_shelf_id uuid,updated_at timestamptz);
    create table production_group_orders(id uuid primary key,status text,started_at timestamptz,updated_at timestamptz,updated_by uuid);
    create table tasks(id uuid primary key,name text,related_production_order uuid,production_shelf_id uuid,recurrence_info jsonb,assignee_id uuid,assignee_role_id uuid,assignee_type text);
    create table stock_transfers(id uuid primary key default gen_random_uuid(),created_at timestamptz default now(),transfer_type text,
      product_id uuid,required_qty numeric,delivered_qty numeric,production_order_id uuid,from_shelf_id uuid,to_shelf_id uuid,bundle_id uuid,
      source_bundle_id uuid,target_bundle_id uuid,source_task_id uuid,destination_task_id uuid,sender_id uuid,receiver_id uuid,delivered_at timestamptz);
    insert into org_roles values('${ids.role}','برش‌کار','{}');
    insert into profiles values('${ids.sender}','انباردار','editor',null),('${ids.receiver}','تحویل‌گیرنده','editor','${ids.role}'),('${ids.other}','کاربر دیگر','editor',null),('${ids.admin}','مدیر','admin',null);
    insert into products values('${ids.product}','چرم عسلی پاکباز','فوت مربع',100,100,'standalone',null);
    insert into shelves(id,shelf_number,name) values('${ids.source}','1','انبار اصلی'),('${ids.stage}','2','برش اول');
    insert into product_bundles(id,bundle_number,shelf_id) values('${ids.bundle}','بسته ۱','${ids.source}');
    insert into product_inventory(product_id,shelf_id,bundle_id,stock) values('${ids.product}','${ids.source}','${ids.bundle}',100);
    insert into production_group_orders(id,status) values('${ids.group}','pending');
    insert into production_orders(id,name,status,quantity,production_group_order_id) values('${ids.order}','۵ بایگان آزمایشی','pending',5,'${ids.group}');
    insert into tasks values('${ids.task}','برش اول','${ids.order}','${ids.stage}',null,'${ids.receiver}',null,'user');
  `);
  for (const name of ['20260915_enforce_single_shelf_per_bundle','20261024_production_bundle_numbering','20261114_production_operations','20261121_production_transfer_metadata','20261122_production_receipts','20261122_production_receipt_permissions']) {
    await db.exec(await readFile(new URL(`../../migrations/${name}.sql`,import.meta.url),'utf8'));
  }
  const user=async id=>db.query("select set_config('test.user',$1,false)",[id]);
  await user(ids.sender);
  const draft=(quantity=20,key=randomUUID())=>[{request_key:key,order_id:ids.order,destination_task_id:ids.task,target_shelf_id:ids.stage,lines:[{
    product_id:ids.product,source_shelf_id:ids.source,source_bundle_id:ids.bundle,unit:'فوت مربع',quantity,new_bundle:true
  }]}];
  const save=docs=>db.query('select save_production_receipt_drafts($1)',[JSON.stringify(docs)]);
  const list=async()=> (await db.query('select list_production_receipts($1) d',[[ids.order]])).rows[0].d;
  const action=(id,revision,action,quantities={},reason='',key=randomUUID())=>db.query('select production_receipt_action($1)',[JSON.stringify({id,revision,action,quantities,reason,request_key:key})]);
  const stock=async shelf=>Number((await db.query('select coalesce(sum(stock),0) n from product_inventory where shelf_id=$1',[shelf])).rows[0].n);
  return {db,ids,user,draft,save,list,action,stock};
}
