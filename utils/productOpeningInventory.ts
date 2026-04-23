import type { SupabaseClient } from '@supabase/supabase-js';
import { applyInventoryDeltas, syncMultipleProductsStock } from './inventoryTransactions';
import { convertArea, HARD_CODED_UNIT_OPTIONS, type UnitValue } from './unitConversions';
import { buildStockTransferPayload } from './stockTransferHelpers';

type OpeningInventoryRow = {
  shelf_id?: unknown;
  bundle_id?: unknown;
  stock?: unknown;
  main_quantity?: unknown;
  quantity?: unknown;
  sub_stock?: unknown;
  main_unit?: unknown;
  sub_unit?: unknown;
};

type PersistProductOpeningInventoryParams = {
  supabase: SupabaseClient;
  productId: string;
  productMainUnit?: string | null;
  productSubUnit?: string | null;
  rows?: OpeningInventoryRow[] | null;
  userId?: string | null;
};

type InventoryBalanceRow = {
  product_id: string;
  shelf_id: string;
  bundle_id?: string | null;
  stock?: unknown;
};

const UNIT_VALUES = new Set<UnitValue>(HARD_CODED_UNIT_OPTIONS.map((item) => item.value));

const isUnitValue = (value: unknown): value is UnitValue =>
  typeof value === 'string' && UNIT_VALUES.has(value as UnitValue);

const normalizeNumericInput = (raw: unknown): string => {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u066C\u060C]/g, ',')
    .replace(/\s+/g, '')
    .replace(/,/g, '');
};

const toNumber = (raw: unknown): number => {
  const normalized = normalizeNumericInput(raw);
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return 0;
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeUnit = (value: unknown) => String(value || '').trim();

const normalizeRelationId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'object') {
    const anyValue = value as { value?: unknown; id?: unknown };
    const candidate = anyValue?.value ?? anyValue?.id;
    if (candidate !== undefined && candidate !== null) {
      const trimmed = String(candidate).trim();
      return trimmed ? trimmed : null;
    }
  }
  const fallback = String(value).trim();
  return fallback ? fallback : null;
};

