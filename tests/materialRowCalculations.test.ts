import * as assert from 'node:assert/strict';
import { calculateMaterialRow } from '../utils/materialRowCalculations';

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
