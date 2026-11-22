import * as assert from 'node:assert/strict';
import { calculateMaterialRow, materialPieceForProduct, materialCategoryChange } from '../utils/materialRowCalculations';

const leather = { header: { category: 'leather' }, pieces: [
  { name: 'CH1', length: 223, width: 103, quantity: 2, main_unit: 'میلیمتر مربع', waste_rate: 0 },
  { name: 'CH2', length: 103, width: 60, quantity: 12, main_unit: 'میلیمتر مربع', waste_rate: 0 },
], totals: { total_usage: 0 } };
const snapshot = JSON.stringify(leather);
assert.equal(calculateMaterialRow(leather, 5).totals.total_usage, 600490);
assert.equal(calculateMaterialRow(leather, 5).totals.total_quantity, 14);
assert.equal(calculateMaterialRow(leather, 10).totals.total_usage, 1200980);
assert.equal(calculateMaterialRow(leather, 0).totals.total_usage, 0);
assert.equal(JSON.stringify(leather), snapshot, 'display recalculation must not mutate the BOM');
const thread = {pieces:[{quantity:12, main_unit:'متر طول', waste_rate:0, unit_price:10}]};
assert.equal(calculateMaterialRow(thread, 5).totals.total_usage, 60);
assert.equal(calculateMaterialRow(thread, 5).totals.total_cost, 600);
console.log('Material totals follow the current order quantity without changing per-product pieces.');
const bomThread={key:'thread',name:'نخ',bom_code:'y2',quantity:12,main_unit:'متر طول',length:0,width:0};
const row={header:{bom_code:'G-Y2',selected_product_id:'old'},pieces:[bomThread]};
const changedCategory=materialCategoryChange(row,'fitting');
assert.deepEqual(changedCategory.pieces,[bomThread]);
assert.equal(changedCategory.header.selected_product_id,null);
const selected=materialPieceForProduct(changedCategory.pieces[0],{main_unit:'سانتیمتر طول',sub_unit:'متر طول',waste_rate:0.1});
assert.equal(selected.quantity,1200);
assert.equal(selected.bom_code,'y2');
assert.equal(materialPieceForProduct(selected,{main_unit:'سانتیمتر طول'}).quantity,1200);
assert.equal(materialPieceForProduct(selected,{main_unit:'متر طول'}).quantity,12);
assert.ok(Math.abs(calculateMaterialRow({pieces:[selected]},7).totals.total_usage-8408.4)<1e-8);
assert.throws(()=>materialPieceForProduct(bomThread,{main_unit:'عدد'}),/سازگار/);
assert.equal(bomThread.quantity,12);
