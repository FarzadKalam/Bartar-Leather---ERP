import * as assert from 'node:assert/strict';
import { applyInventoryDeltas, syncMultipleProductsStock } from '../utils/inventoryTransactions';
import { applyInvoiceFinalizationInventory, syncInvoiceInventoryOnSave } from '../utils/invoiceInventoryWorkflow';
import {
  partitionRemovedInventoryRows,
  persistProductOpeningInventory,
  reconcileMissingOpeningBalanceTransfers,
  recordInventoryRowDeletionTransfers,
  syncOpeningBalanceTransfersForInventoryRows,
} from '../utils/productOpeningInventory';

type Row = Record<string, any>;
type Filter = { type: 'eq' | 'is' | 'in'; column: string; value: any };

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
    private readonly mode: 'select' | 'insert' | 'upsert' | 'update' | 'delete',
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

  in(column: string, value: any[]) {
    this.filters.push({ type: 'in', column, value });
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
    if (this.mode === 'delete') {
      const deleted = this.db.deleteRows(this.table, this.filters);
      return resolve({ data: deleted, error: null });
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

  delete() {
    return new MockQuery(this.db, this.table, 'delete').withFilters(this.filters);
  }

  private withFilters(filters: Filter[]) {
    this.filters = [...filters];
    return this;
  }

  private executeSelect() {
    let rows = this.db.getTable(this.table).filter((row) => this.filters.every((filter) => {
      if (filter.type === 'eq') return row?.[filter.column] === filter.value;
      if (filter.type === 'in') return (filter.value || []).includes(row?.[filter.column]);
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
        if (filter.type === 'in') return (filter.value || []).includes(row?.[filter.column]);
        return (row?.[filter.column] ?? null) === filter.value;
      });
      if (!matches) return;
      target[index] = { ...row, ...payload };
      updated.push({ ...target[index] });
    });
    return updated;
  }

  deleteRows(table: string, filters: Filter[]) {
    const target = this.getTable(table);
    const deleted: Row[] = [];
    for (let index = target.length - 1; index >= 0; index -= 1) {
      const row = target[index];
      const matches = filters.every((filter) => {
        if (filter.type === 'eq') return row?.[filter.column] === filter.value;
        if (filter.type === 'in') return (filter.value || []).includes(row?.[filter.column]);
        return (row?.[filter.column] ?? null) === filter.value;
      });
      if (!matches) continue;
      deleted.push({ ...row });
      target.splice(index, 1);
    }
    return deleted.reverse();
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

runTest('opening inventory keeps bundle id on inventory, bundle items, and transfer log', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'عدد', sub_unit: 'عدد', stock: 0, sub_stock: 0 }],
    product_inventory: [],
    stock_transfers: [],
    bundle_items: [],
  });

  await persistProductOpeningInventory({
    supabase: supabase as any,
    productId: 'p1',
    productMainUnit: 'عدد',
    productSubUnit: 'عدد',
    rows: [{ shelf_id: 's1', bundle_id: 'bundle-1', stock: 2 }],
    userId: 'u1',
  });

  assert.equal(supabase.getTable('product_inventory')[0].bundle_id, 'bundle-1');
  assert.equal(supabase.getTable('bundle_items')[0].bundle_id, 'bundle-1');
  assert.equal(supabase.getTable('bundle_items')[0].product_id, 'p1');
  assert.equal(supabase.getTable('bundle_items')[0].quantity, 2);
  assert.equal(supabase.getTable('stock_transfers')[0].bundle_id, 'bundle-1');
});

runTest('opening inventory does not convert sub-unit quantity when main quantity is empty', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر مربع', sub_unit: 'سانتیمتر مربع', stock: 0, sub_stock: 0 }],
    product_inventory: [],
    stock_transfers: [],
    bundle_items: [],
  });

  await persistProductOpeningInventory({
    supabase: supabase as any,
    productId: 'p1',
    productMainUnit: 'متر مربع',
    productSubUnit: 'سانتیمتر مربع',
    rows: [{ shelf_id: 's1', stock: 0, sub_stock: 10000 }],
    userId: 'u1',
  });

  assert.equal(supabase.getTable('product_inventory').length, 0);
  assert.equal(supabase.getTable('stock_transfers').length, 0);
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

