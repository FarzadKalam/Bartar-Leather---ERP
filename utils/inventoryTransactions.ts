import type { SupabaseClient } from '@supabase/supabase-js';
import { convertArea, type UnitValue } from './unitConversions';
import { toPersianNumber } from './persianNumberFormatter';
import { getAllowNegativeInventory } from './companySettings';

export interface InventoryDelta {
  productId: string;
  shelfId: string;
  bundleId?: string | null;   // ← اضافه شد
  delta: number;
  unit?: string | null;
}

type ProductUnitMeta = {
  mainUnit: string | null;
  name: string | null;
};

type ProductCatalogMeta = {
  main_unit: string | null;
  sub_unit: string | null;
  catalog_role: string | null;
  parent_product_id: string | null;
};

export type UnitMismatchConfirmPayload = {
  productId: string;
  productName: string;
  sourceUnit: string;
  productMainUnit: string;
  sourceQty: number;
  convertedQty: number;
};

export type UnitMismatchConfirmHandler = (payload: UnitMismatchConfirmPayload) => Promise<boolean>;

type NormalizeQuantityOptions = {
  productMetaCache?: Map<string, ProductUnitMeta>;
  decisionCache?: Map<string, boolean>;
  confirmUnitMismatch?: UnitMismatchConfirmHandler | false;
};

export type ApplyInventoryDeltasOptions = {
  confirmUnitMismatch?: UnitMismatchConfirmHandler | false;
  allowNegativeStock?: boolean;
};

const toNumber = (value: any) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const DISCRETE_UNITS = new Set<string>(['عدد', 'بسته']);

const normalizeUnit = (value: any) => String(value || '').trim();

const formatQtyWithUnit = (qty: number, unit: string) => {
  const rounded = Math.round((Math.abs(toNumber(qty)) + Number.EPSILON) * 1000) / 1000;
  const formatted = toPersianNumber(rounded.toLocaleString('en-US'));
  return `${formatted} ${unit}`.trim();
};

const defaultConfirmUnitMismatch: UnitMismatchConfirmHandler = async ({
  productName,
  sourceUnit,
  productMainUnit,
  sourceQty,
  convertedQty,
}) => {
  if (typeof window === 'undefined') return true;
  const message = [
    'عدم تطابق واحد',
    `محصول: ${productName || '-'}`,
    'واحد اصلی فرمی که ثبت کرده اید، با واحد اصلی محصول متفاوت است.',
    `مقدار ثبت شده: ${formatQtyWithUnit(sourceQty, sourceUnit)}`,
    `مقدار واقعی کسر/افزودن به موجودی: ${formatQtyWithUnit(convertedQty, productMainUnit)}`,
    'آیا ادامه می‌دهید؟',
  ].join('\n');
  return window.confirm(message);
};

const getProductMeta = async (
  supabase: SupabaseClient,
  productId: string,
  cache: Map<string, ProductUnitMeta>
) => {
  const existing = cache.get(productId);
  if (existing) return existing;
  const { data, error } = await supabase
    .from('products')
    .select('name, main_unit')
    .eq('id', productId)
    .maybeSingle();
  if (error) throw error;
  const meta: ProductUnitMeta = {
    name: data?.name ? String(data.name) : null,
    mainUnit: data?.main_unit ? String(data.main_unit) : null,
  };
  cache.set(productId, meta);
  return meta;
};

export const normalizeQuantityToProductMainUnit = async (
  supabase: SupabaseClient,
  {
    productId,
    quantity,
    unit,
  }: { productId: string; quantity: number; unit?: string | null },
  options: NormalizeQuantityOptions = {}
) => {
  const qty = toNumber(quantity);
  if (!qty) return 0;
  const sourceUnit = normalizeUnit(unit);
  if (!sourceUnit) return qty;

  const productMetaCache = options.productMetaCache || new Map<string, ProductUnitMeta>();
  const decisionCache = options.decisionCache || new Map<string, boolean>();
  const confirmHandler = options.confirmUnitMismatch === false
    ? null
    : (typeof options.confirmUnitMismatch === 'function'
      ? options.confirmUnitMismatch
      : defaultConfirmUnitMismatch);

  const productMeta = await getProductMeta(supabase, productId, productMetaCache);
  const productMainUnit = normalizeUnit(productMeta.mainUnit);
  if (!productMainUnit || productMainUnit === sourceUnit) return qty;

  if (DISCRETE_UNITS.has(sourceUnit) || DISCRETE_UNITS.has(productMainUnit)) {
    throw new Error(`تبدیل واحد "${sourceUnit}" به "${productMainUnit}" برای محصول "${productMeta.name || productId}" ممکن نیست.`);
  }

  const convertedAbs = convertArea(Math.abs(qty), sourceUnit as UnitValue, productMainUnit as UnitValue);
  const normalizedConverted = toNumber(convertedAbs);
  if (!normalizedConverted) {
    throw new Error(`تبدیل واحد "${sourceUnit}" به "${productMainUnit}" برای محصول "${productMeta.name || productId}" ممکن نیست.`);
  }

  if (confirmHandler) {
    const decisionKey = `${productId}::${sourceUnit}::${productMainUnit}`;
    if (!decisionCache.has(decisionKey)) {
      const accepted = await confirmHandler({
        productId,
        productName: productMeta.name || productId,
        sourceUnit,
        productMainUnit,
        sourceQty: Math.abs(qty),
        convertedQty: normalizedConverted,
      });
      decisionCache.set(decisionKey, accepted);
    }
    const accepted = decisionCache.get(decisionKey);
    if (!accepted) {
      throw new Error('عملیات توسط کاربر لغو شد.');
    }
  }

  return qty < 0 ? -normalizedConverted : normalizedConverted;
};

