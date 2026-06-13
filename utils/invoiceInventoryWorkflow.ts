import type { SupabaseClient } from '@supabase/supabase-js';
import { applyInventoryDeltas, syncMultipleProductsStock } from './inventoryTransactions';
import { buildStockTransferPayload, getStockTransferLinkedRecordIds } from './stockTransferHelpers';
import { convertBetweenUnits, normalizeUnitValue } from './unitConversions';

const toNumber = (value: any) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isFinalStatus = (status: any) => {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'final' || normalized === 'settled' || normalized === 'completed';
};

const isCancelledStatus = (status: any) => {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'cancelled' || normalized === 'canceled';
};

const getInvoiceDirection = (moduleId: string) => (
  moduleId === 'purchase_invoices' ? 'purchase' : 'sale'
);

const getTransferTypes = (moduleId: string) => {
  const direction = getInvoiceDirection(moduleId);
  return direction === 'purchase'
    ? { apply: 'purchase_invoice', cancel: 'purchase_invoice_cancel' }
    : { apply: 'sales_invoice', cancel: 'sales_invoice_cancel' };
};

const normalizeInvoiceItem = (item: any) => {
  const mainUnit = normalizeUnitValue(item?.main_unit ? String(item.main_unit) : null) || (item?.main_unit ? String(item.main_unit).trim() : null);
  const subUnit = normalizeUnitValue(item?.sub_unit ? String(item.sub_unit) : null) || (item?.sub_unit ? String(item.sub_unit).trim() : null);
  let qty = Math.abs(toNumber(item?.quantity ?? item?.qty ?? item?.count));
  let subQty = Math.abs(toNumber(item?.sub_quantity));

  if (qty <= 0 && subQty > 0 && mainUnit && subUnit) {
    qty = mainUnit === subUnit
      ? subQty
      : Math.abs(toNumber(convertBetweenUnits(subQty, subUnit, mainUnit)));
  }

  if (subQty <= 0 && qty > 0 && mainUnit && subUnit) {
    subQty = mainUnit === subUnit
      ? qty
      : Math.abs(toNumber(convertBetweenUnits(qty, mainUnit, subUnit)));
  }

  return {
    ...item,
    main_unit: mainUnit || item?.main_unit || null,
    sub_unit: subUnit || item?.sub_unit || null,
    quantity: qty,
    sub_quantity: subQty,
  };
};

export const normalizeInvoiceItemsForInventory = (invoiceItems: any[]) => (
  Array.isArray(invoiceItems) ? invoiceItems.map((item) => normalizeInvoiceItem(item)) : []
);

type ActiveTransferAggregate = {
  productId: string;
  shelfId: string;
  bundleId: string | null;
  deltaQty: number;
  deltaSubQty: number;
};

const buildTransferAggregateKey = (productId: string, shelfId: string, bundleId: string | null) => (
  `${productId}::${shelfId}::${bundleId ?? '__null__'}`
);

const roundQuantity = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
};

const allocateSaleQuantityAcrossShelfInventory = async (
  supabase: SupabaseClient,
  {
    productId,
    shelfId,
    quantity,
    bundleId,
  }: {
    productId: string;
    shelfId: string;
    quantity: number;
    bundleId?: string | null;
  }
) => {
  const qty = Math.abs(toNumber(quantity));
  if (!productId || !shelfId || qty <= 0) return [];
  if (bundleId) return [{ bundleId, quantity: qty }];

  const { data, error } = await supabase
    .from('product_inventory')
    .select('bundle_id, stock')
    .eq('product_id', productId)
    .eq('shelf_id', shelfId);
  if (error) throw error;

  const rows = [...(data || [])]
    .map((row: any) => ({
      bundleId: row?.bundle_id ? String(row.bundle_id) : null,
      stock: Math.max(0, toNumber(row?.stock)),
    }))
    .filter((row) => row.stock > 0)
    .sort((left, right) => {
      if (left.bundleId === null && right.bundleId !== null) return -1;
      if (left.bundleId !== null && right.bundleId === null) return 1;
      return String(left.bundleId || '').localeCompare(String(right.bundleId || ''), 'en');
    });

  let remaining = qty;
  const allocations: Array<{ bundleId: string | null; quantity: number }> = [];
  rows.forEach((row) => {
    if (remaining <= 0) return;
    const allocated = Math.min(remaining, row.stock);
    if (allocated <= 0) return;
    allocations.push({ bundleId: row.bundleId, quantity: roundQuantity(allocated) });
    remaining = roundQuantity(remaining - allocated);
  });

  if (remaining > 0) {
    allocations.push({ bundleId: null, quantity: roundQuantity(remaining) });
  }

  return allocations;
};

