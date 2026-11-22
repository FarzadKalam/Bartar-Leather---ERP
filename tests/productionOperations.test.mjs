import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '../.tmp-tests/pg-validation/node_modules/@electric-sql/pglite/dist/index.js';

// Same isolated PostgreSQL runtime as productionStageShelfGuard.test.mjs.
const db = new PGlite();
const [order, product, output, source, stage, bundle, dest, task, user] = Array.from({ length: 9 }, () => randomUUID());
await db.exec(`
  create role anon; create role authenticated; create schema auth;
  create function auth.uid() returns uuid language sql as $$ select '${user}'::uuid $$;
  create function has_module_permission(text,text) returns boolean language sql as $$select coalesce(current_setting('test.can_edit',true),'on')='on'$$;
  create table shelves(id uuid primary key, warehouse_id uuid);
  create table company_settings(allow_negative_inventory boolean);
  create table products(id uuid primary key, stock numeric, sub_stock numeric,catalog_role text,parent_product_id uuid);
  create table product_bundles(id uuid primary key, bundle_number text,system_code text default 'BND-NEW',shelf_id uuid);
  create table product_inventory(id uuid primary key default gen_random_uuid(),product_id uuid,shelf_id uuid,bundle_id uuid,warehouse_id uuid,stock numeric);
  create table production_orders(id uuid primary key,status text,production_moves jsonb,grid_materials jsonb,production_shelf_id uuid,production_group_order_id uuid,quantity numeric,
    production_completed_at timestamptz,production_started_at timestamptz,production_stopped_at timestamptz,production_output_qty numeric,
    production_output_product_id uuid,production_output_shelf_id uuid,updated_at timestamptz);
  create table production_group_orders(id uuid primary key,status text,started_at timestamptz,updated_at timestamptz,updated_by uuid);
  create table tasks(id uuid primary key,related_production_order uuid,production_shelf_id uuid,recurrence_info jsonb);
  create table stock_transfers(id uuid primary key default gen_random_uuid(),created_at timestamptz default now(),transfer_type text,
    product_id uuid,required_qty numeric,delivered_qty numeric,production_order_id uuid,from_shelf_id uuid,to_shelf_id uuid,bundle_id uuid,
    source_bundle_id uuid,target_bundle_id uuid,source_task_id uuid,destination_task_id uuid,sender_id uuid,receiver_id uuid,delivered_at timestamptz);
  insert into products(id) values ('${product}'),('${output}');
  insert into shelves(id) values ('${stage}'),('${source}');
  insert into product_bundles(id,bundle_number,shelf_id) values ('${bundle}','B-1','${source}');
  insert into production_orders(id,status) values ('${order}','pending');
  insert into tasks values ('${task}','${order}','${stage}',null);
  insert into product_inventory(product_id,shelf_id,bundle_id,stock) values ('${product}','${source}','${bundle}',10);
`);
for (const file of ['20261024_production_bundle_numbering','20261114_production_operations']) {
  await db.exec(await readFile(new URL('../migrations/' + file + '.sql', import.meta.url), 'utf8'));
}
const run = (cmd) => db.query('select commit_production_operation($1)', [JSON.stringify(cmd)]);
const stock = async (s,p) => Number((await db.query('select coalesce(sum(stock),0) n from product_inventory where shelf_id=$1 and product_id=$2',[s,p])).rows[0].n);
const move = { product_id: product,source_shelf_id: source,target_shelf_id: stage,source_bundle_id: bundle,target_bundle_id: dest,quantity: 4,new_bundle: true };
const form = {production_handover:{forms:[{id:'receipt'}]}};
const log = {transfer_type:'production_stage',production_order_id:order,product_id:product,required_qty:4,delivered_qty:4,from_shelf_id:source,to_shelf_id:stage,bundle_id:dest,source_bundle_id:bundle,target_bundle_id:dest,notes:'تحویل مواد اولیه آزمایشی',stage_task_id:task};
const command = {kind:'deliver',orders:[{id:order,revision:0}],moves:[move],tasks:[{id:task,shelf:stage,previous:null,recurrence:form}],transfers:[log],factors:{[product]:1}};
// Reproduce the older production schema before applying the additive repair.
await assert.rejects(run(command), /notes.*does not exist/);
assert.equal(await stock(source,product),10);
assert.equal((await db.query('select count(*)::int n from stock_transfers')).rows[0].n,0);
const metadataMigration = await readFile(new URL('../migrations/20261121_production_transfer_metadata.sql', import.meta.url),'utf8');
await db.exec(metadataMigration);
await db.exec(metadataMigration); // Re-running must preserve existing schema/data.
await db.exec("set test.can_edit='off'");
await assert.rejects(run(command), /دسترسی/);
await db.exec("set test.can_edit='on'");
await assert.rejects(run({...command,transfers:[{...log,delivered_qty:3}]}), /مقدار انتقال/);
await assert.rejects(run({...command,tasks:[{...command.tasks[0],previous:{stale:true}}]}));
assert.equal(await stock(source,product),10);
assert.equal((await db.query('select id from stock_transfers')).rows.length,0);
// The second destination rejects a stale form after both physical movements have run.
const [groupId, secondOrder, secondTask, secondBundle, secondStage] = Array.from({length:5}, () => randomUUID());
await db.exec(`
  insert into production_group_orders(id,status) values ('${groupId}','pending');
  insert into production_orders(id,status) values ('${secondOrder}','pending');
  insert into shelves(id) values ('${secondStage}');
  insert into tasks values ('${secondTask}','${secondOrder}','${secondStage}',null);
`);
const grouped = {...command,groupId,orders:[...command.orders,{id:secondOrder,revision:0}],
  tasks:[...command.tasks,{id:secondTask,shelf:secondStage,previous:{stale:true},recurrence:form}],
  moves:[move,{...move,target_shelf_id:secondStage,target_bundle_id:secondBundle}],
  transfers:[log,{...log,production_order_id:secondOrder,to_shelf_id:secondStage,bundle_id:secondBundle,target_bundle_id:secondBundle}]};