export const aggregateInventoryDeltas = (deltas: InventoryDelta[]) => {
  // key سه‌تایی: productId:shelfId:bundleId (یا __null__ برای null)
  const map = new Map<string, { delta: number; bundleId: string | null }>();
  deltas.forEach((item) => {
    if (!item?.productId || !item?.shelfId) return;
    const qty = toNumber(item.delta);
    if (!qty) return;
    const bundleKey = item.bundleId ?? '__null__';           // ← اضافه شد
    const key = `${item.productId}:${item.shelfId}:${bundleKey}`;  // ← اصلاح شد
    const existing = map.get(key);
    if (existing) {
      existing.delta += qty;
    } else {
      map.set(key, { delta: qty, bundleId: item.bundleId ?? null }); // ← اضافه شد
    }
  });
  return map;
};

export const applyInventoryDeltas = async (
  supabase: SupabaseClient,
  deltas: InventoryDelta[],
  options?: ApplyInventoryDeltasOptions
) => {
  const allowNegativeStock = typeof options?.allowNegativeStock === 'boolean'
    ? options.allowNegativeStock
    : await getAllowNegativeInventory(supabase);
  const productMetaCache = new Map<string, ProductUnitMeta>();
  const decisionCache = new Map<string, boolean>();
  const normalizedDeltas: InventoryDelta[] = [];

  for (const item of deltas || []) {
    if (!item?.productId || !item?.shelfId) continue;
    const qty = await normalizeQuantityToProductMainUnit(
      supabase,
      { productId: item.productId, quantity: item.delta, unit: item.unit },
      {
        productMetaCache,
        decisionCache,
        confirmUnitMismatch: options?.confirmUnitMismatch,
      }
    );
    if (!qty) continue;
    normalizedDeltas.push({ ...item, delta: qty });
  }

  const aggregated = aggregateInventoryDeltas(normalizedDeltas);

  // ← کل این حلقه اصلاح شد تا bundleId را هم بخواند
  for (const [key, { delta, bundleId }] of aggregated.entries()) {
    const parts = key.split(':');
    const productId = parts[0];
    const shelfId = parts[1];
    // parts[2] = bundleKey (مستقیم از bundleId استفاده می‌کنیم)
    if (!productId || !shelfId) continue;

    // ساخت query با در نظر گرفتن bundle_id
    let selectQuery = supabase
      .from('product_inventory')
      .select('id, stock, warehouse_id')
      .eq('product_id', productId)
      .eq('shelf_id', shelfId);

    if (bundleId) {
      selectQuery = selectQuery.eq('bundle_id', bundleId);
    } else {
      selectQuery = selectQuery.is('bundle_id', null);
    }

    const { data: existing, error: existingError } = await selectQuery.maybeSingle();
    if (existingError) throw existingError;

    const currentStock = toNumber(existing?.stock);
    const nextStock = currentStock + delta;
    if (!allowNegativeStock && nextStock < 0) {
      throw new Error('موجودی قفسه کافی نیست');
    }

    const payload: any = {
      product_id: productId,
      shelf_id: shelfId,
      bundle_id: bundleId,   // ← اضافه شد
      stock: nextStock,
    };
    if (existing?.warehouse_id !== undefined) {
      payload.warehouse_id = existing.warehouse_id;
    }

    const { error: upsertError } = await supabase
      .from('product_inventory')
      .upsert(payload, {
        onConflict: 'product_id,shelf_id,bundle_id',  // ← اصلاح شد
      });

    if (upsertError) throw upsertError;
  }
};

export const syncSingleProductStock = async (supabase: SupabaseClient, productId: string) => {
  const { data: productRow, error: productError } = await supabase
    .from('products')
    .select('main_unit, sub_unit, catalog_role, parent_product_id')
    .eq('id', productId)
    .maybeSingle();
  if (productError) throw productError;

  const catalogMeta: ProductCatalogMeta = {
    main_unit: productRow?.main_unit ? String(productRow.main_unit) : null,
    sub_unit: productRow?.sub_unit ? String(productRow.sub_unit) : null,
    catalog_role: productRow?.catalog_role ? String(productRow.catalog_role) : null,
    parent_product_id: productRow?.parent_product_id ? String(productRow.parent_product_id) : null,
  };

  let totalStock = 0;
  if (catalogMeta.catalog_role === 'parent') {
    const { data: variantRows, error: variantError } = await supabase
      .from('products')
      .select('stock')
      .eq('catalog_role', 'variant')
      .eq('parent_product_id', productId);
    if (variantError) throw variantError;
    totalStock = (variantRows || []).reduce((sum: number, row: any) => sum + toNumber(row?.stock), 0);
  } else {
    const { data: rows, error } = await supabase
      .from('product_inventory')
      .select('stock')
      .eq('product_id', productId);
    if (error) throw error;
    totalStock = (rows || []).reduce((sum: number, row: any) => sum + toNumber(row?.stock), 0);
  }

  const mainUnit = catalogMeta.main_unit as UnitValue | undefined;
  const subUnit = catalogMeta.sub_unit as UnitValue | undefined;
  const subStock = mainUnit && subUnit ? convertArea(totalStock, mainUnit, subUnit) : 0;

  const { error: updateError } = await supabase
    .from('products')
    .update({ stock: totalStock, sub_stock: subStock })
    .eq('id', productId);
  if (updateError) throw updateError;

  if (catalogMeta.parent_product_id) {
    await syncSingleProductStock(supabase, catalogMeta.parent_product_id);
  }
};

export const syncMultipleProductsStock = async (supabase: SupabaseClient, productIds: string[]) => {
  const unique = Array.from(new Set((productIds || []).filter(Boolean)));
  for (const productId of unique) {
    await syncSingleProductStock(supabase, productId);
  }
};
