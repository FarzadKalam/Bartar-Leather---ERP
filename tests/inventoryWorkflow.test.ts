import * as assert from 'node:assert/strict';
import { applyInventoryDeltas } from '../utils/inventoryTransactions';
import { applyInvoiceFinalizationInventory } from '../utils/invoiceInventoryWorkflow';
import { persistProductOpeningInventory } from '../utils/productOpeningInventory';

type Row = Record<string, any>;
type Filter = { type: 'eq' | 'is'; column: string; value: any };

const tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
const runTest = (name: string, fn: () => Promise<void> | void) => {
  tests.push({ name, fn });
};

class MockQuery {
  private filters: Filter[] = [];
  private limitValue: number | null = null;

  constructor(
    private readonly db: MockSupabase,
    private readonly table: string,
    private readonly mode: 'select' | 'insert' | 'upsert' | 'update',
    private readonly payload?: any,
  ) {}

  eq(column: string, value: any) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  is(column: string, value: any) {
    this.filters.push({ type: 'is', column, value });
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  async maybeSingle() {
    const rows = this.executeSelect();
    return { data: rows[0] ?? null, error: null };
  }

  async single() {
    if (this.mode === 'insert') {
      const inserted = this.db.insertRows(this.table, this.payload);
      return { data: inserted[0] ?? null, error: null };
    }
    if (this.mode === 'upsert') {
      const rows = this.db.upsertRows(this.table, this.payload);
      return { data: rows[0] ?? null, error: null };
    }
    const rows = this.executeSelect();
    return { data: rows[0] ?? null, error: null };
  }

  async then(resolve: (value: { data: any; error: null }) => unknown) {
    if (this.mode === 'insert') {
      const inserted = this.db.insertRows(this.table, this.payload);
      return resolve({ data: inserted, error: null });
    }
    if (this.mode === 'upsert') {
      const upserted = this.db.upsertRows(this.table, this.payload);
      return resolve({ data: upserted, error: null });
    }
    if (this.mode === 'update') {
      const updated = this.db.updateRows(this.table, this.filters, this.payload);
      return resolve({ data: updated, error: null });
    }
    return resolve({ data: this.executeSelect(), error: null });
  }

  select(_fields?: string) {
    return this;
  }

  insert(payload: any) {
    return new MockQuery(this.db, this.table, 'insert', payload);
  }

  upsert(payload: any, _options?: any) {
    return new MockQuery(this.db, this.table, 'upsert', payload);
  }

  update(payload: any) {
    return new MockQuery(this.db, this.table, 'update', payload).withFilters(this.filters);
  }

  private withFilters(filters: Filter[]) {
    this.filters = [...filters];
    return this;
  }

  private executeSelect() {
    let rows = this.db.getTable(this.table).filter((row) => this.filters.every((filter) => {
      if (filter.type === 'eq') return row?.[filter.column] === filter.value;
      return (row?.[filter.column] ?? null) === filter.value;
    }));
    if (typeof this.limitValue === 'number') {
      rows = rows.slice(0, this.limitValue);
    }
    return rows.map((row) => ({ ...row }));
  }
}

class MockSupabase {
  constructor(private readonly tables: Record<string, Row[]>) {}

  from(table: string) {
    return new MockQuery(this, table, 'select');
  }

  getTable(table: string) {
    if (!this.tables[table]) this.tables[table] = [];
    return this.tables[table];
  }

  insertRows(table: string, payload: any) {
    const rows = Array.isArray(payload) ? payload : [payload];
    const target = this.getTable(table);
    const inserted = rows.map((row) => {
      const next = { id: row.id ?? `${table}_${target.length + 1}`, ...row };
      target.push(next);
      return { ...next };
    });
    return inserted;
  }

  upsertRows(table: string, payload: any) {
    const rows = Array.isArray(payload) ? payload : [payload];
    const target = this.getTable(table);

    const keyOf = (row: any) => `${row.product_id ?? ''}::${row.shelf_id ?? ''}::${row.bundle_id ?? null}`;
    const upserted = rows.map((row) => {
      if (table === 'product_inventory') {
        const idx = target.findIndex((item) => keyOf(item) === keyOf(row));
        if (idx >= 0) {
          target[idx] = { ...target[idx], ...row };
          return { ...target[idx] };
        }
      }
      if (row.id) {
        const idx = target.findIndex((item) => item.id === row.id);
        if (idx >= 0) {
          target[idx] = { ...target[idx], ...row };
          return { ...target[idx] };
        }
      }
      const next = { id: row.id ?? `${table}_${target.length + 1}`, ...row };
      target.push(next);
      return { ...next };
    });
    return upserted;
  }

  updateRows(table: string, filters: Filter[], payload: any) {
    const target = this.getTable(table);
    const updated: Row[] = [];
    target.forEach((row, index) => {
      const matches = filters.every((filter) => {
        if (filter.type === 'eq') return row?.[filter.column] === filter.value;
        return (row?.[filter.column] ?? null) === filter.value;
      });
      if (!matches) return;
      target[index] = { ...row, ...payload };
      updated.push({ ...target[index] });
    });
    return updated;
  }
}

runTest('opening inventory updates shelf stock, product stock, and transfer log', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 0, sub_stock: 0 }],
    product_inventory: [],
    stock_transfers: [],
    bundle_items: [],
  });

  await persistProductOpeningInventory({
    supabase: supabase as any,
    productId: 'p1',
    productMainUnit: 'متر',
    productSubUnit: 'سانتی‌متر',
    rows: [{ shelf_id: 's1', stock: 5 }],
    userId: 'u1',
  });

  assert.equal(supabase.getTable('product_inventory').length, 1);
  assert.equal(supabase.getTable('product_inventory')[0].stock, 5);
  assert.equal(supabase.getTable('stock_transfers').length, 1);
  assert.equal(supabase.getTable('stock_transfers')[0].transfer_type, 'opening_balance');
  assert.equal(supabase.getTable('products')[0].stock, 5);
});

