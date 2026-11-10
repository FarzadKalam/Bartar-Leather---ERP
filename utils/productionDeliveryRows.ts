import { CREATE_NEW_BUNDLE_VALUE, USE_SOURCE_BUNDLE_VALUE } from './productionBundles';
import { calculateUnitQuantity, getUnitQuantityConversion } from './unitQuantityConversion';

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
  const hasExplicitQuantity = quantity !== undefined && quantity !== null && String(quantity).trim() !== '';
  const q = asNumber(quantity);
  if (l > 0 && w > 0) {
    return l * w * (hasExplicitQuantity ? q : 1);
  }
  if (l > 0 || w > 0) {
    return hasExplicitQuantity && q === 0 ? 0 : asNumber(fallbackQty);
  }
  const fb = asNumber(fallbackQty);
  if (fb > 0) return fb;
  return q;
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

const NUMERIC_DELIVERY_FIELDS = new Set([
  'length',
  'width',
  'conversionWidthMm',
  'quantity',
  'mainQuantity',
  'subQuantity',
]);

/** محاسبه خودکار مقدار واحد فرعی بر اساس مقدار اصلی و عرض رول/تبدیل (نه عرض برش قطعه). */
export const computeConvertedSubQuantity = (params: {
  mainQuantity: unknown;
  subQuantity?: unknown;
  mainUnit?: string | null;
  subUnit?: string | null;
  conversionWidthMm?: unknown;
  productWidthMm?: unknown;
}): number | null => {
  const mainQty = asNumber(params.mainQuantity);
  const mainUnit = String(params.mainUnit ?? '').trim();
  const subUnit = String(params.subUnit ?? '').trim();
  if (!mainUnit || !subUnit) return null;
  if (mainQty <= 0) return 0;
  const conversion = getUnitQuantityConversion('mainQuantity', {
    availableKeys: ['mainQuantity', 'subQuantity'],
  });
  if (!conversion) return null;
  const resolvedWidthMm = asNumber(params.conversionWidthMm) || asNumber(params.productWidthMm) || undefined;
  try {
    const converted = calculateUnitQuantity(
      {
        mainQuantity: mainQty,
        subQuantity: asNumber(params.subQuantity),
        main_unit: mainUnit,
        sub_unit: subUnit,
        ...(resolvedWidthMm ? { conversionWidthMm: resolvedWidthMm, widthMm: resolvedWidthMm } : {}),
      },
      conversion
    );
    return Number.isFinite(converted) ? Number(converted.toPrecision(12)) : null;
  } catch {
    return null;
  }
};

/** اعمال یکپارچه تغییر فیلد روی ردیف تحویل (شامل محاسبه ابعاد و صفر شدن مقدار فرعی در تعداد ۰). */
export const applyDeliveryRowFieldUpdate = <T extends Record<string, any>>(
  row: T,
  group: { deliveryType?: DeliveryType; delivery_type?: DeliveryType; productWidthMm?: number | null; deliveryRows?: any[]; pieces?: any[] },
  field: string,
  value: unknown
): T => {
  const nextValue = NUMERIC_DELIVERY_FIELDS.has(field)
    ? asNumber(value)
    : (value == null ? '' : String(value));
  const updatedRow: Record<string, any> = { ...row, [field]: nextValue };
  const effectiveType = resolveDeliveryType(group);

  if (effectiveType === 'piece' && (field === 'length' || field === 'width' || field === 'quantity')) {
    updatedRow.mainQuantity = calculatePieceQuantity(updatedRow.length, updatedRow.width, updatedRow.quantity);
    if (updatedRow.mainQuantity <= 0) {
      updatedRow.subQuantity = 0;
    } else {
      const convertedSub = computeConvertedSubQuantity({
        mainQuantity: updatedRow.mainQuantity,
        subQuantity: updatedRow.subQuantity,
        mainUnit: updatedRow.mainUnit,
        subUnit: updatedRow.subUnit,
        conversionWidthMm: updatedRow.conversionWidthMm,
        productWidthMm: group?.productWidthMm,
      });
      if (convertedSub !== null) {
        updatedRow.subQuantity = convertedSub;
      }
    }
  }

  updatedRow.deliveryType = effectiveType;
  updatedRow.deliveredQty = getDeliveryMainQuantity(updatedRow, effectiveType);
  return updatedRow as T;
};

