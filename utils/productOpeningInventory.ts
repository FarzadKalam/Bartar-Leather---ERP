import type { SupabaseClient } from '@supabase/supabase-js';
import { applyInventoryDeltas, syncMultipleProductsStock } from './inventoryTransactions';
import { convertArea, HARD_CODED_UNIT_OPTIONS, type UnitValue } from './unitConversions';

type OpeningInventoryRow = {
  shelf_id?: unknown;
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
    const shelfId = String(row?.shelf_id || '').trim();
    const qtyMain = toNumber(row?.stock ?? row?.main_quantity ?? row?.quantity ?? 0);
    const qtySub = toNumber(row?.sub_stock ?? 0);
    return {
      shelfId,
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
  const deltas: Array<{ productId: string; shelfId: string; delta: number; unit?: string | null }> = [];
  const transfers: Array<Record<string, unknown>> = [];

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
      delta: row.qtyMain,
      unit: rowMainUnit || null,
    });

    transfers.push({
      transfer_type: 'opening_balance',
      product_id: normalizedProductId,
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

  if (transfers.length) {
    const { error } = await supabase.from('stock_transfers').insert(transfers);
    if (error) throw error;
  }
};