export const persistProductOpeningInventory = async ({
  supabase,
  productId,
  productMainUnit,
  productSubUnit,
  rows,
  userId,
}: PersistProductOpeningInventoryParams) => {
  const normalizedProductId = String(productId || '').trim();
  if (!normalizedProductId) return;

  const sourceRows = Array.isArray(rows) ? rows : [];
  if (!sourceRows.length) return;

  const normalizedRows = sourceRows.map((row) => {
    const shelfId = normalizeRelationId(row?.shelf_id) || '';
    const bundleId = normalizeRelationId(row?.bundle_id);
    const qtyMain = toNumber(row?.stock ?? row?.main_quantity ?? row?.quantity ?? 0);
    const qtySub = toNumber(row?.sub_stock ?? 0);
    return {
      shelfId,
      bundleId,
      qtyMain,
      qtySub,
      rowMainUnit: normalizeUnit(row?.main_unit),
      rowSubUnit: normalizeUnit(row?.sub_unit),
    };
  });

  const rowsWithQty = normalizedRows.filter((row) => Math.abs(row.qtyMain) > 0);
  if (!rowsWithQty.length) return;

  const hasNegative = rowsWithQty.some((row) => row.qtyMain < 0);
  if (hasNegative) {
    throw new Error('موجودی اولیه نمی‌تواند منفی باشد.');
  }

  const missingShelf = rowsWithQty.some((row) => !row.shelfId);
  if (missingShelf) {
    throw new Error('برای ثبت موجودی اولیه، انتخاب قفسه نگهداری الزامی است.');
  }

  const mainUnit = normalizeUnit(productMainUnit);
  const subUnit = normalizeUnit(productSubUnit);
  const deltas: Array<{ productId: string; shelfId: string; bundleId?: string | null; delta: number; unit?: string | null }> = [];
  const transfers: Array<Record<string, unknown>> = [];
  const bundleItems = rowsWithQty
    .filter(row => row.bundleId) // فقط ردیف‌هایی که بسته دارند
    .map(row => ({
      bundle_id: row.bundleId,
      product_id: normalizedProductId,
      quantity: row.qtyMain,
    }));


  rowsWithQty.forEach((row) => {
    const rowMainUnit = row.rowMainUnit || mainUnit;
    const rowSubUnit = row.rowSubUnit || subUnit;
    let resolvedSubQty = row.qtySub;
    if (rowMainUnit && rowSubUnit) {
      if (rowMainUnit === rowSubUnit) {
        resolvedSubQty = row.qtyMain;
      } else if (isUnitValue(rowMainUnit) && isUnitValue(rowSubUnit)) {
        const converted = convertArea(row.qtyMain, rowMainUnit, rowSubUnit);
        if (Number.isFinite(converted) && converted > 0) {
          resolvedSubQty = converted;
        }
      }
    }

    deltas.push({
      productId: normalizedProductId,
      shelfId: row.shelfId,
      bundleId: row.bundleId ?? null, 
      delta: row.qtyMain,
      unit: rowMainUnit || null,
    });

    transfers.push(buildStockTransferPayload({
      transferType: 'opening_balance',
      productId: normalizedProductId,
      bundleId: row.bundleId ?? null,
      deliveredQty: row.qtyMain,
      requiredQty: Math.abs(resolvedSubQty || 0),
      fromShelfId: null,
      toShelfId: row.shelfId,
      userId: userId || null,
    }));
  });

  if (deltas.length) {
    await applyInventoryDeltas(supabase, deltas, { confirmUnitMismatch: false });
    await syncMultipleProductsStock(supabase, [normalizedProductId]);
  }

  if (bundleItems.length > 0) {
    const { error: bundleError } = await supabase
      .from('bundle_items')
      .upsert(bundleItems, { onConflict: 'bundle_id,product_id' });
    
    if (bundleError) {
      console.error('Error upserting bundle_items:', bundleError);
      // می‌توانید اینجا خطا بیندازید یا فقط لاگ کنید
    }
  }

  if (transfers.length) {
    const { error } = await supabase.from('stock_transfers').insert(transfers);
    if (error) throw error;
  }

};