runTest('purchase invoice finalization increases stock and logs incoming transfer from the UI shelf field', async () => {
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
    invoiceItems: [{ product_id: 'p1', source_shelf_id: 's1', quantity: 3, main_unit: 'متر' }],
    userId: 'u1',
  });

  assert.equal(result.applied, true);
  assert.equal(supabase.getTable('product_inventory')[0].stock, 3);
  assert.equal(supabase.getTable('stock_transfers')[0].transfer_type, 'purchase_invoice');
  assert.equal(supabase.getTable('stock_transfers')[0].to_shelf_id, 's1');
  assert.equal(supabase.getTable('stock_transfers')[0].purchase_invoice_id, 'inv-purchase-1');
  assert.equal(supabase.getTable('stock_transfers')[0].invoice_id ?? null, null);
  assert.equal(supabase.getTable('products')[0].stock, 3);
});

runTest('purchase invoice finalization keeps bundle inventory separate from normal shelf stock', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 5, sub_stock: 500 }],
    product_inventory: [{ id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 5, warehouse_id: 'w1' }],
    stock_transfers: [],
  });

  const result = await applyInvoiceFinalizationInventory({
    supabase: supabase as any,
    moduleId: 'purchase_invoices',
    recordId: 'inv-purchase-bundle-1',
    previousStatus: 'created',
    nextStatus: 'completed',
    invoiceItems: [{ product_id: 'p1', source_shelf_id: 's1', bundle_id: 'b1', quantity: 2, main_unit: 'متر' }],
    userId: 'u1',
  });

  const inventoryRows = supabase.getTable('product_inventory');
  const normalRow = inventoryRows.find((row) => row.bundle_id === null);
  const bundleRow = inventoryRows.find((row) => row.bundle_id === 'b1');

  assert.equal(result.applied, true);
  assert.equal(normalRow?.stock, 5);
  assert.equal(bundleRow?.stock, 2);
  assert.equal(supabase.getTable('stock_transfers')[0].bundle_id, 'b1');
  assert.equal(supabase.getTable('products')[0].stock, 7);
});

runTest('invoice finalization derives main quantity from sub-unit quantity when units are convertible', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر مربع', sub_unit: 'سانتیمتر مربع', stock: 0, sub_stock: 0 }],
    product_inventory: [],
    stock_transfers: [],
  });

  const result = await applyInvoiceFinalizationInventory({
    supabase: supabase as any,
    moduleId: 'purchase_invoices',
    recordId: 'inv-purchase-sub-1',
    previousStatus: 'draft',
    nextStatus: 'final',
    invoiceItems: [{ product_id: 'p1', shelf_id: 's1', quantity: 0, sub_quantity: 10000, main_unit: 'متر مربع', sub_unit: 'سانتیمتر مربع' }],
    userId: 'u1',
  });

  assert.equal(result.applied, true);
  assert.equal(supabase.getTable('product_inventory').length, 1);
  assert.equal(supabase.getTable('product_inventory')[0].stock, 1);
  assert.equal(supabase.getTable('stock_transfers')[0].delivered_qty, 1);
  assert.equal(supabase.getTable('stock_transfers')[0].required_qty, 10000);
});

runTest('invoice finalization derives length quantity from area using stored raw-material width', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Lining', category: 'lining', lining_width: '1000', main_unit: 'متر طول', sub_unit: 'میلیمتر مربع', stock: 0, sub_stock: 0 }],
    product_inventory: [],
    stock_transfers: [],
  });

  const result = await applyInvoiceFinalizationInventory({
    supabase: supabase as any,
    moduleId: 'purchase_invoices',
    recordId: 'inv-purchase-cross-1',
    previousStatus: 'draft',
    nextStatus: 'final',
    invoiceItems: [{
      product_id: 'p1',
      shelf_id: 's1',
      quantity: 0,
      sub_quantity: 2000000,
      main_unit: 'متر طول',
      sub_unit: 'میلیمتر مربع',
      category: 'lining',
      lining_width: 1000,
    }],
    userId: 'u1',
  });

  assert.equal(result.applied, true);
  assert.equal(supabase.getTable('product_inventory')[0].stock, 2);
  assert.equal(supabase.getTable('stock_transfers')[0].delivered_qty, 2);
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

