import type { SupabaseClient } from '@supabase/supabase-js';
import { applyInventoryDeltas, syncMultipleProductsStock } from './inventoryTransactions';
import { convertArea, HARD_CODED_UNIT_OPTIONS, type UnitValue } from './unitConversions';

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

    transfers.push({
      transfer_type: 'opening_balance',
      product_id: normalizedProductId,
      bundle_id: row.bundleId ?? null,
      delivered_qty: row.qtyMain,
      required_qty: Math.abs(resolvedSubQty || 0),
      invoice_id: null,
      production_order_id: null,
      from_shelf_id: null,
      to_shelf_id: row.shelfId,
      sender_id: userId || null,
      receiver_id: userId || null,
    });
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