export const reconcileMissingOpeningBalanceTransfers = async (
  supabase: SupabaseClient,
  options?: { userId?: string | null }
) => {
  const { data: inventoryRows, error: inventoryError } = await supabase
    .from('product_inventory')
    .select('product_id, shelf_id, bundle_id, stock');
  if (inventoryError) throw inventoryError;

  const positiveRows = (inventoryRows || []).filter((row: any) => (toNumber(row?.stock) > 0));
  if (!positiveRows.length) return { inserted: 0 };

  const { data: transfers, error: transfersError } = await supabase
    .from('stock_transfers')
    .select('transfer_type, product_id, bundle_id, from_shelf_id, to_shelf_id');
  if (transfersError) throw transfersError;

  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, main_unit, sub_unit');
  if (productsError) throw productsError;

  const productUnits = new Map(
    (products || []).map((row: any) => [
      String(row?.id || ''),
      {
        mainUnit: normalizeUnit(row?.main_unit),
        subUnit: normalizeUnit(row?.sub_unit),
      },
    ])
  );

  const openingKeys = new Set(
    (transfers || [])
      .filter((row: any) => String(row?.transfer_type || '').trim() === 'opening_balance')
      .map((row: any) => {
        const shelfKey = String(row?.to_shelf_id || row?.from_shelf_id || '').trim();
        return `${row?.product_id || ''}::${shelfKey}::${row?.bundle_id ?? '__null__'}`;
      })
  );

  const movementKeys = new Set(
    (transfers || []).flatMap((row: any) => {
      const productId = String(row?.product_id || '').trim();
      const bundleKey = row?.bundle_id ?? '__null__';
      const result: string[] = [];
      const fromShelf = String(row?.from_shelf_id || '').trim();
      const toShelf = String(row?.to_shelf_id || '').trim();
      if (productId && fromShelf) result.push(`${productId}::${fromShelf}::${bundleKey}`);
      if (productId && toShelf) result.push(`${productId}::${toShelf}::${bundleKey}`);
      return result;
    })
  );

  const missingTransfers = positiveRows
    .filter((row: any) => {
      const productId = String(row?.product_id || '').trim();
      const shelfId = String(row?.shelf_id || '').trim();
      const bundleKey = row?.bundle_id ?? '__null__';
      const key = `${productId}::${shelfId}::${bundleKey}`;
      return productId && shelfId && !openingKeys.has(key) && !movementKeys.has(key);
    })
    .map((row: any) => {
      const productId = String(row?.product_id || '').trim();
      const shelfId = String(row?.shelf_id || '').trim();
      const bundleId = row?.bundle_id ?? null;
      const qtyMain = toNumber(row?.stock);
      const unitMeta = productUnits.get(productId) || { mainUnit: '', subUnit: '' };
      let qtySub = qtyMain;
      if (unitMeta.mainUnit && unitMeta.subUnit && unitMeta.mainUnit !== unitMeta.subUnit) {
        if (isUnitValue(unitMeta.mainUnit) && isUnitValue(unitMeta.subUnit)) {
          const converted = convertArea(qtyMain, unitMeta.mainUnit, unitMeta.subUnit);
          qtySub = Number.isFinite(converted) ? converted : qtyMain;
        }
      }
      return buildStockTransferPayload({
        transferType: 'opening_balance',
        productId,
        bundleId,
        deliveredQty: qtyMain,
        requiredQty: Math.abs(qtySub || 0),
        fromShelfId: null,
        toShelfId: shelfId,
        userId: options?.userId || null,
      });
    });

  if (!missingTransfers.length) return { inserted: 0 };

  const { error: insertError } = await supabase
    .from('stock_transfers')
    .insert(missingTransfers);
  if (insertError) throw insertError;

  return { inserted: missingTransfers.length };
};