runTest('sales invoice finalization deducts from the selected bundle inventory only', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 8, sub_stock: 800 }],
    product_inventory: [
      { id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 5, warehouse_id: 'w1' },
      { id: 'pi2', product_id: 'p1', shelf_id: 's1', bundle_id: 'b1', stock: 3, warehouse_id: 'w1' },
    ],
    stock_transfers: [],
  });

  const result = await applyInvoiceFinalizationInventory({
    supabase: supabase as any,
    moduleId: 'invoices',
    recordId: 'inv-sale-bundle-1',
    previousStatus: 'draft',
    nextStatus: 'settled',
    invoiceItems: [{ product_id: 'p1', source_shelf_id: 's1', bundle_id: 'b1', quantity: 2, main_unit: 'متر' }],
    userId: 'u1',
  });

  const inventoryRows = supabase.getTable('product_inventory');
  const normalRow = inventoryRows.find((row) => row.bundle_id === null);
  const bundleRow = inventoryRows.find((row) => row.bundle_id === 'b1');

  assert.equal(result.applied, true);
  assert.equal(normalRow?.stock, 5);
  assert.equal(bundleRow?.stock, 1);
  assert.equal(supabase.getTable('stock_transfers')[0].bundle_id, 'b1');
  assert.equal(supabase.getTable('products')[0].stock, 6);
});

runTest('sales invoice without bundle selection consumes available stock across the selected shelf', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 5, sub_stock: 500 }],
    product_inventory: [
      { id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 1, warehouse_id: 'w1' },
      { id: 'pi2', product_id: 'p1', shelf_id: 's1', bundle_id: 'b1', stock: 4, warehouse_id: 'w1' },
    ],
    stock_transfers: [],
  });

  const result = await applyInvoiceFinalizationInventory({
    supabase: supabase as any,
    moduleId: 'invoices',
    recordId: 'inv-sale-mixed-shelf-1',
    previousStatus: 'created',
    nextStatus: 'final',
    invoiceItems: [{ product_id: 'p1', source_shelf_id: 's1', quantity: 3, sub_quantity: 300, main_unit: 'متر', sub_unit: 'سانتی‌متر' }],
    userId: 'u1',
  });

  const inventoryRows = supabase.getTable('product_inventory');
  const normalRow = inventoryRows.find((row) => row.bundle_id === null);
  const bundleRow = inventoryRows.find((row) => row.bundle_id === 'b1');
  const transfers = supabase.getTable('stock_transfers');

  assert.equal(result.applied, true);
  assert.equal(normalRow, undefined);
  assert.equal(bundleRow?.stock, 2);
  assert.equal(transfers.length, 2);
  assert.equal(transfers[0].bundle_id, null);
  assert.equal(transfers[0].delivered_qty, 1);
  assert.equal(transfers[0].required_qty, 100);
  assert.equal(transfers[1].bundle_id, 'b1');
  assert.equal(transfers[1].delivered_qty, 2);
  assert.equal(transfers[1].required_qty, 200);
  assert.equal(supabase.getTable('products')[0].stock, 2);
});