/** تغییر نوع تحویل گروه با حفظ مقدار فیزیکی ردیف‌های موجود. */
export const switchGroupDeliveryTypeRows = <T extends Record<string, any>>(
  rows: T[],
  previousGroupType: DeliveryType,
  nextDeliveryType: DeliveryType
): Array<T & {
  deliveryType: DeliveryType;
  delivery_type: DeliveryType;
  mainQuantity: number;
  deliveredQty: number;
}> => (
  (Array.isArray(rows) ? rows : []).map((row) => {
    const rowType = row?.deliveryType || row?.delivery_type ? resolveDeliveryType(row) : previousGroupType;
    const preservedQty = getDeliveryMainQuantity(row, rowType);
    return {
      ...row,
      deliveryType: nextDeliveryType,
      delivery_type: nextDeliveryType,
      mainQuantity: preservedQty,
      deliveredQty: preservedQty,
    };
  })
);

/** تطبیق ردیف تحویل هنگام کپی یا جابجایی بین گروه‌های فله‌ای/قطعه‌ای یا کالاهای متفاوت. */
export const adaptDeliveryRowForTargetGroup = (
  row: any,
  sourceGroup: any,
  targetGroup: any,
  newKey: string
) => {
  const sourceGroupType = resolveDeliveryType(sourceGroup);
  const rowSourceType = row?.deliveryType || row?.delivery_type ? resolveDeliveryType(row) : sourceGroupType;
  const targetType = resolveDeliveryType(targetGroup);
  const preservedQty = getDeliveryMainQuantity(row, rowSourceType);
  const subQty = asNumber(row?.subQuantity ?? row?.sub_quantity);
  const sourceProductId = String(sourceGroup?.selectedProductId || '').trim();
  const targetProductId = String(targetGroup?.selectedProductId || '').trim();
  const sameProduct = Boolean(sourceProductId && targetProductId && sourceProductId === targetProductId)
    || sourceGroup === targetGroup;
  const targetFirstPiece = Array.isArray(targetGroup?.pieces) && targetGroup.pieces.length > 0 ? targetGroup.pieces[0] : null;
  const requestedTargetBundle = row?.targetBundleId ?? row?.target_bundle_id;
  const nextTargetBundleId = !sameProduct && requestedTargetBundle === USE_SOURCE_BUNDLE_VALUE
    ? CREATE_NEW_BUNDLE_VALUE
    : requestedTargetBundle;

  return {
    ...row,
    key: newKey,
    pieceKey: undefined,
    deliveryType: targetType,
    delivery_type: targetType,
    name: targetType === 'piece' ? String(row?.name ?? '') : '',
    length: targetType === 'piece' ? asNumber(row?.length) : 0,
    width: targetType === 'piece' ? asNumber(row?.width) : 0,
    quantity: targetType === 'piece' ? asNumber(row?.quantity) : 0,
    mainUnit: sameProduct ? String(row?.mainUnit ?? '') : String(targetFirstPiece?.mainUnit || row?.mainUnit || ''),
    subUnit: sameProduct ? String(row?.subUnit ?? '') : String(targetFirstPiece?.subUnit || row?.subUnit || ''),
    mainQuantity: preservedQty,
    deliveredQty: preservedQty,
    subQuantity: subQty,
    sourceBundleId: sameProduct ? (row?.sourceBundleId || row?.source_bundle_id || null) : null,
    sourceShelfId: sameProduct ? (row?.sourceShelfId || row?.source_shelf_id || null) : null,
    sourceBundleLabel: sameProduct ? (row?.sourceBundleLabel || row?.source_bundle_label || null) : null,
    targetBundleId: nextTargetBundleId,
    targetBundleLabel: (!sameProduct && requestedTargetBundle === USE_SOURCE_BUNDLE_VALUE) ? null : (row?.targetBundleLabel || row?.target_bundle_label || null),
    ...(sameProduct ? {} : { targetStageTaskId: targetGroup?.targetStageTaskId ?? null }),
  };
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
