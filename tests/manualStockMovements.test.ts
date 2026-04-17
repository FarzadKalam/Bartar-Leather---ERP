import * as assert from 'node:assert/strict';
import {
  buildInventoryDeltasFromMovement,
  buildStockTransferPayloadFromMovement,
  normalizeManualStockMovement,
} from '../utils/manualStockMovements';

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
    production_order_id: null,
    from_shelf_id: null,
    to_shelf_id: 's1',
    sender_id: 'u1',
    receiver_id: 'u1',
    bundle_id: null,
  });
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