runTest('cancelled sales invoice restores split bundle and non-bundle deductions to the same shelf', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 2, sub_stock: 200 }],
    product_inventory: [
      { id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 0, warehouse_id: 'w1' },
      { id: 'pi2', product_id: 'p1', shelf_id: 's1', bundle_id: 'b1', stock: 2, warehouse_id: 'w1' },
    ],
    stock_transfers: [
      { id: 'st1', invoice_id: 'inv-sale-mixed-cancel-1', transfer_type: 'sales_invoice', product_id: 'p1', from_shelf_id: 's1', to_shelf_id: null, delivered_qty: 1, required_qty: 100, bundle_id: null },
      { id: 'st2', invoice_id: 'inv-sale-mixed-cancel-1', transfer_type: 'sales_invoice', product_id: 'p1', from_shelf_id: 's1', to_shelf_id: null, delivered_qty: 2, required_qty: 200, bundle_id: 'b1' },
    ],
  });

  const result = await applyInvoiceFinalizationInventory({
    supabase: supabase as any,
    moduleId: 'invoices',
    recordId: 'inv-sale-mixed-cancel-1',
    previousStatus: 'final',
    nextStatus: 'cancelled',
    invoiceItems: [],
    userId: 'u1',
  });

  const inventoryRows = supabase.getTable('product_inventory');
  const normalRow = inventoryRows.find((row) => row.bundle_id === null);
  const bundleRow = inventoryRows.find((row) => row.bundle_id === 'b1');
  const transfers = supabase.getTable('stock_transfers');

  assert.equal(result.applied, true);
  assert.equal(normalRow?.stock, 1);
  assert.equal(bundleRow?.stock, 4);
  assert.equal(transfers.length, 4);
  assert.equal(transfers[2].transfer_type, 'sales_invoice_cancel');
  assert.equal(transfers[2].to_shelf_id, 's1');
  assert.equal(transfers[2].bundle_id, null);
  assert.equal(transfers[3].transfer_type, 'sales_invoice_cancel');
  assert.equal(transfers[3].to_shelf_id, 's1');
  assert.equal(transfers[3].bundle_id, 'b1');
  assert.equal(supabase.getTable('products')[0].stock, 5);
});

runTest('sales invoice finalization also runs when invoice is saved directly as settled', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 8, sub_stock: 800 }],
    product_inventory: [{ id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 8, warehouse_id: 'w1' }],
    stock_transfers: [],
  });

  const result = await applyInvoiceFinalizationInventory({
    supabase: supabase as any,
    moduleId: 'invoices',
    recordId: 'inv-sale-settled-1',
    previousStatus: 'draft',
    nextStatus: 'settled',
    invoiceItems: [{ product_id: 'p1', source_shelf_id: 's1', quantity: 2, main_unit: 'متر' }],
    userId: 'u1',
  });

  assert.equal(result.applied, true);
  assert.equal(supabase.getTable('product_inventory')[0].stock, 6);
  assert.equal(supabase.getTable('stock_transfers')[0].transfer_type, 'sales_invoice');
});

runTest('sales invoice cancelled status restores stock to the same shelf and logs reversal transfer', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 8, sub_stock: 800 }],
    product_inventory: [{ id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 6, warehouse_id: 'w1' }],
    stock_transfers: [
      { id: 'st1', invoice_id: 'inv-sale-cancel-1', transfer_type: 'sales_invoice', product_id: 'p1', from_shelf_id: 's1', to_shelf_id: null, delivered_qty: 2, required_qty: 200, bundle_id: null },
    ],
  });

  const result = await applyInvoiceFinalizationInventory({
    supabase: supabase as any,
    moduleId: 'invoices',
    recordId: 'inv-sale-cancel-1',
    previousStatus: 'final',
    nextStatus: 'cancelled',
    invoiceItems: [],
    userId: 'u1',
  });

  assert.equal(result.applied, true);
  assert.equal(supabase.getTable('product_inventory')[0].stock, 8);
  assert.equal(supabase.getTable('stock_transfers').length, 2);
  assert.equal(supabase.getTable('stock_transfers')[1].transfer_type, 'sales_invoice_cancel');
  assert.equal(supabase.getTable('stock_transfers')[1].to_shelf_id, 's1');
  assert.equal(supabase.getTable('products')[0].stock, 8);
});

runTest('cancelled status restores active stock effect even when previous status was not final', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 8, sub_stock: 800 }],
    product_inventory: [{ id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: 'b1', stock: 6, warehouse_id: 'w1' }],
    stock_transfers: [
      { id: 'st1', invoice_id: 'inv-sale-cancel-active-1', transfer_type: 'sales_invoice', product_id: 'p1', from_shelf_id: 's1', to_shelf_id: null, delivered_qty: 2, required_qty: 200, bundle_id: 'b1' },
    ],
  });

  const result = await applyInvoiceFinalizationInventory({
    supabase: supabase as any,
    moduleId: 'invoices',
    recordId: 'inv-sale-cancel-active-1',
    previousStatus: 'created',
    nextStatus: 'cancelled',
    invoiceItems: [],
    userId: 'u1',
  });

  assert.equal(result.applied, true);
  assert.equal(supabase.getTable('product_inventory')[0].stock, 8);
  assert.equal(supabase.getTable('stock_transfers')[1].transfer_type, 'sales_invoice_cancel');
  assert.equal(supabase.getTable('stock_transfers')[1].bundle_id, 'b1');
  assert.equal(supabase.getTable('stock_transfers')[1].to_shelf_id, 's1');
  assert.equal(supabase.getTable('products')[0].stock, 8);
});