await assert.rejects(run(grouped), /مرحله تغییر کرده/);
assert.equal(await stock(source,product),10);
assert.equal((await db.query('select count(*)::int n from product_bundles')).rows[0].n,1);
await db.exec('begin');
await run({...grouped,tasks:grouped.tasks.map(t => ({...t,previous:null}))});
assert.equal(await stock(source,product),2);
assert.equal(await stock(stage,product),4);
assert.equal(await stock(secondStage,product),4);
await db.exec('rollback');
await run(command);
const metadata = (await db.query('select notes,stage_task_id from stock_transfers')).rows[0];
assert.equal(metadata.notes, 'تحویل مواد اولیه آزمایشی');
assert.equal(metadata.stage_task_id, task);
// Giver and receiver confirmations change the form, not the transferred stock.
await db.exec('begin');
const giverForm = {...form, giverConfirmation:{confirmed:true}};
await run({kind:'handover',orders:[{id:order}],tasks:[{id:task,shelf:stage,previous:form,recurrence:giverForm}],factors:{}});
const receiverForm = {...giverForm,receiverConfirmation:{confirmed:true}};
await run({kind:'handover',orders:[{id:order}],tasks:[{id:task,shelf:stage,previous:giverForm,recurrence:receiverForm}],factors:{}});
assert.equal(await stock(stage,product),4);
assert.equal((await db.query('select count(*)::int n from stock_transfers')).rows[0].n,1);
await assert.rejects(run({kind:'handover',orders:[{id:order}],tasks:[{id:task,shelf:stage,previous:giverForm,recurrence:receiverForm}],factors:{}}), /مرحله تغییر کرده/);
await db.exec('rollback');
await assert.rejects(run(command));
assert.equal(await stock(stage,product),4);
await run({kind:'hold',orders:[{id:order,revision:1}]});
assert.equal(await stock(stage,product),4);
await assert.rejects(run({kind:'handover',orders:[{id:order}]}));
await run({kind:'resume',orders:[{id:order,revision:2}]});
const completion={kind:'complete',orders:[{id:order,revision:3,patch:{production_output_product_id:output,production_output_shelf_id:stage,production_output_qty:1}}],
  deltas:[{productId:product,shelfId:stage,bundleId:dest,delta:-4},{productId:output,shelfId:stage,delta:1}],
  transfers:[{...log,transfer_type:'production',from_shelf_id:stage,to_shelf_id:null,bundle_id:dest},{...log,transfer_type:'production',product_id:output,required_qty:1,delivered_qty:1,from_shelf_id:null,bundle_id:null}],
  factors:{[product]:1,[output]:1}};
await assert.rejects(run({...completion, transfers:completion.transfers.map(t => ({...t,production_order_id:randomUUID()}))}), /سفارش حواله/);
assert.equal(await stock(stage,product),4);
assert.equal(await stock(stage,output),0);
const returnCommand = {kind:'return',orders:[{id:order,revision:3,patch:{production_moves:null,grid_materials:[]}}],
  moves:[{...move,source_shelf_id:stage,target_shelf_id:source,source_bundle_id:dest,target_bundle_id:bundle,new_bundle:false}],
  transfers:[{...log,from_shelf_id:stage,to_shelf_id:source,source_bundle_id:dest,target_bundle_id:bundle}],factors:{[product]:1}};

if (process.argv.includes('--manual')) {
  const {createInterface} = await import('node:readline/promises');
  const terminal = createInterface({input:process.stdin,output:process.stdout});
  console.log('سفارش ساختگی: از ۱۰ واحد مواد اولیه، ۴ واحد تحویل تولید شده است.');
  try {
    for (;;) {
      const mode = await terminal.question('۱ = نگهداری در تولید، ۲ = برگشت به مبدأ، ۰ = پایان: ');
      if (['0','۰'].includes(mode.trim())) break;
      if (!['1','2','۱','۲'].includes(mode.trim())) continue;
      await db.exec('begin');
      const keep = ['1','۱'].includes(mode.trim());
      await run(keep ? {kind:'hold',orders:[{id:order,revision:3}]} : returnCommand);
      console.log('موجودی قفسهٔ مبدأ:',await stock(source,product),' | موجودی قفسهٔ تولید:',await stock(stage,product));
      await db.exec('rollback'); // Restore the fixture for the next manual choice.
    }
  } finally {terminal.close();}
}
await db.exec('begin');
await run(returnCommand);
assert.equal(await stock(source,product),10);
assert.equal(await stock(stage,product),0);
const archived=(await db.query('select recurrence_info from tasks where id=$1',[task])).rows[0].recurrence_info;
assert.deepEqual(archived.production_handover_archive,[form.production_handover]);
assert.equal(archived.production_handover,undefined);
await db.exec('rollback');
await db.exec('begin');
await run(completion);
await assert.rejects(run(completion));
await db.exec('rollback');
await run(completion);
assert.equal(await stock(stage,output),1);
assert.equal(await stock(stage,product),0);
await assert.rejects(run(completion));
assert.equal((await db.query('select id from stock_transfers')).rows.length,3);
console.log('PASS atomic delivery, failed document rollback, duplicate submit, hold, resume and completion');
await db.close();
