import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { planProductionReturn } = createRequire(import.meta.url)('../.tmp-tests/utils/productionReturn.js');
import { receiptDatabase } from './fixtures/productionReceiptDatabase.mjs';
const {db,ids,user,draft,save,list,action,stock}=await receiptDatabase();
try {
  const docs=draft(); await save(docs); await save(docs);
  assert.equal((await list()).length,1,'retry draft is idempotent');
  const changed=structuredClone(docs); changed[0].lines[0].quantity=25;
  await assert.rejects(save(changed),/اطلاعات دیگری/);
  assert.equal(await stock(ids.source),100); assert.equal(await stock(ids.stage),0);
  assert.equal((await db.query('select status from production_orders')).rows[0].status,'pending');
  let h=(await list())[0], line=h.lines[0].id;
  await assert.rejects(action(h.id,0,'receive',{[line]:18}),/مسئول|هنوز/);
  await user(ids.other); await assert.rejects(action(h.id,0,'send'),/مسئول/);
  await user(ids.sender); const sendKey=randomUUID(); await action(h.id,0,'send',{},'',sendKey); await action(h.id,0,'send',{},'',sendKey);
  assert.equal(await stock(ids.source),80); assert.equal(await stock(ids.stage),0);
  const transit=(await db.query('select shelf_id from production_transit_location')).rows[0].shelf_id;
  assert.equal(await stock(transit),20);
  await assert.rejects(db.query('update tasks set assignee_id=$1 where id=$2',[ids.other,ids.task]),/تعیین تکلیف/);
  await assert.rejects(db.query('select production_return_history($1)',[ids.order]),/تعیین تکلیف/);
  await assert.rejects(db.query('update product_inventory set stock=0 where shelf_id=$1',[transit]),/انتظار دریافت/);
  await assert.rejects(db.query('delete from product_inventory where shelf_id=$1',[transit]),/انتظار دریافت/);
  await assert.rejects(db.query("update production_orders set status='completed' where id=$1",[ids.order]),/انتظار دریافت/);
  await assert.rejects(db.query("update production_orders set production_on_hold=true where id=$1",[ids.order]),/انتظار دریافت/);
  await assert.rejects(action(h.id,1,'receive',{[line]:18}),/مسئول/);
  await user(ids.receiver);
  for(const amount of [-1,21,'NaN','Infinity']) await assert.rejects(action(h.id,1,'receive',{[line]:amount}));
  await assert.rejects(action(h.id,1,'receive',{[randomUUID()]:1}),/ردیف/);
  await assert.rejects(action(h.id,1,'receive',{[line]:0}),/مقدار واقعی/);
  const receiveKey=randomUUID(); await action(h.id,1,'receive',{[line]:18},'',receiveKey); await action(h.id,1,'receive',{[line]:18},'',receiveKey);
  assert.equal(await stock(ids.stage),18); assert.equal(await stock(transit),2);
  assert.equal(Number((await db.query("select recurrence_info#>>'{production_handover,groups,0,totalHandoverQty}' n from tasks where id=$1",[ids.task])).rows[0].n),18);
  h=(await list())[0]; assert.equal(h.status,'partial'); assert.equal(h.lines[0].received,18);
  await assert.rejects(action(h.id,1,'receive',{[line]:2}),/فرم تغییر/);
  await action(h.id,2,'receive',{[line]:2});
  assert.equal(await stock(ids.stage),20); assert.equal(await stock(transit),0); assert.equal((await list())[0].status,'received');
  assert.equal(Number((await db.query('select sum(stock) n from product_inventory')).rows[0].n),100);
  const logs=(await db.query('select sender_id,receiver_id from stock_transfers order by created_at')).rows;
  assert.equal(logs[0].sender_id,ids.sender); assert.equal(logs[0].receiver_id,null);
  assert.equal(logs[1].sender_id,null); assert.equal(logs[1].receiver_id,ids.receiver);
  const confirmations=async()=> (await db.query('select receipt_phase,is_sender_confirmed,is_receiver_confirmed from stock_transfers order by created_at')).rows;
  assert.deepEqual(await confirmations(),[
    {receipt_phase:'send',is_sender_confirmed:true,is_receiver_confirmed:false},
    {receipt_phase:'receive',is_sender_confirmed:false,is_receiver_confirmed:true},
    {receipt_phase:'receive',is_sender_confirmed:false,is_receiver_confirmed:true},
  ]);
  await db.exec('alter table stock_transfers disable trigger sync_receipt_transfer_confirmation; update stock_transfers set is_sender_confirmed=false,is_receiver_confirmed=false; alter table stock_transfers enable trigger sync_receipt_transfer_confirmation');
  const snapshot=JSON.stringify((await db.query('select * from product_inventory order by id')).rows);
  const repair=await readFile(new URL('../migrations/20261122_production_transfer_confirmations.sql',import.meta.url),'utf8');
  await db.exec(repair); const repaired=await confirmations(); await db.exec(repair);
  assert.deepEqual(await confirmations(),repaired);
  assert.equal(repaired[0].is_sender_confirmed,true); assert.equal(repaired[1].is_receiver_confirmed,true);
  assert.equal(JSON.stringify((await db.query('select * from product_inventory order by id')).rows),snapshot);
  await user(ids.sender); await save(draft(90)); const insufficient=(await list())[0];
  await assert.rejects(action(insufficient.id,0,'send'),/کافی نیست/);
  assert.equal(await stock(ids.source),80); assert.equal((await list())[0].status,'draft');
  await user(ids.admin); await assert.rejects(action(insufficient.id,0,'cancel'),/نمایندگی/);
  await action(insufficient.id,0,'cancel',{},'اصلاح مقدار با اجازه مسئول');
  assert.equal((await list())[0].events[0].reason,'اصلاح مقدار با اجازه مسئول');
  // Atomic batch: a bad second destination rolls the entire batch back.
  await user(ids.sender); const before=(await list()).length;
  await assert.rejects(save([...draft(2),{...draft(3)[0],destination_task_id:randomUUID()}]));
  assert.equal((await list()).length,before);
  // Role-assigned recipient and successive receipts under the same role.
  await db.query("update tasks set assignee_type='role',assignee_id=null,assignee_role_id=$1 where id=$2",[ids.role,ids.task]);
  await save(draft(5)); h=(await list())[0]; await action(h.id,0,'send'); await user(ids.receiver);
  await action(h.id,1,'receive',{[h.lines[0].id]:5});
  // Legacy signatures neither move stock again nor accept a forged person.
  const legacy={production_handover:{activeFormId:'old',forms:[{id:'old',giver:{id:ids.sender,type:'user'},receiver:{id:ids.receiver,type:'user'},groups:[]}]}};
  await db.query('update tasks set recurrence_info=$1 where id=$2',[JSON.stringify(legacy),ids.task]);
  const stockBefore=await stock(ids.stage);
  const legacyCall=side=>db.query('select confirm_legacy_production_receipt($1,$2,$3)',[ids.task,'old',side]);
  await assert.rejects(legacyCall('giver'),/حساب مسئول/); await legacyCall('receiver'); await legacyCall('receiver');
  assert.equal(await stock(ids.stage),stockBefore);
  await assert.rejects(db.query('select commit_production_operation($1)',[JSON.stringify({kind:'handover'})]),/روال جدید/);
  // A second production stage must preserve the original warehouse, not become a new origin.
  const secondStage=randomUUID(),secondTask=randomUUID();
  await db.query('insert into shelves(id,name) values($1,$2)',[secondStage,'برش لیزر']);
  await db.query("insert into tasks(id,name,related_production_order,production_shelf_id,assignee_id,assignee_type) values($1,'برش لیزر',$2,$3,$4,'user')",[secondTask,ids.order,secondStage,ids.receiver]);
  const stageBundle=(await db.query('select bundle_id from product_inventory where shelf_id=$1 order by stock desc limit 1',[ids.stage])).rows[0].bundle_id;
  await save([{request_key:randomUUID(),order_id:ids.order,source_task_id:ids.task,destination_task_id:secondTask,target_shelf_id:secondStage,
    lines:[{product_id:ids.product,source_shelf_id:ids.stage,source_bundle_id:stageBundle,unit:'فوت مربع',quantity:10,new_bundle:true}]}]);
  h=(await list())[0]; await action(h.id,0,'send'); await action(h.id,1,'receive',{[h.lines[0].id]:10});
  assert.equal(await stock(secondStage),10);
  const order=(await db.query('select * from production_orders where id=$1',[ids.order])).rows[0];
  const history=(await db.query('select production_return_history($1) logs',[ids.order])).rows[0].logs;
  const returns=planProductionReturn(order.production_moves,history);
  assert.equal(returns.reduce((s,m)=>s+m.quantity,0),25);
  assert.ok(returns.every(m=>m.to_shelf_id===ids.source));
  await db.query('select commit_production_operation($1)',[JSON.stringify({kind:'return',orders:[{id:ids.order,revision:order.production_revision,patch:{production_moves:null}}],
    moves:returns.map(m=>({product_id:m.product_id,source_shelf_id:m.from_shelf_id,target_shelf_id:m.to_shelf_id,source_bundle_id:m.bundle_id,target_bundle_id:m.target_bundle_id,quantity:m.quantity,new_bundle:false})),
    transfers:returns.map(m=>({transfer_type:'production',production_order_id:ids.order,product_id:m.product_id,delivered_qty:m.quantity,required_qty:m.quantity,from_shelf_id:m.from_shelf_id,to_shelf_id:m.to_shelf_id,source_bundle_id:m.bundle_id,target_bundle_id:m.target_bundle_id,bundle_id:m.target_bundle_id})),factors:{[ids.product]:1}})]);
  assert.equal(await stock(ids.source),100); assert.equal(await stock(ids.stage),0);
  assert.equal(await stock(secondStage),0);
  assert.ok((await list()).filter(r=>r.status==='received').every(r=>r.returned_at));
  assert.equal((await db.query("select count(*)::int n from tasks,jsonb_array_elements(recurrence_info#>'{production_handover,forms}') f where f ? 'receiptId'")).rows[0].n,0);
  // Re-running an applied migration preserves inventory, draft identities, and history.
  await db.exec(await readFile(new URL('../migrations/20261122_production_receipts.sql',import.meta.url),'utf8'));
  assert.equal(await stock(ids.stage),0);
  await db.exec('grant usage on schema auth to authenticated; grant select,update,delete on product_inventory to authenticated; set role authenticated');
  assert.ok(Array.isArray(await list()),'receipt RPC works with the actual authenticated database role');
  await assert.rejects(db.query('select * from production_receipts'),/permission denied/);
  await assert.rejects(db.query('select project_production_receipt($1)',[ids.order]),/permission denied/);
  await db.exec('reset role');
  await db.exec('set role anon');
  await assert.rejects(db.query('select list_production_receipts($1)',[[ids.order]]),/permission denied/);
  await assert.rejects(db.query('select commit_production_operation($1)',['{}']),/permission denied/);
  await assert.rejects(db.query('select project_production_receipt($1)',[ids.order]),/permission denied/);
  await db.exec('reset role');
  console.log('Production receipt transactions passed: draft, dispatch, partial receipt, retries, stock conservation, permissions, legacy, rollback, migration repeat.');
} finally { await db.close(); }
