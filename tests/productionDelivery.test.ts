import * as assert from 'node:assert/strict';
import { getDeliveryMainQuantity, normalizeDraftTargetBundle, normalizeProductionDeliverySnapshot } from '../utils/productionDeliveryRows';
import { buildGroupStartMaterials, sumDeliveredRows } from '../utils/productionGroupOrders';
import { CREATE_NEW_BUNDLE_VALUE } from '../utils/productionBundles';

// Regression: the recorded measurement is 14 ft², not the area of two sample pieces.
const recorded = {
  key: 'measured-row', name: 'ch1', length: 223, width: 103, quantity: 2,
  mainQuantity: 1300642.56, deliveredQty: 1300642.56, subQuantity: 14,
  mainUnit: 'میلیمتر مربع', subUnit: 'فوت مربع',
  sourceBundleId: 'source', sourceShelfId: 'central', sourceBundleLabel: '99999',
  targetBundleId: 'target', targetBundleLabel: 'BND-2026-0565',
};
const snapshot = normalizeProductionDeliverySnapshot(recorded);
assert.equal(snapshot.mainQuantity, 1300642.56);
assert.equal(snapshot.sourceBundleId, 'source');
assert.equal(snapshot.targetBundleId, 'target');
assert.equal(snapshot.targetBundleLabel, 'BND-2026-0565');
assert.equal(snapshot.subQuantity, 14);
const legacy = normalizeProductionDeliverySnapshot({ delivered_qty: 92903.04, main_unit: 'میلیمتر مربع', sub_quantity: 1, source_bundle_id: 'source' });
assert.equal(legacy.mainQuantity, 92903.04);
assert.equal(legacy.targetBundleId, 'source');
assert.equal(getDeliveryMainQuantity({ mainQuantity: 0, deliveredQty: 100, length: 223, width: 103, quantity: 2 }), 0);
assert.equal(getDeliveryMainQuantity({ mainQuantity: '۱٬۳۰۰٬۶۴۲.۵۶' }), 1300642.56);
assert.equal(getDeliveryMainQuantity({ length: 223, width: 103, quantity: 2 }), 45938);
assert.ok(Math.abs(sumDeliveredRows([snapshot, legacy] as any) - 1393545.6) < 0.00001);
assert.equal(normalizeDraftTargetBundle({}), CREATE_NEW_BUNDLE_VALUE);
assert.equal(normalizeDraftTargetBundle({ create_new_target_bundle: true }), CREATE_NEW_BUNDLE_VALUE);
assert.equal(normalizeDraftTargetBundle({ target_bundle_id: 'existing' }), 'existing');

const params = {
  orders: [{ id: 'order', name: 'بایگان', quantity: 10 }],
  orderRowsMap: { order: [{ header: { category: 'leather', selected_product_id: 'leather' }, pieces: [
    { name: 'ch1', final_usage: 46075.814, total_usage: 460758.14, qty_sub: 0.49, main_unit: 'میلیمتر مربع', sub_unit: 'فوت مربع' },
    { name: 'ch2', final_usage: 74382.48, total_usage: 743824.8, qty_sub: 0.8, main_unit: 'میلیمتر مربع', sub_unit: 'فوت مربع' },
  ] }] },
  orderQuantityMap: { order: 15 }, categoryLabelMap: new Map([['leather', 'چرم']]), productMetaMap: new Map(),
};
const [required] = buildGroupStartMaterials(params);
assert.ok(Math.abs(required.totalUsage - 1806874.41) < 0.00001);
const requiredSub = required.pieces.reduce((sum, piece) => sum + piece.subUsage, 0);
assert.ok(Math.abs(requiredSub - required.totalUsage / 92903.04) < 0.00001);
assert.ok(1393545.6 / required.totalUsage > 0.77 && 1393545.6 / required.totalUsage < 0.78);
assert.ok(1393545.6 + 929030.4 > required.totalUsage);
const [oldRequired] = buildGroupStartMaterials({ ...params, orderQuantityMap: { order: 10 } });
assert.ok(Math.abs(oldRequired.totalUsage - 1204582.94) < 0.00001);
console.log('Production delivery regressions passed: recorded amounts, bundle routing, legacy rows, drafts, current requirements and units.');