runTest('applyInventoryDeltas aggregates per product/shelf and blocks negative stock by default', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 4, sub_stock: 400 }],
    product_inventory: [{ id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 4, warehouse_id: 'w1' }],
  });

  await applyInventoryDeltas(supabase as any, [
    { productId: 'p1', shelfId: 's1', delta: 3, unit: 'متر' },
    { productId: 'p1', shelfId: 's1', delta: -1, unit: 'متر' },
  ]);

  assert.equal(supabase.getTable('product_inventory')[0].stock, 6);

  await assert.rejects(
    () => applyInventoryDeltas(supabase as any, [{ productId: 'p1', shelfId: 's1', delta: -7, unit: 'متر' }]),
    /موجودی قفسه کافی نیست/,
  );
});

runTest('purchase invoice finalization increases stock and logs incoming transfer', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 0, sub_stock: 0 }],
    product_inventory: [],
    stock_transfers: [],
  });

  const result = await applyInvoiceFinalizationInventory({
    supabase: supabase as any,
    moduleId: 'purchase_invoices',
    recordId: 'inv-purchase-1',
    previousStatus: 'draft',
    nextStatus: 'final',
    invoiceItems: [{ product_id: 'p1', shelf_id: 's1', quantity: 3, main_unit: 'متر' }],
    userId: 'u1',
  });

  assert.equal(result.applied, true);
  assert.equal(supabase.getTable('product_inventory')[0].stock, 3);
  assert.equal(supabase.getTable('stock_transfers')[0].transfer_type, 'purchase_invoice');
  assert.equal(supabase.getTable('stock_transfers')[0].to_shelf_id, 's1');
  assert.equal(supabase.getTable('products')[0].stock, 3);
});

runTest('sales invoice finalization decreases stock and logs outgoing transfer', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 8, sub_stock: 800 }],
    product_inventory: [{ id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 8, warehouse_id: 'w1' }],
    stock_transfers: [],
  });

  const result = await applyInvoiceFinalizationInventory({
    supabase: supabase as any,
    moduleId: 'invoices',
    recordId: 'inv-sale-1',
    previousStatus: 'draft',
    nextStatus: 'final',
    invoiceItems: [{ product_id: 'p1', source_shelf_id: 's1', quantity: 2, main_unit: 'متر' }],
    userId: 'u1',
  });

  assert.equal(result.applied, true);
  assert.equal(supabase.getTable('product_inventory')[0].stock, 6);
  assert.equal(supabase.getTable('stock_transfers')[0].transfer_type, 'sales_invoice');
  assert.equal(supabase.getTable('stock_transfers')[0].from_shelf_id, 's1');
  assert.equal(supabase.getTable('products')[0].stock, 6);
});

runTest('invoice finalization does not apply twice when transfer row already exists', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 5, sub_stock: 500 }],
    product_inventory: [{ id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 5, warehouse_id: 'w1' }],
    stock_transfers: [{ id: 'st1', invoice_id: 'inv-sale-1', transfer_type: 'sales_invoice' }],
  });

  const result = await applyInvoiceFinalizationInventory({
    supabase: supabase as any,
    moduleId: 'invoices',
    recordId: 'inv-sale-1',
    previousStatus: 'draft',
    nextStatus: 'final',
    invoiceItems: [{ product_id: 'p1', source_shelf_id: 's1', quantity: 2, main_unit: 'متر' }],
    userId: 'u1',
  });

  assert.equal(result.applied, false);
  assert.equal((result as any).skipped, 'already_applied');
  assert.equal(supabase.getTable('product_inventory')[0].stock, 5);
});

runTest('transfer between shelves keeps total stock stable and tracks each shelf separately', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 10, sub_stock: 1000 }],
    product_inventory: [
      { id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 10, warehouse_id: 'w1' },
    ],
  });

  await applyInventoryDeltas(supabase as any, [
    { productId: 'p1', shelfId: 's1', delta: -4, unit: 'متر' },
    { productId: 'p1', shelfId: 's2', delta: 4, unit: 'متر' },
  ]);

  const rows = supabase.getTable('product_inventory');
  assert.equal(rows.length, 2);

  const shelf1 = rows.find((row) => row.shelf_id === 's1');
  const shelf2 = rows.find((row) => row.shelf_id === 's2');

  assert.equal(shelf1?.stock, 6);
  assert.equal(shelf2?.stock, 4);
  assert.equal(rows.reduce((sum, row) => sum + (parseFloat(row.stock) || 0), 0), 10);
});

runTest('bundle inventory stays isolated from normal shelf inventory for the same product', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 8, sub_stock: 800 }],
    product_inventory: [
      { id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 5, warehouse_id: 'w1' },
      { id: 'pi2', product_id: 'p1', shelf_id: 's1', bundle_id: 'b1', stock: 3, warehouse_id: 'w1' },
    ],
  });

  await applyInventoryDeltas(supabase as any, [
    { productId: 'p1', shelfId: 's1', bundleId: 'b1', delta: -1, unit: 'متر' },
    { productId: 'p1', shelfId: 's1', bundleId: null, delta: 2, unit: 'متر' },
  ]);

  const rows = supabase.getTable('product_inventory');
  const normalRow = rows.find((row) => row.shelf_id === 's1' && (row.bundle_id ?? null) === null);
  const bundleRow = rows.find((row) => row.shelf_id === 's1' && row.bundle_id === 'b1');

  assert.equal(normalRow?.stock, 7);
  assert.equal(bundleRow?.stock, 2);
});

let failures = 0;
const execute = async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
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
};

void execute();
