import * as assert from 'node:assert/strict';
import {
  buildInventoryDeltasFromMovement,
  buildStockTransferPayloadFromMovement,
  normalizeManualStockMovement,
} from '../utils/manualStockMovements';
import { calculateUnitQuantity, getUnitQuantityConversion, toUnitQuantityNumber } from '../utils/unitQuantityConversion';

const tests: Array<{ name: string; fn: () => void }> = [];
const runTest = (name: string, fn: () => void) => {
  tests.push({ name, fn });
};

runTest('waste is normalized to outgoing and produces a negative delta', () => {
  const movement = normalizeManualStockMovement({
    productId: 'p1',
    transferType: 'waste',
    voucherType: 'incoming',
    qtyMain: 3,
    qtySub: 300,
    fromShelfId: 's1',
    toShelfId: null,
    mainUnit: 'متر',
  });

  assert.equal(movement.voucherType, 'outgoing');
  assert.deepEqual(buildInventoryDeltasFromMovement(movement), [
    { productId: 'p1', shelfId: 's1', delta: -3, unit: 'متر', bundleId: null },
  ]);
});

runTest('transfer creates one outgoing and one incoming delta for the same movement', () => {
  const movement = normalizeManualStockMovement({
    productId: 'p1',
    transferType: 'inventory_count',
    voucherType: 'transfer',
    qtyMain: 4,
    qtySub: 400,
    fromShelfId: 's1',
    toShelfId: 's2',
    mainUnit: 'متر',
    bundleId: 'b1',
  });

  assert.deepEqual(buildInventoryDeltasFromMovement(movement), [
    { productId: 'p1', shelfId: 's1', delta: -4, unit: 'متر', bundleId: 'b1' },
    { productId: 'p1', shelfId: 's2', delta: 4, unit: 'متر', bundleId: 'b1' },
  ]);
});

runTest('payload builder keeps stock_transfers structure consistent', () => {
  const movement = normalizeManualStockMovement({
    productId: 'p1',
    transferType: 'opening_balance',
    voucherType: 'incoming',
    qtyMain: 2,
    qtySub: 200,
    fromShelfId: null,
    toShelfId: 's1',
    mainUnit: 'متر',
  });

  assert.deepEqual(buildStockTransferPayloadFromMovement(movement, { userId: 'u1' }), {
    product_id: 'p1',
    transfer_type: 'opening_balance',
    delivered_qty: 2,
    required_qty: 200,
    invoice_id: null,
    purchase_invoice_id: null,
    production_order_id: null,
    from_shelf_id: null,
    to_shelf_id: 's1',
    sender_id: 'u1',
    receiver_id: 'u1',
    bundle_id: null,
  });
});

runTest('sub quantity alone is not converted implicitly to main quantity', () => {
  assert.throws(
    () => normalizeManualStockMovement({
      productId: 'p1',
      transferType: 'opening_balance',
      voucherType: 'incoming',
      qtyMain: 0,
      qtySub: 10000,
      fromShelfId: null,
      toShelfId: 's1',
      mainUnit: 'متر مربع',
      subUnit: 'سانتیمتر مربع',
    }),
    /مقدار واحد اصلی باید بیشتر از صفر باشد/,
  );
});

runTest('stock adjustment accepts zero as the new target stock and does not create a direct delta', () => {
  const movement = normalizeManualStockMovement({
    productId: 'p1',
    transferType: 'stock_adjustment',
    voucherType: 'stock_adjustment',
    qtyMain: 0,
    qtySub: 0,
    fromShelfId: null,
    toShelfId: 's1',
    mainUnit: 'عدد',
    bundleId: 'b1',
  });

  assert.equal(movement.voucherType, 'stock_adjustment');
  assert.equal(movement.qtyMain, 0);
  assert.deepEqual(buildInventoryDeltasFromMovement(movement), []);
  assert.equal(buildStockTransferPayloadFromMovement(movement).transfer_type, 'stock_adjustment');
});

runTest('invalid same-shelf transfer is rejected', () => {
  assert.throws(
    () => normalizeManualStockMovement({
      productId: 'p1',
      transferType: 'inventory_count',
      voucherType: 'transfer',
      qtyMain: 1,
      qtySub: 100,
      fromShelfId: 's1',
      toShelfId: 's1',
    }),
    /قفسه برداشت و قفسه ورود نباید یکسان باشند/,
  );
});