export const syncOpeningBalanceTransfersForInventoryRows = async ({
  supabase,
  inventoryRows,
  removedRows,
  userId,
}: {
  supabase: SupabaseClient;
  inventoryRows: InventoryBalanceRow[];
  removedRows?: InventoryBalanceRow[];
  userId?: string | null;
}) => {
  const finalRows = (inventoryRows || []).map((row) => ({
    productId: String(row?.product_id || '').trim(),
    shelfId: String(row?.shelf_id || '').trim(),
    bundleId: normalizeRelationId(row?.bundle_id),
    stock: toNumber(row?.stock),
  })).filter((row) => row.productId && row.shelfId);

  const deletedRows = (removedRows || []).map((row) => ({
    productId: String(row?.product_id || '').trim(),
    shelfId: String(row?.shelf_id || '').trim(),
    bundleId: normalizeRelationId(row?.bundle_id),
  })).filter((row) => row.productId && row.shelfId);

  const keyOf = (row: { productId: string; shelfId: string; bundleId?: string | null }) =>
    `${row.productId}::${row.shelfId}::${row.bundleId ?? '__null__'}`;

  const finalByKey = new Map(finalRows.map((row) => [keyOf(row), row]));
  const affectedKeys = new Set([
    ...finalRows.map(keyOf),
    ...deletedRows.map(keyOf),
  ]);
  if (!affectedKeys.size) return { inserted: 0, updated: 0, deleted: 0 };

  const productIds = Array.from(new Set([...finalRows, ...deletedRows].map((row) => row.productId)));
  const { data: transfers, error: transfersError } = await supabase
    .from('stock_transfers')
    .select('id, transfer_type, product_id, bundle_id, delivered_qty, required_qty, from_shelf_id, to_shelf_id');
  if (transfersError) throw transfersError;

  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, main_unit, sub_unit')
    .in('id', productIds);
  if (productsError) throw productsError;

  const productUnits = new Map(
    (products || []).map((row: any) => [
      String(row?.id || ''),
      {
        mainUnit: normalizeUnit(row?.main_unit),
        subUnit: normalizeUnit(row?.sub_unit),
      },
    ])
  );

  const relevantTransfers = (transfers || []).filter((row: any) => {
    const productId = String(row?.product_id || '').trim();
    if (!productId) return false;
    const bundleId = normalizeRelationId(row?.bundle_id);
    const fromShelfId = row?.from_shelf_id ? String(row.from_shelf_id).trim() : '';
    const toShelfId = row?.to_shelf_id ? String(row.to_shelf_id).trim() : '';
    const keys = [
      `${productId}::${fromShelfId}::${bundleId ?? '__null__'}`,
      `${productId}::${toShelfId}::${bundleId ?? '__null__'}`,
    ];
    return keys.some((key) => affectedKeys.has(key));
  });

  const toInsert: Array<Record<string, unknown>> = [];
  const toUpdate: Array<Record<string, unknown>> = [];
  const toDeleteIds: string[] = [];

  affectedKeys.forEach((key) => {
    const currentRow = finalByKey.get(key);
    const [productId, shelfId, bundleKey] = key.split('::');
    const bundleId = bundleKey === '__null__' ? null : bundleKey;
    const keyTransfers = relevantTransfers.filter((row: any) => {
      const rowProductId = String(row?.product_id || '').trim();
      const rowBundleId = normalizeRelationId(row?.bundle_id);
      const rowShelfId = String(row?.to_shelf_id || row?.from_shelf_id || '').trim();
      return rowProductId === productId && rowShelfId === shelfId && rowBundleId === bundleId;
    });
    const openingTransfers = keyTransfers.filter((row: any) => String(row?.transfer_type || '').trim() === 'opening_balance');
    const nonOpeningTransfers = keyTransfers.filter((row: any) => String(row?.transfer_type || '').trim() !== 'opening_balance');

    if (nonOpeningTransfers.length > 0) {
      return;
    }

    if (!currentRow || currentRow.stock <= 0) {
      openingTransfers.forEach((row: any) => {
        if (row?.id) toDeleteIds.push(String(row.id));
      });
      return;
    }

    const unitMeta = productUnits.get(productId) || { mainUnit: '', subUnit: '' };
    let subQty = currentRow.stock;
    if (unitMeta.mainUnit && unitMeta.subUnit && unitMeta.mainUnit !== unitMeta.subUnit) {
      if (isUnitValue(unitMeta.mainUnit) && isUnitValue(unitMeta.subUnit)) {
        const converted = convertArea(currentRow.stock, unitMeta.mainUnit, unitMeta.subUnit);
        subQty = Number.isFinite(converted) ? converted : currentRow.stock;
      }
    }

    const payload = buildStockTransferPayload({
      transferType: 'opening_balance',
      productId,
      bundleId,
      deliveredQty: currentRow.stock,
      requiredQty: Math.abs(subQty || 0),
      fromShelfId: null,
      toShelfId: shelfId,
      userId: userId || null,
    });

    if (openingTransfers[0]?.id) {
      toUpdate.push({ id: String(openingTransfers[0].id), ...payload });
      openingTransfers.slice(1).forEach((row: any) => {
        if (row?.id) toDeleteIds.push(String(row.id));
      });
    } else {
      toInsert.push(payload);
    }
  });

  if (toDeleteIds.length > 0) {
    const uniqueDeleteIds = Array.from(new Set(toDeleteIds));
    const { error } = await supabase.from('stock_transfers').delete().in('id', uniqueDeleteIds);
    if (error) throw error;
  }

  if (toUpdate.length > 0) {
    const { error } = await supabase.from('stock_transfers').upsert(toUpdate, { onConflict: 'id' });
    if (error) throw error;
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('stock_transfers').insert(toInsert);
    if (error) throw error;
  }

  return { inserted: toInsert.length, updated: toUpdate.length, deleted: toDeleteIds.length };
};