runTest('purchase invoice cancelled status removes stock from the same shelf and logs reversal transfer', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 3, sub_stock: 300 }],
    product_inventory: [{ id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 3, warehouse_id: 'w1' }],
    stock_transfers: [
      { id: 'st1', purchase_invoice_id: 'inv-purchase-cancel-1', transfer_type: 'purchase_invoice', product_id: 'p1', from_shelf_id: null, to_shelf_id: 's1', delivered_qty: 3, required_qty: 300, bundle_id: null },
    ],
  });

  const result = await applyInvoiceFinalizationInventory({
    supabase: supabase as any,
    moduleId: 'purchase_invoices',
    recordId: 'inv-purchase-cancel-1',
    previousStatus: 'completed',
    nextStatus: 'cancelled',
    invoiceItems: [],
    userId: 'u1',
  });

  assert.equal(result.applied, true);
  assert.equal(supabase.getTable('product_inventory').length, 0);
  assert.equal(supabase.getTable('stock_transfers').length, 2);
  assert.equal(supabase.getTable('stock_transfers')[1].transfer_type, 'purchase_invoice_cancel');
  assert.equal(supabase.getTable('stock_transfers')[1].from_shelf_id, 's1');
  assert.equal(supabase.getTable('products')[0].stock, 0);
});

runTest('invoice can be finalized again after being cancelled because net inventory effect is zeroed out', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 5, sub_stock: 500 }],
    product_inventory: [{ id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 5, warehouse_id: 'w1' }],
    stock_transfers: [
      { id: 'st1', invoice_id: 'inv-sale-refinal-1', transfer_type: 'sales_invoice', product_id: 'p1', from_shelf_id: 's1', to_shelf_id: null, delivered_qty: 2, required_qty: 200, bundle_id: null },
      { id: 'st2', invoice_id: 'inv-sale-refinal-1', transfer_type: 'sales_invoice_cancel', product_id: 'p1', from_shelf_id: null, to_shelf_id: 's1', delivered_qty: 2, required_qty: 200, bundle_id: null },
    ],
  });

  const result = await applyInvoiceFinalizationInventory({
    supabase: supabase as any,
    moduleId: 'invoices',
    recordId: 'inv-sale-refinal-1',
    previousStatus: 'cancelled',
    nextStatus: 'final',
    invoiceItems: [{ product_id: 'p1', source_shelf_id: 's1', quantity: 2, main_unit: 'متر' }],
    userId: 'u1',
  });

  assert.equal(result.applied, true);
  assert.equal(supabase.getTable('product_inventory')[0].stock, 3);
  assert.equal(supabase.getTable('stock_transfers').length, 3);
  assert.equal(supabase.getTable('stock_transfers')[2].transfer_type, 'sales_invoice');
});

runTest('editing a finalized sales invoice reconciles inventory to the new rows without changing status', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 6, sub_stock: 600 }],
    product_inventory: [{ id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 6, warehouse_id: 'w1' }],
    stock_transfers: [
      { id: 'st1', invoice_id: 'inv-sale-edit-1', transfer_type: 'sales_invoice', product_id: 'p1', from_shelf_id: 's1', to_shelf_id: null, delivered_qty: 2, required_qty: 200, bundle_id: null },
    ],
  });

  const result = await syncInvoiceInventoryOnSave({
    supabase: supabase as any,
    moduleId: 'invoices',
    recordId: 'inv-sale-edit-1',
    previousStatus: 'final',
    nextStatus: 'final',
    previousInvoiceItems: [{ product_id: 'p1', source_shelf_id: 's1', quantity: 2, main_unit: 'متر' }],
    nextInvoiceItems: [{ product_id: 'p1', source_shelf_id: 's1', quantity: 4, main_unit: 'متر' }],
    userId: 'u1',
  });

  assert.equal(result.applied, true);
  assert.equal(supabase.getTable('product_inventory')[0].stock, 4);
  assert.equal(supabase.getTable('products')[0].stock, 4);
  assert.equal(supabase.getTable('stock_transfers').length, 3);
  assert.equal(supabase.getTable('stock_transfers')[1].transfer_type, 'sales_invoice_cancel');
  assert.equal(supabase.getTable('stock_transfers')[2].transfer_type, 'sales_invoice');
  assert.equal(supabase.getTable('stock_transfers')[2].delivered_qty, 4);
});