const getTransferRecordId = (moduleId: string, row: any) => {
  const refs = getStockTransferLinkedRecordIds(row);
  return moduleId === 'purchase_invoices'
    ? (refs.purchaseInvoiceId || refs.invoiceId || null)
    : refs.invoiceId;
};

const aggregateActiveTransferEffects = (moduleId: string, rows: any[]) => {
  const direction = getInvoiceDirection(moduleId);
  const transferTypes = getTransferTypes(moduleId);
  const map = new Map<string, ActiveTransferAggregate>();

  (rows || []).forEach((row: any) => {
    const transferType = String(row?.transfer_type || '').trim();
    const productId = row?.product_id ? String(row.product_id) : '';
    const bundleId = row?.bundle_id ? String(row.bundle_id) : null;
    const qty = Math.abs(toNumber(row?.delivered_qty));
    const subQty = Math.abs(toNumber(row?.required_qty));
    if (!productId || qty <= 0) return;

    let shelfId = '';
    let signedQty = 0;
    let signedSubQty = 0;

    if (direction === 'purchase' && transferType === transferTypes.apply) {
      shelfId = row?.to_shelf_id ? String(row.to_shelf_id) : '';
      signedQty = qty;
      signedSubQty = subQty;
    } else if (direction === 'purchase' && transferType === transferTypes.cancel) {
      shelfId = row?.from_shelf_id ? String(row.from_shelf_id) : '';
      signedQty = -qty;
      signedSubQty = -subQty;
    } else if (direction === 'sale' && transferType === transferTypes.apply) {
      shelfId = row?.from_shelf_id ? String(row.from_shelf_id) : '';
      signedQty = -qty;
      signedSubQty = -subQty;
    } else if (direction === 'sale' && transferType === transferTypes.cancel) {
      shelfId = row?.to_shelf_id ? String(row.to_shelf_id) : '';
      signedQty = qty;
      signedSubQty = subQty;
    } else {
      return;
    }

    if (!shelfId) return;

    const key = buildTransferAggregateKey(productId, shelfId, bundleId);
    const existing = map.get(key);
    if (existing) {
      existing.deltaQty += signedQty;
      existing.deltaSubQty += signedSubQty;
    } else {
      map.set(key, {
        productId,
        shelfId,
        bundleId,
        deltaQty: signedQty,
        deltaSubQty: signedSubQty,
      });
    }
  });

  return Array.from(map.values()).filter((row) => Math.abs(row.deltaQty) > 0);
};

interface ApplyInvoiceFinalizationParams {
  supabase: SupabaseClient;
  moduleId: string;
  recordId: string;
  previousStatus?: string | null;
  nextStatus?: string | null;
  invoiceItems: any[];
  userId?: string | null;
  ignoreExistingActiveEffectCheck?: boolean;
}

type InvoiceInventorySyncResult = {
  applied: boolean;
  affectedProducts?: string[];
  skipped?: 'already_applied' | 'already_reverted';
};

