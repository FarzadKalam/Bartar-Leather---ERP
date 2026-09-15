import { buildStockTransferPayload } from './stockTransferHelpers';
import type { SupabaseClient } from '@supabase/supabase-js';

export const STOCK_ADJUSTMENT_TYPE = 'stock_adjustment';

export const ALLOWED_MANUAL_STOCK_SOURCES = new Set([
  'opening_balance',
  'inventory_count',
  'waste',
  STOCK_ADJUSTMENT_TYPE,
]);

export interface ManualStockMovement {
  productId: string;
  transferType: string;
  voucherType: string;
  qtyMain: number;
  qtySub: number;
  fromShelfId: string | null;
  toShelfId: string | null;
  mainUnit?: string | null;
  subUnit?: string | null;
  bundleId?: string | null;
}

export type BundleShelfLocation = {
  shelfId: string;
  stock: number;
};

const toTrimmedString = (value: unknown) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const toNullableString = (value: unknown) => {
  const normalized = toTrimmedString(value);
  return normalized || null;
};

const toPositiveNumber = (value: unknown) => Math.abs(parseFloat(String(value ?? '')) || 0);

/** قفسه‌هایی که یک بسته با موجودی مثبت در آن‌ها نگهداری می‌شود. */
export const getActiveBundleShelfLocations = async (
  supabase: SupabaseClient,
  bundleId: string | null | undefined
): Promise<BundleShelfLocation[]> => {
  const normalizedBundleId = toNullableString(bundleId);
  if (!normalizedBundleId) return [];

  const { data, error } = await supabase
    .from('product_inventory')
    .select('shelf_id, stock')
    .eq('bundle_id', normalizedBundleId)
    .gt('stock', 0);
  if (error) throw error;

  return Array.from(new Map(
    (data || [])
      .filter((row: any) => row?.shelf_id)
      .map((row: any) => [String(row.shelf_id), {
        shelfId: String(row.shelf_id),
        stock: toPositiveNumber(row.stock),
      }])
  ).values());
};

/**
 * هر بسته یک محل نگهداری فعال دارد. ورود مجددِ همان بسته فقط باید به همان
 * قفسه ثبت شود؛ برای تغییر محل، کاربر باید حواله «جابجایی» ثبت کند.
 */
export const assertIncomingBundleShelf = async (
  supabase: SupabaseClient,
  movement: Pick<ManualStockMovement, 'voucherType' | 'bundleId' | 'toShelfId'>
) => {
  if (movement.voucherType !== 'incoming' || !movement.bundleId || !movement.toShelfId) return;

  const locations = await getActiveBundleShelfLocations(supabase, movement.bundleId);
  if (locations.length === 0) return;

  const targetShelfId = String(movement.toShelfId);
  if (locations.some((location) => location.shelfId === targetShelfId)) return;

  throw new Error(
    'این بسته هم‌اکنون در قفسه دیگری موجود است. برای تغییر محل بسته، حواله «جابجایی» ثبت کنید.'
  );
};

/** اعتبارسنجی دسته‌ای برای جدول‌های ورود/خروج که چند حواله را هم‌زمان ثبت می‌کنند. */
export const assertIncomingBundleShelves = async (
  supabase: SupabaseClient,
  movements: Array<Pick<ManualStockMovement, 'voucherType' | 'bundleId' | 'toShelfId'>>
) => {
  const targetsByBundle = new Map<string, Set<string>>();
  movements.forEach((movement) => {
    if (movement.voucherType !== 'incoming' || !movement.bundleId || !movement.toShelfId) return;
    const bundleId = String(movement.bundleId);
    if (!targetsByBundle.has(bundleId)) targetsByBundle.set(bundleId, new Set());
    targetsByBundle.get(bundleId)!.add(String(movement.toShelfId));
  });

  if (Array.from(targetsByBundle.values()).some((targets) => targets.size > 1)) {
    throw new Error('یک بسته نمی‌تواند در یک ثبت هم‌زمان به چند قفسه ورود بخورد. برای تغییر محل، حواله «جابجایی» ثبت کنید.');
  }

  for (const movement of movements) {
    await assertIncomingBundleShelf(supabase, movement);
  }
};