runTest('editing a finalized purchase invoice re-applies stock to the updated shelves without changing status', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 3, sub_stock: 300 }],
    product_inventory: [{ id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 3, warehouse_id: 'w1' }],
    stock_transfers: [
      { id: 'st1', purchase_invoice_id: 'inv-purchase-edit-1', transfer_type: 'purchase_invoice', product_id: 'p1', from_shelf_id: null, to_shelf_id: 's1', delivered_qty: 3, required_qty: 300, bundle_id: null },
    ],
  });

  const result = await syncInvoiceInventoryOnSave({
    supabase: supabase as any,
    moduleId: 'purchase_invoices',
    recordId: 'inv-purchase-edit-1',
    previousStatus: 'completed',
    nextStatus: 'completed',
    previousInvoiceItems: [{ product_id: 'p1', source_shelf_id: 's1', quantity: 3, main_unit: 'متر' }],
    nextInvoiceItems: [
      { product_id: 'p1', source_shelf_id: 's1', quantity: 1, main_unit: 'متر' },
      { product_id: 'p1', source_shelf_id: 's2', quantity: 2, main_unit: 'متر' },
    ],
    userId: 'u1',
  });

  assert.equal(result.applied, true);
  const inventoryRows = supabase.getTable('product_inventory');
  assert.equal(inventoryRows.find((row) => row.shelf_id === 's1')?.stock, 1);
  assert.equal(inventoryRows.find((row) => row.shelf_id === 's2')?.stock, 2);
  assert.equal(supabase.getTable('products')[0].stock, 3);
  assert.equal(supabase.getTable('stock_transfers').length, 4);
  assert.equal(supabase.getTable('stock_transfers')[1].transfer_type, 'purchase_invoice_cancel');
  assert.equal(supabase.getTable('stock_transfers')[2].transfer_type, 'purchase_invoice');
  assert.equal(supabase.getTable('stock_transfers')[3].transfer_type, 'purchase_invoice');
});

runTest('multi-row invoice finalization updates multiple products and repeated shelves correctly', async () => {
  const supabase = new MockSupabase({
    products: [
      { id: 'p1', name: 'Leather A', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 10, sub_stock: 1000 },
      { id: 'p2', name: 'Leather B', main_unit: 'عدد', sub_unit: 'عدد', stock: 7, sub_stock: 7 },
    ],
    product_inventory: [
      { id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 10, warehouse_id: 'w1' },
      { id: 'pi2', product_id: 'p2', shelf_id: 's2', bundle_id: null, stock: 7, warehouse_id: 'w1' },
    ],
    stock_transfers: [],
  });

  const result = await applyInvoiceFinalizationInventory({
    supabase: supabase as any,
    moduleId: 'invoices',
    recordId: 'inv-sale-multi-1',
    previousStatus: 'created',
    nextStatus: 'final',
    invoiceItems: [
      { product_id: 'p1', source_shelf_id: 's1', quantity: 2, main_unit: 'متر' },
      { product_id: 'p1', source_shelf_id: 's1', quantity: 1, main_unit: 'متر' },
      { product_id: 'p2', source_shelf_id: 's2', sub_quantity: 3, main_unit: 'عدد', sub_unit: 'عدد' },
    ],
    userId: 'u1',
  });

  assert.equal(result.applied, true);
  assert.deepEqual((result as any).affectedProducts.sort(), ['p1', 'p2']);
  assert.equal(supabase.getTable('product_inventory').find((row) => row.product_id === 'p1')?.stock, 7);
  assert.equal(supabase.getTable('product_inventory').find((row) => row.product_id === 'p2')?.stock, 4);
  assert.equal(supabase.getTable('stock_transfers').length, 3);
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

runTest('legacy purchase transfer referenced by invoice_id is still treated as already applied', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 5, sub_stock: 500 }],
    product_inventory: [{ id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 5, warehouse_id: 'w1' }],
    stock_transfers: [{ id: 'st1', invoice_id: 'inv-purchase-1', purchase_invoice_id: null, transfer_type: 'purchase_invoice' }],
  });

  const result = await applyInvoiceFinalizationInventory({
    supabase: supabase as any,
    moduleId: 'purchase_invoices',
    recordId: 'inv-purchase-1',
    previousStatus: 'draft',
    nextStatus: 'final',
    invoiceItems: [{ product_id: 'p1', shelf_id: 's1', quantity: 2, main_unit: 'متر' }],
    userId: 'u1',
  });

  assert.equal(result.applied, false);
  assert.equal((result as any).skipped, 'already_applied');
  assert.equal(supabase.getTable('product_inventory')[0].stock, 5);
});

