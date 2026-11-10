import { CREATE_NEW_BUNDLE_VALUE, USE_SOURCE_BUNDLE_VALUE } from './productionBundles';

export type DeliveryType = 'bulk' | 'piece';

export const asNumber = (value: unknown): number => {
  const normalized = String(value ?? '').replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[,٬\s]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

/**
 * تعیین یا تخمین هوشمند نوع تحویل (فله‌ای یا قطعه‌ای).
 * در فرم‌های جدید بر اساس فیلد deliveryType کار می‌کند و در داده‌های تاریخی
 * بر اساس وجود مشخصات قطعه یا لیست قطعات نوع را با سازگاری کامل تشخیص می‌دهد.
 */
export const resolveDeliveryType = (rowOrGroup: any): DeliveryType => {
  const explicit = rowOrGroup?.deliveryType || rowOrGroup?.delivery_type;
  if (explicit === 'piece' || explicit === 'bulk') return explicit;
  if (Array.isArray(rowOrGroup?.deliveryRows) && rowOrGroup.deliveryRows.length > 0) {
    const hasPieceRow = rowOrGroup.deliveryRows.some((row: any) => resolveDeliveryType(row) === 'piece');
    if (hasPieceRow) return 'piece';
    return 'bulk';
  }
  const trimmedName = String(rowOrGroup?.name ?? '').trim();
  const hasDimensions = asNumber(rowOrGroup?.length) > 0 && asNumber(rowOrGroup?.width) > 0;
  const hasAnyDimension = asNumber(rowOrGroup?.length) > 0 || asNumber(rowOrGroup?.width) > 0;
  const hasRealName = trimmedName !== '' && trimmedName !== 'تحویل فله‌ای';
  if (hasDimensions) return 'piece';
  if (rowOrGroup?.pieceKey && hasAnyDimension) return 'piece';
  if (hasRealName && (hasAnyDimension || Boolean(rowOrGroup?.pieceKey))) return 'piece';
  if (Array.isArray(rowOrGroup?.pieces)) {
    const pieces = rowOrGroup.pieces;
    if (pieces.some((p: any) => asNumber(p?.length) > 0 && asNumber(p?.width) > 0)) return 'piece';
    if (pieces.length > 1) return 'piece';
  }
  return 'bulk';
};

export const inferGroupDefaultDeliveryType = (pieces: any[], savedDeliveryType?: any, deliveryRows?: any[]): DeliveryType => {
  if (savedDeliveryType === 'piece' || savedDeliveryType === 'bulk') return savedDeliveryType;
  if (Array.isArray(deliveryRows) && deliveryRows.length > 0) {
    return deliveryRows.some((r) => resolveDeliveryType(r) === 'piece') ? 'piece' : 'bulk';
  }
  if (Array.isArray(pieces)) {
    if (pieces.some((p) => asNumber(p?.length) > 0 && asNumber(p?.width) > 0)) return 'piece';
    if (pieces.length > 1) return 'piece';
  }
  return 'bulk';
};

/** محاسبه مقدار فیزیکی بر اساس ابعاد و تعداد قطعه */
export const calculatePieceQuantity = (length: unknown, width: unknown, quantity: unknown, fallbackQty?: unknown): number => {
  const l = asNumber(length);
  const w = asNumber(width);
  const q = asNumber(quantity);
  if (l > 0 && w > 0) {
    return l * w * (q > 0 ? q : 1);
  }
  if (q > 0) {
    return q;
  }
  return asNumber(fallbackQty);
};

/** A recorded quantity is authoritative, including zero. Dimensions are only a fallback for piece deliveries. */
export const getDeliveryMainQuantity = (row: any, explicitType?: DeliveryType): number => {
  for (const key of ['mainQuantity', 'main_quantity', 'deliveredQty', 'delivered_qty']) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') return asNumber(row[key]);
  }
  const type = explicitType || resolveDeliveryType(row);
  if (type === 'piece') {
    return calculatePieceQuantity(row?.length, row?.width, row?.quantity);
  }
  return 0;
};