export const applyInvoiceFinalizationInventory = async ({
  supabase,
  moduleId,
  recordId,
  previousStatus,
  nextStatus,
  invoiceItems,
  userId,
  ignoreExistingActiveEffectCheck = false,
}: ApplyInvoiceFinalizationParams): Promise<InvoiceInventorySyncResult> => {
  if (!recordId) return { applied: false };

  const direction = getInvoiceDirection(moduleId);
  const transferTypes = getTransferTypes(moduleId);

  const { data: existingTransfers, error: existingError } = await supabase
    .from('stock_transfers')
    .select('id, invoice_id, purchase_invoice_id, transfer_type, product_id, from_shelf_id, to_shelf_id, delivered_qty, required_qty, bundle_id');
  if (existingError) throw existingError;

  const relevantTransfers = (existingTransfers || []).filter((row: any) => {
    const transferType = String(row?.transfer_type || '').trim();
    if (transferType !== transferTypes.apply && transferType !== transferTypes.cancel) return false;
    return getTransferRecordId(moduleId, row) === recordId;
  });
  const activeEffects = aggregateActiveTransferEffects(moduleId, relevantTransfers);
  const hasActiveInventoryEffect = activeEffects.length > 0;
  const hasLegacyApplyMarker = relevantTransfers.some((row: any) => {
    const transferType = String(row?.transfer_type || '').trim();
    if (transferType !== transferTypes.apply) return false;
    const hasQuantity = Math.abs(toNumber(row?.delivered_qty)) > 0;
    const hasShelf = !!(row?.from_shelf_id || row?.to_shelf_id);
    return !hasQuantity && !hasShelf;
  });
  const hasCancelMarker = relevantTransfers.some((row: any) => String(row?.transfer_type || '').trim() === transferTypes.cancel);
  const shouldTreatLegacyApplyAsActive = hasLegacyApplyMarker && !hasCancelMarker;

  if (isFinalStatus(nextStatus)) {
    if (isFinalStatus(previousStatus)) return { applied: false };
    if (!ignoreExistingActiveEffectCheck && (hasActiveInventoryEffect || shouldTreatLegacyApplyAsActive)) {
      return { applied: false, skipped: 'already_applied' as const };
    }
  } else if (isCancelledStatus(nextStatus)) {
    if (!hasActiveInventoryEffect) {
      return { applied: false, skipped: 'already_reverted' as const };
    }
  } else {
    return { applied: false };
  }

  const deltas: Array<{ productId: string; shelfId: string; bundleId?: string | null; delta: number; unit?: string | null }> = [];
  const transfersPayload: any[] = [];
  const affectedProductIds: string[] = [];

  if (isFinalStatus(nextStatus)) {
    const rows = normalizeInvoiceItemsForInventory(invoiceItems);
    if (rows.length === 0) {
      return { applied: false };
    }

    for (const [index, item] of rows.entries()) {
      const productId = item?.product_id ? String(item.product_id) : '';
      const shelfIdRaw = item?.source_shelf_id || item?.shelf_id || item?.selected_shelf_id || null;
      const shelfId = shelfIdRaw ? String(shelfIdRaw) : '';
      const mainUnit = item?.main_unit ? String(item.main_unit) : null;
      const qty = Math.abs(toNumber(item?.quantity ?? item?.qty ?? item?.count));
      const requiredQty = Math.abs(toNumber(item?.sub_quantity));
      const bundleId = item?.bundle_id ? String(item.bundle_id) : null;

      if (!productId || qty <= 0) continue;
      if (!shelfId) {
        throw new Error(`در ردیف ${index + 1} قفسه انتخاب نشده است.`);
      }

      affectedProductIds.push(productId);

      if (direction === 'purchase') {
        deltas.push({ productId, shelfId, bundleId, delta: qty, unit: mainUnit });
        transfersPayload.push(buildStockTransferPayload({
          transferType: transferTypes.apply,
          productId,
          deliveredQty: qty,
          requiredQty,
          purchaseInvoiceId: recordId,
          fromShelfId: null,
          toShelfId: shelfId,
          userId: userId || null,
          bundleId,
        }));
      } else {
        const allocations = await allocateSaleQuantityAcrossShelfInventory(supabase, {
          productId,
          shelfId,
          quantity: qty,
          bundleId,
        });
        let allocatedRequiredQtySoFar = 0;
        allocations.forEach((allocation, allocationIndex) => {
          const allocatedQty = Math.abs(toNumber(allocation.quantity));
          if (allocatedQty <= 0) return;
          const allocatedRequiredQty = requiredQty > 0
            ? (allocationIndex === allocations.length - 1
              ? roundQuantity(requiredQty - allocatedRequiredQtySoFar)
              : roundQuantity(requiredQty * (allocatedQty / qty)))
            : 0;
          allocatedRequiredQtySoFar = roundQuantity(allocatedRequiredQtySoFar + allocatedRequiredQty);
          deltas.push({ productId, shelfId, bundleId: allocation.bundleId, delta: -allocatedQty, unit: mainUnit });
          transfersPayload.push(buildStockTransferPayload({
            transferType: transferTypes.apply,
            productId,
            deliveredQty: allocatedQty,
            requiredQty: Math.max(0, allocatedRequiredQty),
            invoiceId: recordId,
            fromShelfId: shelfId,
            toShelfId: null,
            userId: userId || null,
            bundleId: allocation.bundleId,
          }));
        });
      }
    }
  } else {
    activeEffects.forEach((item) => {
      const qty = Math.abs(toNumber(item.deltaQty));
      if (!item.productId || !item.shelfId || qty <= 0) return;

      affectedProductIds.push(item.productId);
      deltas.push({
        productId: item.productId,
        shelfId: item.shelfId,
        bundleId: item.bundleId,
        delta: -item.deltaQty,
      });

      transfersPayload.push(buildStockTransferPayload({
        transferType: transferTypes.cancel,
        productId: item.productId,
        deliveredQty: qty,
        requiredQty: Math.abs(toNumber(item.deltaSubQty)),
        invoiceId: moduleId === 'invoices' ? recordId : null,
        purchaseInvoiceId: moduleId === 'purchase_invoices' ? recordId : null,
        fromShelfId: direction === 'purchase' ? item.shelfId : null,
        toShelfId: direction === 'sale' ? item.shelfId : null,
        userId: userId || null,
        bundleId: item.bundleId,
      }));
    });
  }

  if (deltas.length === 0) return { applied: false };

  await applyInventoryDeltas(supabase, deltas);

  const { error: insertError } = await supabase
    .from('stock_transfers')
    .insert(transfersPayload);
  if (insertError) throw insertError;

  await syncMultipleProductsStock(supabase, affectedProductIds);
  return { applied: true, affectedProducts: Array.from(new Set(affectedProductIds)) };
};

