import type { SupabaseClient } from '@supabase/supabase-js';
import { applyInventoryDeltas, syncMultipleProductsStock } from './inventoryTransactions';
import { buildStockTransferPayload } from './stockTransferHelpers';

const toNumber = (value: any) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isFinalStatus = (status: any) => {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'final' || normalized === 'completed';
};

const getInvoiceDirection = (moduleId: string) => {
  return moduleId === 'purchase_invoices' ? 'purchase' : 'sale';
};

interface ApplyInvoiceFinalizationParams {
  supabase: SupabaseClient;
  moduleId: string;
  recordId: string;
  previousStatus?: string | null;
  nextStatus?: string | null;
  invoiceItems: any[];
  userId?: string | null;
}

export const applyInvoiceFinalizationInventory = async ({
  supabase,
  moduleId,
  recordId,
  previousStatus,
  nextStatus,
  invoiceItems,
  userId,
}: ApplyInvoiceFinalizationParams) => {
  if (!recordId) return { applied: false };
  if (!isFinalStatus(nextStatus)) return { applied: false };
  if (isFinalStatus(previousStatus)) return { applied: false };

  const direction = getInvoiceDirection(moduleId);
  const transferType = direction === 'purchase' ? 'purchase_invoice' : 'sales_invoice';

  const { data: existingTransfers, error: existingError } = await supabase
    .from('stock_transfers')
    .select('id, invoice_id, purchase_invoice_id')
    .eq('transfer_type', transferType);
  if (existingError) throw existingError;
  const alreadyApplied = (existingTransfers || []).some((row: any) => {
    if (direction === 'purchase') {
      return row?.purchase_invoice_id === recordId || row?.invoice_id === recordId;
    }
    return row?.invoice_id === recordId;
  });
  if (alreadyApplied) {
    return { applied: false, skipped: 'already_applied' as const };
  }

  const rows = Array.isArray(invoiceItems) ? invoiceItems : [];
  if (rows.length === 0) {
    return { applied: false };
  }

  const deltas: Array<{ productId: string; shelfId: string; delta: number; unit?: string | null }> = [];
  const transfersPayload: any[] = [];
  const affectedProductIds: string[] = [];

  rows.forEach((item: any, index: number) => {
    const productId = item?.product_id ? String(item.product_id) : '';
    const shelfIdRaw = item?.source_shelf_id || item?.shelf_id || item?.selected_shelf_id || null;
    const shelfId = shelfIdRaw ? String(shelfIdRaw) : '';
    const qty = Math.abs(toNumber(item?.quantity ?? item?.qty ?? item?.count));
    const unit = item?.main_unit ? String(item.main_unit) : null;

    if (!productId || qty <= 0) return;
    if (!shelfId) {
      throw new Error(`در ردیف ${index + 1} قفسه انتخاب نشده است.`);
    }

    affectedProductIds.push(productId);

    if (direction === 'purchase') {
      deltas.push({ productId, shelfId, delta: qty, unit });
      transfersPayload.push(buildStockTransferPayload({
        transferType,
        productId,
        deliveredQty: qty,
        requiredQty: qty,
        purchaseInvoiceId: recordId,
        fromShelfId: null,
        toShelfId: shelfId,
        userId: userId || null,
      }));
      return;
    }

    deltas.push({ productId, shelfId, delta: -qty, unit });
    transfersPayload.push(buildStockTransferPayload({
      transferType,
      productId,
      deliveredQty: qty,
      requiredQty: qty,
      invoiceId: recordId,
      fromShelfId: shelfId,
      toShelfId: null,
      userId: userId || null,
    }));
  });

  if (deltas.length === 0) return { applied: false };

  await applyInventoryDeltas(supabase, deltas);

  const { error: insertError } = await supabase
    .from('stock_transfers')
    .insert(transfersPayload);
  if (insertError) throw insertError;

  await syncMultipleProductsStock(supabase, affectedProductIds);
  return { applied: true, affectedProducts: Array.from(new Set(affectedProductIds)) };
};