runTest('reconcileMissingOpeningBalanceTransfers backfills only inventory rows without any movement history', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 4, sub_stock: 400 }],
    product_inventory: [{ id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: null, stock: 4, warehouse_id: 'w1' }],
    stock_transfers: [],
  });

  const result = await reconcileMissingOpeningBalanceTransfers(supabase as any, { userId: 'u1' });

  assert.equal(result.inserted, 1);
  assert.equal(supabase.getTable('stock_transfers').length, 1);
  assert.equal(supabase.getTable('stock_transfers')[0].transfer_type, 'opening_balance');
  assert.equal(supabase.getTable('stock_transfers')[0].to_shelf_id, 's1');

  const second = await reconcileMissingOpeningBalanceTransfers(supabase as any, { userId: 'u1' });
  assert.equal(second.inserted, 0);
  assert.equal(supabase.getTable('stock_transfers').length, 1);
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

runTest('transfer that fully depletes a shelf removes the zero-stock source row', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 2, sub_stock: 200 }],
    product_inventory: [
      { id: 'pi1', product_id: 'p1', shelf_id: 's1', bundle_id: 'b1', stock: 2, warehouse_id: 'w1' },
    ],
  });

  await applyInventoryDeltas(supabase as any, [
    { productId: 'p1', shelfId: 's1', bundleId: 'b1', delta: -2, unit: 'متر' },
    { productId: 'p1', shelfId: 's2', bundleId: 'b1', delta: 2, unit: 'متر' },
  ]);

  const rows = supabase.getTable('product_inventory');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.shelf_id, 's2');
  assert.equal(rows[0]?.bundle_id, 'b1');
  assert.equal(rows[0]?.stock, 2);
});