const buildInvoiceItemsInventorySignature = (invoiceItems: any[]) => {
  const signatureRows = normalizeInvoiceItemsForInventory(invoiceItems)
    .map((item: any) => {
      const productId = item?.product_id ? String(item.product_id) : '';
      const shelfIdRaw = item?.source_shelf_id || item?.shelf_id || item?.selected_shelf_id || null;
      const shelfId = shelfIdRaw ? String(shelfIdRaw) : '';
      const bundleId = item?.bundle_id ? String(item.bundle_id) : null;
      const qty = Math.abs(toNumber(item?.quantity ?? item?.qty ?? item?.count));
      const subQty = Math.abs(toNumber(item?.sub_quantity));
      const mainUnit = item?.main_unit ? String(item.main_unit).trim() : '';
      const subUnit = item?.sub_unit ? String(item.sub_unit).trim() : '';
      if (!productId || qty <= 0) return null;
      return {
        productId,
        shelfId,
        bundleId,
        qty,
        subQty,
        mainUnit,
        subUnit,
      };
    })
    .filter(Boolean)
    .sort((left: any, right: any) => JSON.stringify(left).localeCompare(JSON.stringify(right), 'en'));

  return JSON.stringify(signatureRows);
};

interface SyncInvoiceInventoryOnSaveParams {
  supabase: SupabaseClient;
  moduleId: string;
  recordId: string;
  previousStatus?: string | null;
  nextStatus?: string | null;
  previousInvoiceItems?: any[] | null;
  nextInvoiceItems?: any[] | null;
  userId?: string | null;
}

export const syncInvoiceInventoryOnSave = async ({
  supabase,
  moduleId,
  recordId,
  previousStatus,
  nextStatus,
  previousInvoiceItems,
  nextInvoiceItems,
  userId,
}: SyncInvoiceInventoryOnSaveParams) => {
  const previousItems = Array.isArray(previousInvoiceItems) ? previousInvoiceItems : [];
  const nextItems = Array.isArray(nextInvoiceItems) ? nextInvoiceItems : [];
  const previousItemsSignature = buildInvoiceItemsInventorySignature(previousItems);
  const nextItemsSignature = buildInvoiceItemsInventorySignature(nextItems);
  const inventoryItemsChanged = previousItemsSignature !== nextItemsSignature;

  if (isFinalStatus(previousStatus) && isFinalStatus(nextStatus) && inventoryItemsChanged) {
    await applyInvoiceFinalizationInventory({
      supabase,
      moduleId,
      recordId,
      previousStatus,
      nextStatus: 'cancelled',
      invoiceItems: [],
      userId,
    });

    return applyInvoiceFinalizationInventory({
      supabase,
      moduleId,
      recordId,
      previousStatus: 'cancelled',
      nextStatus,
      invoiceItems: nextItems,
      userId,
      ignoreExistingActiveEffectCheck: true,
    });
  }

  return applyInvoiceFinalizationInventory({
    supabase,
    moduleId,
    recordId,
    previousStatus,
    nextStatus,
    invoiceItems: nextItems,
    userId,
  });
};
