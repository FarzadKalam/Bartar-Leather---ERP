import * as assert from 'node:assert/strict';
import {
  calculatePieceQuantity,
  getDeliveryMainQuantity,
  inferGroupDefaultDeliveryType,
  normalizeDraftTargetBundle,
  normalizeProductionDeliverySnapshot,
  resolveDeliveryType,
  resolveStageRemainderState,
} from '../utils/productionDeliveryRows';
import { convertBetweenUnits } from '../utils/unitConversions';
import { calculateUnitQuantity, getUnitQuantityConversion } from '../utils/unitQuantityConversion';
import { buildGroupStartMaterials, sumDeliveredRows } from '../utils/productionGroupOrders';
import { CREATE_NEW_BUNDLE_VALUE } from '../utils/productionBundles';
import { isProductionOrderPanelExpanded } from '../utils/productionOrderPanels';

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
for (const step of ['lines', 'progress'] as const) {
  for (const count of [1, 2, 3]) assert.equal(isProductionOrderPanelExpanded(step, 'order', count, {}), true);
  for (const count of [4, 20]) assert.equal(isProductionOrderPanelExpanded(step, 'order', count, {}), false);
  assert.equal(isProductionOrderPanelExpanded(step, 'order', 1, { [`${step}:order`]: false }), false);
  assert.equal(isProductionOrderPanelExpanded(step, 'order', 4, { [`${step}:order`]: true }), true);
}
assert.equal(isProductionOrderPanelExpanded('materials', 'order', 1, {}), false);

// Delivery type resolution & unified inventory calculation regressions:
assert.equal(resolveDeliveryType({ deliveryType: 'bulk', length: 20, width: 10 }), 'bulk');
assert.equal(resolveDeliveryType({ deliveryType: 'piece' }), 'piece');
assert.equal(resolveDeliveryType({ length: 20, width: 10, quantity: 3 }), 'piece');
assert.equal(resolveDeliveryType({ mainQuantity: 500, name: 'تحویل فله‌ای' }), 'bulk');
assert.equal(inferGroupDefaultDeliveryType([{ length: 10, width: 5 }]), 'piece');
assert.equal(inferGroupDefaultDeliveryType([{ length: 0, width: 0, quantity: 1 }]), 'bulk');

const bulkRow = {
  deliveryType: 'bulk' as const,
  name: 'قطعه الکی قدیمی',
  length: 20,
  width: 10,
  quantity: 2,
  mainQuantity: 1000,
  conversionWidthMm: 1400,
  sourceBundleId: 'src1',
};
const pieceQty = calculatePieceQuantity(20, 10, 5);
assert.equal(pieceQty, 1000);
const pieceRow = {
  deliveryType: 'piece' as const,
  name: 'پشت کیف',
  length: 20,
  width: 10,
  quantity: 5,
  mainQuantity: pieceQty,
  sourceBundleId: 'src1',
};
assert.equal(getDeliveryMainQuantity(bulkRow, 'bulk'), 1000);
assert.equal(getDeliveryMainQuantity(pieceRow, 'piece'), 1000);
assert.equal(sumDeliveredRows([bulkRow, pieceRow] as any), 2000);

const normalizedBulkSnapshot = normalizeProductionDeliverySnapshot(bulkRow);
assert.equal(normalizedBulkSnapshot.deliveryType, 'bulk');
assert.equal(normalizedBulkSnapshot.name, undefined);
assert.equal(normalizedBulkSnapshot.length, undefined);
assert.equal(normalizedBulkSnapshot.width, undefined);
assert.equal(normalizedBulkSnapshot.quantity, undefined);
assert.equal(normalizedBulkSnapshot.conversionWidthMm, 1400);
assert.equal(normalizedBulkSnapshot.mainQuantity, 1000);

// Linear <-> Area unit conversion regressions:
assert.equal(convertBetweenUnits(2, 'متر طول', 'میلیمتر مربع', { widthMm: 1400 }), 2800000);
assert.equal(convertBetweenUnits(2800000, 'میلیمتر مربع', 'متر طول', { widthMm: 1400 }), 2);

const mainToSubConv = getUnitQuantityConversion('mainQuantity', {
  availableKeys: ['mainQuantity', 'subQuantity'],
})!;
assert.equal(
  calculateUnitQuantity(
    {
      mainQuantity: 2,
      main_unit: 'متر طول',
      sub_unit: 'میلیمتر مربع',
      conversionWidthMm: 1400,
      width: 25, // piece cut width must not override material roll width
    },
    mainToSubConv
  ),
  2800000
);
assert.equal(
  calculateUnitQuantity(
    {
      mainQuantity: 2,
      main_unit: 'متر طول',
      sub_unit: 'میلیمتر مربع',
      category: 'leather',
      leather_width: '1400',
      width: 25,
    },
    mainToSubConv
  ),
  2800000
);
assert.throws(
  () =>
    calculateUnitQuantity(
      {
        mainQuantity: 2,
        main_unit: 'متر طول',
        sub_unit: 'میلیمتر مربع',
        width: 25, // piece cut width alone must prompt popover instead of silent wrong math
      },
      mainToSubConv
    ),
  /عرض اختصاصی ماده اولیه/
);

const subToMainConv = getUnitQuantityConversion('subQuantity', {
  availableKeys: ['mainQuantity', 'subQuantity'],
})!;
assert.equal(
  calculateUnitQuantity(
    {
      subQuantity: 2800000,
      main_unit: 'متر طول',
      sub_unit: 'میلیمتر مربع',
      conversionWidthMm: 1400,
    },
    subToMainConv
  ),
  2
);

// Stage remainder disposition: keep as stage inventory (default) vs record partial/full waste
const keepState = resolveStageRemainderState({
  totalSourceQty: 100,
  currentDeliveredQty: 80,
  previousDeliveredQty: 5,
  remainderMode: 'keep',
});
assert.equal(keepState.remainingAvailable, 15);
assert.equal(keepState.wasteQty, 0);
assert.equal(keepState.remainingStageStock, 15);

const partialWasteState = resolveStageRemainderState({
  totalSourceQty: 100,
  currentDeliveredQty: 80,
  previousDeliveredQty: 5,
  previousWasteQty: 3,
  remainderMode: 'waste',
  requestedWasteQty: 7,
});
assert.equal(partialWasteState.remainingAvailable, 12);
assert.equal(partialWasteState.wasteQty, 7);
assert.equal(partialWasteState.remainingStageStock, 5);

const clampedWasteState = resolveStageRemainderState({
  totalSourceQty: 50,
  currentDeliveredQty: 42,
  remainderMode: 'waste',
  requestedWasteQty: 25,
});
assert.equal(clampedWasteState.remainingAvailable, 8);
assert.equal(clampedWasteState.wasteQty, 8);
assert.equal(clampedWasteState.remainingStageStock, 0);

console.log('Production delivery regressions passed: recorded amounts, bundle routing, legacy rows, bulk/piece delivery types, bidirectional conversions, remainder/waste math, and current requirements.');