runTest('unit conversion resolves invoice sub quantity against quantity in table context', () => {
  const conversion = getUnitQuantityConversion('quantity', {
    availableKeys: ['product_id', 'quantity', 'main_unit', 'sub_unit', 'sub_quantity'],
  });

  assert.equal(conversion?.targetQtyKey, 'sub_quantity');
  assert.equal(calculateUnitQuantity({
    quantity: 2,
    main_unit: 'متر مربع',
    sub_unit: 'سانتیمتر مربع',
  }, conversion!), 20000);
});

runTest('unit conversion resolves movement sub quantity against main_quantity in table context', () => {
  const conversion = getUnitQuantityConversion('sub_quantity', {
    availableKeys: ['main_quantity', 'main_unit', 'sub_unit', 'sub_quantity'],
  });

  assert.equal(conversion?.targetQtyKey, 'main_quantity');
  assert.equal(calculateUnitQuantity({
    sub_quantity: 200,
    main_unit: 'فوت',
    sub_unit: 'سانتیمتر مربع',
  }, conversion!), 0.215);
});

runTest('unit conversion handles square millimeter and square foot both ways', () => {
  const mainToSub = getUnitQuantityConversion('quantity', {
    availableKeys: ['quantity', 'main_unit', 'sub_unit', 'sub_quantity'],
  });
  const subToMain = getUnitQuantityConversion('sub_quantity', {
    availableKeys: ['quantity', 'main_unit', 'sub_unit', 'sub_quantity'],
  });

  assert.equal(calculateUnitQuantity({
    quantity: 200,
    main_unit: 'میلیمتر مربع',
    sub_unit: 'فوت مربع',
    sub_quantity: 99,
  }, mainToSub!), 0.002);
  assert.equal(calculateUnitQuantity({
    quantity: 99,
    main_unit: 'میلیمتر مربع',
    sub_unit: 'فوت مربع',
    sub_quantity: 200,
  }, subToMain!), 18580608);
});

runTest('unit conversion resolves area to length with material width in millimeters', () => {
  const conversion = getUnitQuantityConversion('quantity', {
    availableKeys: ['quantity', 'main_unit', 'sub_unit', 'sub_quantity', 'category', 'lining_width'],
  });

  assert.equal(calculateUnitQuantity({
    quantity: 20000,
    main_unit: 'میلیمتر مربع',
    sub_unit: 'میلیمتر طول',
    category: 'lining',
    lining_width: 100,
  }, conversion!), 200);
});

runTest('unit conversion rejects cross-dimension conversion when material width is empty', () => {
  const conversion = getUnitQuantityConversion('quantity', {
    availableKeys: ['quantity', 'main_unit', 'sub_unit', 'sub_quantity'],
  });

  assert.throws(
    () => calculateUnitQuantity({
      quantity: 2,
      main_unit: 'متر مربع',
      sub_unit: 'متر طول',
    }, conversion!),
    /عرض اختصاصی ماده اولیه/,
  );
});

runTest('unit price conversion uses the inverse quantity factor in both directions', () => {
  const mainToSub = getUnitQuantityConversion('main_unit_price', {
    availableKeys: ['main_unit_price', 'sub_unit_price'],
  });
  const subToMain = getUnitQuantityConversion('sub_unit_price', {
    availableKeys: ['main_unit_price', 'sub_unit_price'],
  });

  assert.equal(calculateUnitQuantity({
    main_unit_price: 100000,
    sub_unit_price: 0,
    main_unit: 'متر طول',
    sub_unit: 'سانتیمتر طول',
  }, mainToSub!), 1000);
  assert.equal(calculateUnitQuantity({
    main_unit_price: 0,
    sub_unit_price: 1000,
    main_unit: 'متر طول',
    sub_unit: 'سانتیمتر طول',
  }, subToMain!), 100000);
});

runTest('unit price conversion resolves a dynamic accessory width from the parent context', () => {
  const conversion = getUnitQuantityConversion('main_unit_price', {
    availableKeys: ['main_unit_price', 'sub_unit_price'],
  });

  assert.equal(calculateUnitQuantity({
    main_unit_price: 1000000,
    main_unit: 'متر مربع',
    sub_unit: 'متر طول',
    category: 'accessory',
    accessory_width: '1400',
  }, conversion!), 1400000);
});

runTest('price parsing preserves values between zero and one with Persian decimal digits', () => {
  assert.equal(toUnitQuantityNumber('۰٫۲۵'), 0.25);
});

runTest('unit calculator is not exposed when the paired field is absent', () => {
  assert.equal(getUnitQuantityConversion('buy_price', {
    availableKeys: ['buy_price', 'main_unit', 'sub_unit'],
  }), null);
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${tests.length} test(s) passed.`);