runTest('syncMultipleProductsStock rolls variant inventory changes up to the parent product', async () => {
  const supabase = new MockSupabase({
    products: [
      { id: 'parent-1', name: 'Leather Parent', catalog_role: 'parent', parent_product_id: null, main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 0, sub_stock: 0 },
      { id: 'variant-1', name: 'Leather Variant', catalog_role: 'variant', parent_product_id: 'parent-1', main_unit: 'متر', sub_unit: 'سانتی‌متر', stock: 2, sub_stock: 200 },
    ],
    product_inventory: [{ id: 'pi1', product_id: 'variant-1', shelf_id: 's1', bundle_id: null, stock: 2, warehouse_id: 'w1' }],
  });

  await applyInventoryDeltas(supabase as any, [
    { productId: 'variant-1', shelfId: 's1', delta: 3, unit: 'متر' },
  ]);
  await syncMultipleProductsStock(supabase as any, ['variant-1']);

  assert.equal(supabase.getTable('products').find((row) => row.id === 'variant-1')?.stock, 5);
  assert.equal(supabase.getTable('products').find((row) => row.id === 'variant-1')?.sub_stock, 500);
  assert.equal(supabase.getTable('products').find((row) => row.id === 'parent-1')?.stock, 5);
  assert.equal(supabase.getTable('products').find((row) => row.id === 'parent-1')?.sub_stock, 500);
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

runTest('inventory row deletion is logged as outgoing stock movement', async () => {
  const supabase = new MockSupabase({
    products: [{ id: 'p1', name: 'Leather', main_unit: 'متر طول', sub_unit: 'سانتیمتر طول', stock: 5, sub_stock: 500 }],
    stock_transfers: [],
  });

  await recordInventoryRowDeletionTransfers({
    supabase: supabase as any,
    removedRows: [{ product_id: 'p1', shelf_id: 's1', bundle_id: 'b1', stock: 2 }],
    userId: 'u1',
  });

  const transfer = supabase.getTable('stock_transfers')[0];
  assert.equal(transfer.transfer_type, 'inventory_row_deletion');
  assert.equal(transfer.product_id, 'p1');
  assert.equal(transfer.bundle_id, 'b1');
  assert.equal(transfer.from_shelf_id, 's1');
  assert.equal(transfer.to_shelf_id, null);
  assert.equal(transfer.delivered_qty, 2);
  assert.equal(transfer.required_qty, 200);
});

runTest('changing a row shelf keeps it out of deletion transfer candidates', () => {
  const result = partitionRemovedInventoryRows({
    previousRows: [{ id: 'pi1', product_id: 'p1', shelf_id: 's3', bundle_id: 'b1', stock: 2 }],
    nextRows: [{ id: 'pi1', product_id: 'p1', shelf_id: 's4', bundle_id: 'b1', stock: 2 }],
  });

  assert.deepEqual(result.removedRows, [
    { id: 'pi1', product_id: 'p1', shelf_id: 's3', bundle_id: 'b1', stock: 2 },
  ]);
  assert.deepEqual(result.deletedRows, []);
  assert.deepEqual(result.rekeyedRowIds, ['pi1']);
});

runTest('correcting bundle shelves works for arbitrary shelves, products, and bundles', async () => {
  const cases = [
    { productId: 'p1', bundleId: 'b1', fromShelfId: 's3', toShelfId: 's4', stock: 2 },
    { productId: 'p2', bundleId: 'b27', fromShelfId: 's11', toShelfId: 's98', stock: 7.5 },
    { productId: 'product-x', bundleId: 'bundle-x', fromShelfId: 'shelf-old', toShelfId: 'shelf-new', stock: 1 },
  ];

  for (const [index, item] of cases.entries()) {
    const supabase = new MockSupabase({
      products: [{
        id: item.productId,
        name: `Product ${index + 1}`,
        main_unit: 'متر',
        sub_unit: 'سانتی‌متر',
      }],
      stock_transfers: [{
        id: `st${index + 1}`,
        transfer_type: 'opening_balance',
        product_id: item.productId,
        bundle_id: item.bundleId,
        delivered_qty: item.stock,
        required_qty: item.stock * 100,
        from_shelf_id: null,
        to_shelf_id: item.fromShelfId,
      }],
    });
    const previousRows = [{
      id: `pi${index + 1}`,
      product_id: item.productId,
      shelf_id: item.fromShelfId,
      bundle_id: item.bundleId,
      stock: item.stock,
    }];
    const nextRows = [{
      id: `pi${index + 1}`,
      product_id: item.productId,
      shelf_id: item.toShelfId,
      bundle_id: item.bundleId,
      stock: item.stock,
    }];
    const { removedRows } = partitionRemovedInventoryRows({ previousRows, nextRows });

    await syncOpeningBalanceTransfersForInventoryRows({
      supabase: supabase as any,
      inventoryRows: nextRows,
      removedRows,
      userId: 'u1',
    });

    const transfers = supabase.getTable('stock_transfers');
    assert.equal(transfers.length, 1);
    assert.equal(transfers[0]?.transfer_type, 'opening_balance');
    assert.equal(transfers[0]?.product_id, item.productId);
    assert.equal(transfers[0]?.bundle_id, item.bundleId);
    assert.equal(transfers[0]?.to_shelf_id, item.toShelfId);
    assert.equal(transfers.some((row) => row.to_shelf_id === item.fromShelfId), false);
  }
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
