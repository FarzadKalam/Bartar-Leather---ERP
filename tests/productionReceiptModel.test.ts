import * as assert from 'node:assert/strict';
import { receiptTotals, validateReceiptAmounts, type ReceiptLine } from '../utils/productionReceiptModel';
import { calculateMaterialRow, materialRowsForPersistence } from '../utils/materialRowCalculations';
import { bomRouteGroups, connectBomGroup, refreshBomRoutes } from '../utils/bomGroupRoutes';
const lines: ReceiptLine[] = [
  { id:'leather',product_name:'چرم',unit:'فوت مربع',sent:8,received:6 },
  { id:'lock',product_name:'قفل',unit:'عدد',sent:5,received:0 },
  { id:'thread',product_name:'نخ',unit:'متر طول',sent:50,received:20 },
];
assert.deepEqual(receiptTotals(lines,{leather:2,lock:5,thread:30}).map(r=>[r.unit,r.pending,r.accepting]),[
  ['فوت مربع',2,2],['عدد',5,5],['متر طول',30,30],
]);
assert.equal(validateReceiptAmounts(lines,{leather:2,lock:5,thread:30}),null);
const invalidAmounts: Record<string,number>[] = [{leather:3},{lock:1.5},{thread:-1},{thread:Infinity},{unknown:1},{}];
for(const proposed of invalidAmounts) assert.ok(validateReceiptAmounts(lines,proposed));
assert.equal(receiptTotals(lines,{thread:0}).find(r=>r.unit==='متر طول')?.accepting,0);
console.log('PASS independent receipt quantities, separate units, live totals, zero, fractional-piece and over-receipt guards.');
const material = {key:'lock-group',header:{category:'fitting',selected_product_id:'lock'},pieces:[{key:'lock-piece',name:'قفل',quantity:1,main_unit:'عدد',waste_rate:0}]};
const group = bomRouteGroups([material])[0];
const routes = connectBomGroup([],group,'packing',{[group.pieces[0].key]:{from:'packing',to:'finished-shelf'}});
const saved = JSON.parse(JSON.stringify(materialRowsForPersistence([calculateMaterialRow(material,5)],'production_orders')));
assert.equal(saved[0].totals.total_usage,5);
assert.deepEqual(refreshBomRoutes(routes,bomRouteGroups(saved)).map(r=>r.to),routes.map(r=>r.to));
assert.equal(refreshBomRoutes(routes,bomRouteGroups(saved)).length,routes.length);
console.log('PASS BOM destination survives material recalculation, persistence and reload.');
