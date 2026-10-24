import { CREATE_NEW_BUNDLE_VALUE, USE_SOURCE_BUNDLE_VALUE } from './productionBundles';

const asNumber = (value: unknown): number => {
  const normalized = String(value ?? '').replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[,٬\s]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

/** A recorded quantity is authoritative, including zero. Dimensions are only a legacy fallback. */
export const getDeliveryMainQuantity = (row: any): number => {
  for (const key of ['mainQuantity', 'main_quantity', 'deliveredQty', 'delivered_qty']) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') return asNumber(row[key]);
  }
  return asNumber(row?.length) * asNumber(row?.width) * asNumber(row?.quantity);
};

/** Preserve inventory routing and measured amounts when forms become read-only or history. */
export const normalizeProductionDeliverySnapshot = (row: any, group: any = {}) => {
  const sourceBundleId = row?.sourceBundleId || row?.source_bundle_id || row?.bundle_id
    || group?.sourceBundleId || group?.source_bundle_id || group?.bundle_id || null;
  const requestedTarget = row?.targetBundleId || row?.target_bundle_id || group?.targetBundleId || group?.target_bundle_id;
  const targetBundleId = requestedTarget === USE_SOURCE_BUNDLE_VALUE || !requestedTarget ? sourceBundleId : requestedTarget;
  const sourceBundleLabel = row?.sourceBundleLabel || row?.source_bundle_label || group?.sourceBundleLabel || group?.source_bundle_label || null;
  return {
    ...row,
    mainQuantity: getDeliveryMainQuantity(row),
    deliveredQty: getDeliveryMainQuantity(row),
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
