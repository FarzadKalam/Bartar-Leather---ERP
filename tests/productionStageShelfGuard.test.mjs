import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Isolated PostgreSQL test, with no production connection or runtime dependency.
// Setup: npm install --prefix .tmp-tests/pg-validation --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.5.11
// Run: node tests/productionStageShelfGuard.test.mjs
const { PGlite } = await import('../.tmp-tests/pg-validation/node_modules/@electric-sql/pglite/dist/index.js');

const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION public.has_module_permission(text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT COALESCE(NULLIF(current_setting('test.edit_allowed',true),''),'true')::boolean $$;
CREATE TABLE public.tasks (id uuid PRIMARY KEY, related_production_order uuid, production_shelf_id uuid, recurrence_info jsonb);
CREATE TABLE public.production_orders (id uuid PRIMARY KEY, grid_materials jsonb);
`);
await db.exec(await readFile(new URL('../migrations/20261024_production_stage_shelf_guard.sql', import.meta.url), 'utf8'));
const order = '11111111-1111-4111-8111-111111111111';
const otherOrder = '22222222-2222-4222-8222-222222222222';
const ids = [1,2,3,4,5].map(n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
const shelf = '33333333-3333-4333-8333-333333333333';
await db.query('SELECT set_config($1,$2,false)', ['request.jwt.claim.sub', ids[0]]);
await db.query('INSERT INTO production_orders VALUES ($1,$3),($2,$3)',[order,otherOrder,'[]']);
for (let i=0; i<ids.length; i++) await db.query('INSERT INTO tasks VALUES ($1,$2,$3,$4)',[ids[i],i===4?otherOrder:order,shelf,'{}']);
const locked = async (i) => (await db.query('SELECT production_stage_shelf_is_locked($1) AS locked',[ids[i]])).rows[0].locked;
const saveForms = async (i, forms) => db.query('UPDATE tasks SET recurrence_info=$2 WHERE id=$1',[ids[i],JSON.stringify({production_handover:{forms}})]);
const group = (row) => ({deliveryRows:[row]});
const form = (row, extras={}) => ({direction:'incoming', groups:[group(row)], ...extras});
assert.equal(await locked(0),false);
await db.query('UPDATE tasks SET production_shelf_id=NULL WHERE id=$1',[ids[0]]);
await saveForms(1,[form({mainQuantity:1300642.56,subQuantity:14})]);
assert.equal(await locked(1),true);
await assert.rejects(db.query('UPDATE tasks SET production_shelf_id=NULL WHERE id=$1',[ids[1]]), {code:'23514'});
await saveForms(2,[form({mainQuantity:1}, {direction:'outgoing',sourceTaskId:ids[2],destinationTaskId:ids[0]})]);
assert.equal(await locked(0),true);
assert.equal(await locked(2),false);
assert.equal(await locked(3),false); // Sharing a shelf does not imply sharing delivery history.
await saveForms(2,[form({mainQuantity:0,deliveredQty:100,length:2,width:3,quantity:4}, {direction:'outgoing',destinationTaskId:ids[0]})]);
assert.equal(await locked(0),false);
await saveForms(4,[form({mainQuantity:100},{direction:'outgoing',destinationTaskId:ids[0]})]);
assert.equal(await locked(0),false); // Another production order cannot lock this stage.
await saveForms(1,[form({delivered_qty:0.5}),form({mainQuantity:1},{direction:'outgoing'})]);
assert.equal(await locked(1),true); // An old unsigned receipt still locks even after an outgoing form.
await db.query('UPDATE tasks SET recurrence_info=$2 WHERE id=$1',[ids[1],JSON.stringify({production_handover:{groups:[group({deliveredQty:1})]}})]);
assert.equal(await locked(1),true); // Legacy snapshots with no forms array.
await db.query('UPDATE tasks SET recurrence_info=$2 WHERE id=$1',[ids[1],JSON.stringify({production_handover:{forms:{},groups:[group({deliveredQty:1})]}})]);
assert.equal(await locked(1),true); // Malformed legacy forms do not crash the guard.
await db.query('UPDATE production_orders SET grid_materials=$2 WHERE id=$1',[order,JSON.stringify([{delivery_rows:[{targetStageTaskId:ids[0],mainQuantity:0.1}]}])]);
assert.equal(await locked(0),true);
assert.equal(await locked(3),false);
await db.query('UPDATE production_orders SET grid_materials=$2 WHERE id=$1',[order,JSON.stringify([{target_stage_task_id:ids[0],delivery_rows:[{deliveredQty:0.1}]}])]);
assert.equal(await locked(0),true);
await db.query('UPDATE production_orders SET grid_materials=$2 WHERE id=$1',[order,JSON.stringify([{target_stage_task_id:ids[0],delivery_rows:[{mainQuantity:0,deliveredQty:100}]}])]);
assert.equal(await locked(0),false);
for (const [row, expected] of [[{mainQuantity:0,deliveredQty:100},0],[{mainQuantity:'۱٬۳۰۰٬۶۴۲.۵۶'},1300642.56],[{mainQuantity:1e-8},1e-8],[{length:223,width:103,quantity:2},45938]]) {
  const actual = (await db.query('SELECT production_delivery_row_quantity($1) AS amount',[JSON.stringify(row)])).rows[0].amount;
  assert.equal(Number(actual),expected);
}
assert.equal((await db.query("SELECT has_function_privilege('authenticated','public.production_stage_has_receipts(uuid,uuid)','execute') AS allowed")).rows[0].allowed,false);
assert.equal((await db.query("SELECT has_function_privilege('anon','public.production_stage_shelf_is_locked(uuid)','execute') AS allowed")).rows[0].allowed,false);
assert.equal((await db.query("SELECT has_function_privilege('authenticated','public.production_stage_shelf_is_locked(uuid)','execute') AS allowed")).rows[0].allowed,true);
await db.query('SELECT set_config($1,$2,false)', ['test.edit_allowed','false']);
await assert.rejects(locked(0),{code:'42501'});
await db.query('SELECT set_config($1,$2,false)', ['test.edit_allowed','true']);
await db.query('SELECT set_config($1,$2,false)', ['request.jwt.claim.sub','']);
await assert.rejects(locked(0),{code:'42501'});
console.log('PASS: shelf migration, incoming/outgoing history, old forms, order isolation, shared shelves, zero amounts, triggers and permissions.');
await db.close();