export const normalizeManualStockMovement = (
  input: Partial<ManualStockMovement>,
  options?: {
    requireProductId?: boolean;
    allowSameShelfTransfer?: boolean;
  }
): ManualStockMovement => {
  const requireProductId = options?.requireProductId !== false;

  const productId = toTrimmedString(input.productId);
  const transferType = toTrimmedString(input.transferType);
  let voucherType = toTrimmedString(input.voucherType);

  if (requireProductId && !productId) {
    throw new Error('محصول انتخاب نشده است.');
  }
  if (!voucherType) {
    throw new Error('نوع حواله انتخاب نشده است.');
  }
  if (!transferType) {
    throw new Error('منبع حواله انتخاب نشده است.');
  }
  if (!ALLOWED_MANUAL_STOCK_SOURCES.has(transferType)) {
    throw new Error('برای ثبت دستی فقط منابع موجودی اول دوره، انبارگردانی و ضایعات مجاز است.');
  }

  if (transferType === STOCK_ADJUSTMENT_TYPE) {
    voucherType = STOCK_ADJUSTMENT_TYPE;
  }

  if (voucherType === STOCK_ADJUSTMENT_TYPE && transferType !== STOCK_ADJUSTMENT_TYPE) {
    throw new Error('برای اصلاح موجودی، منبع حواله باید اصلاح موجودی باشد.');
  }

  if (transferType === 'waste') {
    voucherType = 'outgoing';
  }

  const rawQtyMain = toPositiveNumber(input.qtyMain);
  const rawQtySub = toPositiveNumber(input.qtySub);
  const mainUnit = toNullableString(input.mainUnit);
  const subUnit = toNullableString(input.subUnit);
  const qtyMain = rawQtyMain;
  if (voucherType === STOCK_ADJUSTMENT_TYPE) {
    if (!toNullableString(input.toShelfId)) {
      throw new Error('برای اصلاح موجودی، قفسه موجودی الزامی است.');
    }
  } else if (qtyMain <= 0) {
    throw new Error('مقدار واحد اصلی باید بیشتر از صفر باشد.');
  }

  const qtySub = rawQtySub;
  const fromShelfId = toNullableString(input.fromShelfId);
  const toShelfId = toNullableString(input.toShelfId);

  if (voucherType === STOCK_ADJUSTMENT_TYPE) {
    return {
      productId,
      transferType: STOCK_ADJUSTMENT_TYPE,
      voucherType: STOCK_ADJUSTMENT_TYPE,
      qtyMain,
      qtySub,
      fromShelfId: null,
      toShelfId,
      mainUnit,
      subUnit,
      bundleId: toNullableString(input.bundleId),
    };
  }

  if (voucherType === 'incoming' && !toShelfId) {
    throw new Error('برای حواله ورود، قفسه ورود الزامی است.');
  }
  if (voucherType === 'outgoing' && !fromShelfId) {
    throw new Error('برای حواله خروج، قفسه برداشت الزامی است.');
  }
  if (voucherType === 'transfer') {
    if (!fromShelfId || !toShelfId) {
      throw new Error('برای جابجایی، قفسه برداشت و قفسه ورود الزامی است.');
    }
    if (!options?.allowSameShelfTransfer && fromShelfId === toShelfId) {
      throw new Error('قفسه برداشت و قفسه ورود نباید یکسان باشند.');
    }
  }

  return {
    productId,
    transferType,
    voucherType,
    qtyMain,
    qtySub,
    fromShelfId,
    toShelfId,
    mainUnit,
    subUnit,
    bundleId: toNullableString(input.bundleId),
  };
};

export const buildInventoryDeltasFromMovement = (movement: ManualStockMovement, multiplier = 1) => {
  const qty = toPositiveNumber(movement.qtyMain) * multiplier;
  if (!qty || !movement.productId) return [] as Array<{
    productId: string;
    shelfId: string;
    delta: number;
    unit?: string | null;
    bundleId?: string | null;
  }>;

  const base = {
    productId: movement.productId,
    unit: movement.mainUnit || null,
    bundleId: movement.bundleId ?? null,
  };

  if (movement.voucherType === STOCK_ADJUSTMENT_TYPE) {
    return [];
  }

  if (movement.voucherType === 'incoming' && movement.toShelfId) {
    return [{ ...base, shelfId: movement.toShelfId, delta: qty }];
  }
  if (movement.voucherType === 'outgoing' && movement.fromShelfId) {
    return [{ ...base, shelfId: movement.fromShelfId, delta: -qty }];
  }
  if (movement.voucherType === 'transfer' && movement.fromShelfId && movement.toShelfId) {
    return [
      { ...base, shelfId: movement.fromShelfId, delta: -qty },
      { ...base, shelfId: movement.toShelfId, delta: qty },
    ];
  }

  return [];
};

export const buildStockTransferPayloadFromMovement = (
  movement: ManualStockMovement,
  options?: {
    userId?: string | null;
    invoiceId?: string | null;
    purchaseInvoiceId?: string | null;
    productionOrderId?: string | null;
  }
) => buildStockTransferPayload({
  productId: movement.productId,
  transferType: movement.transferType,
  deliveredQty: movement.qtyMain,
  requiredQty: movement.qtySub,
  invoiceId: options?.invoiceId || null,
  purchaseInvoiceId: options?.purchaseInvoiceId || null,
  productionOrderId: options?.productionOrderId || null,
  fromShelfId: movement.fromShelfId,
  toShelfId: movement.toShelfId,
  userId: options?.userId || null,
  bundleId: movement.bundleId ?? null,
});