/** Preserve inventory routing and measured amounts when forms become read-only or history. */
export const normalizeProductionDeliverySnapshot = (row: any, group: any = {}) => {
  const deliveryType = resolveDeliveryType(row?.deliveryType || row?.delivery_type ? row : group);
  const sourceBundleId = row?.sourceBundleId || row?.source_bundle_id || row?.bundle_id
    || group?.sourceBundleId || group?.source_bundle_id || group?.bundle_id || null;
  const requestedTarget = row?.targetBundleId || row?.target_bundle_id || group?.targetBundleId || group?.target_bundle_id;
  const targetBundleId = requestedTarget === USE_SOURCE_BUNDLE_VALUE || !requestedTarget ? sourceBundleId : requestedTarget;
  const sourceBundleLabel = row?.sourceBundleLabel || row?.source_bundle_label || group?.sourceBundleLabel || group?.source_bundle_label || null;
  return {
    ...row,
    deliveryType,
    delivery_type: deliveryType,
    name: deliveryType === 'piece' ? String(row?.name ?? '') : undefined,
    length: deliveryType === 'piece' ? asNumber(row?.length) : undefined,
    width: deliveryType === 'piece' ? asNumber(row?.width) : undefined,
    conversionWidthMm: row?.conversionWidthMm ? asNumber(row.conversionWidthMm) : undefined,
    quantity: deliveryType === 'piece' ? asNumber(row?.quantity) : undefined,
    mainQuantity: getDeliveryMainQuantity(row, deliveryType),
    deliveredQty: getDeliveryMainQuantity(row, deliveryType),
    subQuantity: asNumber(row?.subQuantity ?? row?.sub_quantity),
    mainUnit: String(row?.mainUnit ?? row?.main_unit ?? ''),
    subUnit: String(row?.subUnit ?? row?.sub_unit ?? ''),
    sourceBundleId,
    sourceShelfId: row?.sourceShelfId || row?.source_shelf_id || group?.sourceShelfId || group?.source_shelf_id || null,
    sourceBundleLabel,
    targetBundleId,
    targetBundleLabel: row?.targetBundleLabel || row?.target_bundle_label || group?.targetBundleLabel
      || (targetBundleId && targetBundleId === sourceBundleId ? sourceBundleLabel : null),
    giverNote: String(row?.giverNote ?? row?.giver_note ?? ''),
  };
};

/** New editable drafts must store the choice that the select displays. */
export const normalizeDraftTargetBundle = (row: any): string => {
  if (row?.create_new_target_bundle === true || row?.createNewTargetBundle === true) return CREATE_NEW_BUNDLE_VALUE;
  return String(row?.targetBundleId || row?.target_bundle_id || CREATE_NEW_BUNDLE_VALUE);
};

export type RemainderMode = 'keep' | 'waste';

export type StageRemainderSummary = {
  totalSourceQty: number;
  totalDeliveredQty: number;
  previousWasteQty: number;
  remainingAvailable: number;
  mode: RemainderMode;
  wasteQty: number;
  remainingStageStock: number;
};

const roundStageQty = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 10000) / 10000;
  return rounded <= 0.00005 ? 0 : rounded;
};

export const resolveStageRemainderState = (params: {
  totalSourceQty: unknown;
  currentDeliveredQty: unknown;
  previousDeliveredQty?: unknown;
  previousWasteQty?: unknown;
  remainderMode?: RemainderMode | null;
  requestedWasteQty?: unknown;
}): StageRemainderSummary => {
  const totalSourceQty = asNumber(params.totalSourceQty);
  const totalDeliveredQty = asNumber(params.currentDeliveredQty) + asNumber(params.previousDeliveredQty);
  const previousWasteQty = asNumber(params.previousWasteQty);
  const remainingAvailable = roundStageQty(Math.max(0, totalSourceQty - totalDeliveredQty - previousWasteQty));
  const mode: RemainderMode = params.remainderMode === 'waste' ? 'waste' : 'keep';
  if (mode !== 'waste' || remainingAvailable <= 0) {
    return {
      totalSourceQty,
      totalDeliveredQty,
      previousWasteQty,
      remainingAvailable,
      mode,
      wasteQty: 0,
      remainingStageStock: remainingAvailable,
    };
  }
  const hasExplicitWaste =
    params.requestedWasteQty !== undefined && params.requestedWasteQty !== null && params.requestedWasteQty !== '';
  const rawRequested = hasExplicitWaste ? asNumber(params.requestedWasteQty) : remainingAvailable;
  const wasteQty = roundStageQty(Math.min(remainingAvailable, Math.max(0, rawRequested)));
  const remainingStageStock = roundStageQty(Math.max(0, remainingAvailable - wasteQty));
  return {
    totalSourceQty,
    totalDeliveredQty,
    previousWasteQty,
    remainingAvailable,
    mode,
    wasteQty,
    remainingStageStock,
  };
};
