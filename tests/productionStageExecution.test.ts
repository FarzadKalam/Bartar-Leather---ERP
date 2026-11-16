import * as assert from 'node:assert/strict';
import { applyStageResult, pendingQuantity, type StageExecution, type ResultCommand } from '../utils/productionStageExecution';
import { attachRoutes, type PlannedTransfer } from '../utils/productionStagePlan';
import { sampleStageExecution } from './fixtures/stageExecution';

const route = (id:string,from:string,to:string,unit:string,perItem:number): PlannedTransfer => ({
  id,from,to,unit,perItem,mode:unit==='عدد'?'piece':'bulk',material:'leather',materialName:'چرم',state:id,
});
const stages = attachRoutes(['برش','لیزر','لویس','بسته‌بندی'].map((name,i)=>({id:String(i+1),name})),[
  route('raw','warehouse','1','فوت مربع',1.2),route('cut','1','2','عدد',2),
  route('lining','warehouse','2','فوت مربع',0.5),route('laser','2','3','عدد',3),
  route('cut-lining','2','4','عدد',1),route('skived','3','4','عدد',3),
  route('hardware','warehouse','4','عدد',1),route('pack','4','finished-shelf','عدد',1),
]);
const at = '2026-11-15T12:00:00Z';
const run = (state:StageExecution,stage:string,command:ResultCommand) =>
  applyStageResult(state,stages,{id:'worker-'+stage,stageIds:[stage]},command,at);
const initial = sampleStageExecution(stages);
const before = JSON.stringify(initial);
const draft:ResultCommand = {kind:'save',id:'first',stageId:'1',inputs:[{lotId:'opening-0',used:5.5,waste:0.5}],outputs:[{routeId:'cut',quantity:10}]};
const pending = run(initial,'1',draft);
assert.equal(JSON.stringify(initial),before);
assert.equal(pending.lots[0].quantity,8);
assert.equal(pendingQuantity(pending,'opening-0'),6);
assert.equal(pending.lots.some(l=>l.routeId==='cut'),false);
assert.throws(()=>run(pending,'1',{kind:'approve',id:'first',revision:1}));
assert.throws(()=>run(pending,'3',{kind:'approve',id:'first',revision:1}));
assert.throws(()=>run(pending,'1',{...draft,id:'overspent'}));
assert.throws(()=>run(initial,'1',{...draft,inputs:[{lotId:'opening-0',used:9,waste:0}]}));
const rejected = run(pending,'2',{kind:'reject',id:'first',revision:1,reason:'تعداد قطعات بررسی شود'});
assert.equal(rejected.lots[0].quantity,8);
assert.equal(pendingQuantity(rejected,'opening-0'),0);
const cut = run(pending,'2',{kind:'approve',id:'first',revision:1});
assert.equal(cut.lots[0].quantity,2);
assert.equal(cut.lots.find(l=>l.routeId==='cut')?.quantity,10);
assert.equal(cut.results[0].status,'confirmed');
assert.throws(()=>run(cut,'2',{kind:'approve',id:'first',revision:1}));
assert.throws(()=>run(cut,'1',{...draft,revision:2}));
const cutLot = cut.lots.find(l=>l.routeId==='cut')!.id;
const laserDraft = run(cut,'2',{kind:'save',id:'laser-result',stageId:'2',
  inputs:[{lotId:cutLot,used:10,waste:0},{lotId:'opening-1',used:2,waste:0.5}],
  outputs:[{routeId:'laser',quantity:15},{routeId:'cut-lining',quantity:5}]});
const oneApproval = run(laserDraft,'3',{kind:'approve',id:'laser-result',revision:1});
assert.equal(oneApproval.lots.find(l=>l.id===cutLot)?.quantity,10);
assert.equal(oneApproval.results[1].status,'draft');
assert.throws(()=>run(oneApproval,'4',{kind:'approve',id:'laser-result',revision:1}));
const laser = run(oneApproval,'4',{kind:'approve',id:'laser-result',revision:2});
assert.equal(laser.lots.find(l=>l.id===cutLot)?.quantity,0);
assert.equal(laser.lots.find(l=>l.routeId==='laser')?.quantity,15);
assert.equal(laser.lots.find(l=>l.routeId==='cut-lining')?.quantity,5);
const skivedDraft = run(laser,'3',{kind:'save',id:'skived-result',stageId:'3',
  inputs:[{lotId:'laser-result/0',used:15,waste:0}],outputs:[{routeId:'skived',quantity:15}]});
const skived = run(skivedDraft,'4',{kind:'approve',id:'skived-result',revision:1});
const pack:ResultCommand = {kind:'save',id:'pack-result',stageId:'4',
  inputs:[{lotId:'skived-result/0',used:15,waste:0},{lotId:'laser-result/1',used:5,waste:0},{lotId:'opening-2',used:5,waste:0}],
  outputs:[{routeId:'pack',quantity:5}]};
assert.throws(()=>run(skived,'4',{...pack,inputs:[pack.inputs[0]]}));
assert.throws(()=>run(skived,'4',{...pack,inputs:[{...pack.inputs[0],used:14.5},...pack.inputs.slice(1)]}));
const packDraft = run(skived,'4',pack);
const packed = run(packDraft,'finished-shelf',{kind:'approve',id:'pack-result',revision:1});
assert.equal(packed.lots.find(l=>l.routeId==='pack')?.quantity,5);
assert.equal(packed.lots.find(l=>l.id==='opening-0')?.quantity,2);
assert.equal(packed.results.length,4);
const changed = {...pending,lots:pending.lots.map(l=>({...l,quantity:l.id==='opening-0'?1:l.quantity}))};
const unchanged = JSON.stringify(changed);
assert.throws(()=>run(changed,'2',{kind:'approve',id:'first',revision:1}));
assert.equal(JSON.stringify(changed),unchanged);
console.log('PASS staged result approval, separate units, split receivers, remainder, waste, complete packs, stale/repeated requests and atomic failure.');
