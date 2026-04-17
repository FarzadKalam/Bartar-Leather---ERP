export const ALLOWED_MANUAL_STOCK_SOURCES = new Set(['opening_balance', 'inventory_count', 'waste']);

export interface ManualStockMovement {
  productId: string;
  transferType: string;
  voucherType: string;
  qtyMain: number;
  qtySub: number;
  fromShelfId: string | null;
  toShelfId: string | null;
  mainUnit?: string | null;
  bundleId?: string | null;
}

const toTrimmedString = (value: unknown) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const toNullableString = (value: unknown) => {
  const normalized = toTrimmedString(value);
  return normalized || null;
};

const toPositiveNumber = (value: unknown) => Math.abs(parseFloat(String(value ?? '')) || 0);

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

  if (transferType === 'waste') {
    voucherType = 'outgoing';
  }

  const qtyMain = toPositiveNumber(input.qtyMain);
  if (qtyMain <= 0) {
    throw new Error('مقدار واحد اصلی باید بیشتر از صفر باشد.');
  }

  const qtySub = toPositiveNumber(input.qtySub);
  const fromShelfId = toNullableString(input.fromShelfId);
  const toShelfId = toNullableString(input.toShelfId);

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
    mainUnit: toNullableString(input.mainUnit),
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
    productionOrderId?: string | null;
  }
) => ({
  product_id: movement.productId,
  transfer_type: movement.transferType,
  delivered_qty: movement.qtyMain,
  required_qty: movement.qtySub,
  invoice_id: options?.invoiceId || null,
  production_order_id: options?.productionOrderId || null,
  from_shelf_id: movement.fromShelfId,
  to_shelf_id: movement.toShelfId,
  sender_id: options?.userId || null,
  receiver_id: options?.userId || null,
  bundle_id: movement.bundleId ?? null,
});
