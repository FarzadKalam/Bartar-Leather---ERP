import type { SupabaseClient } from '@supabase/supabase-js';
import { toPersianNumber } from './persianNumberFormatter';

export type DestinationBundleOption = {
  value: string;
  label: string;
  shelfId?: string | null;
  shelfLabel?: string | null;
  stock?: number;
  disabled?: boolean;
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * فهرست بسته‌های قابل استفاده برای مقصد را مستقل از محصول می‌سازد.
 * بستهٔ خالی در هر مقصدی قابل استفاده است؛ بستهٔ دارای موجودی فقط در همان قفسه.
 */
export const loadDestinationBundleOptions = async (
  client: SupabaseClient
): Promise<DestinationBundleOption[]> => {
  const [{ data: bundles, error: bundleError }, { data: inventory, error: inventoryError }] = await Promise.all([
    client.from('product_bundles').select('id, bundle_number').order('created_at', { ascending: false }).limit(1000),
    client.from('product_inventory').select('bundle_id, shelf_id, stock').not('bundle_id', 'is', null).gt('stock', 0).limit(5000),
  ]);
  if (bundleError) throw bundleError;
  if (inventoryError) throw inventoryError;

  const positiveRows = (inventory || []).filter((row: any) => row?.bundle_id && row?.shelf_id && toNumber(row?.stock) > 0);
  const shelfIds = Array.from(new Set(positiveRows.map((row: any) => String(row.shelf_id))));
  const shelfLabelById = new Map<string, string>();
  if (shelfIds.length > 0) {
    const { data: shelves, error: shelfError } = await client
      .from('shelves')
      .select('id, shelf_number, name, warehouses(name)')
      .in('id', shelfIds);
    if (shelfError) throw shelfError;
    (shelves || []).forEach((shelf: any) => {
      const warehouseName = String(shelf?.warehouses?.name || '');
      shelfLabelById.set(
        String(shelf.id),
        `${String(shelf?.shelf_number || shelf?.name || shelf.id)}${warehouseName ? ` - ${warehouseName}` : ''}`
      );
    });
  }

  const rowsByBundle = new Map<string, any[]>();
  positiveRows.forEach((row: any) => {
    const bundleId = String(row.bundle_id);
    rowsByBundle.set(bundleId, [...(rowsByBundle.get(bundleId) || []), row]);
  });

  return (bundles || []).map((bundle: any) => {
    const bundleId = String(bundle.id);
    const rows = rowsByBundle.get(bundleId) || [];
    const occupiedShelfIds = Array.from(new Set(rows.map((row: any) => String(row.shelf_id))));
    const hasSingleShelf = occupiedShelfIds.length <= 1;
    const shelfId = occupiedShelfIds[0] || null;
    const shelfLabel = shelfId ? (shelfLabelById.get(shelfId) || shelfId) : null;
    const stock = rows.reduce((sum: number, row: any) => sum + toNumber(row?.stock), 0);
    const bundleNumber = String(bundle?.bundle_number || bundleId);
    return {
      value: bundleId,
      label: !hasSingleShelf
        ? `${bundleNumber} — نیازمند اصلاح: بسته در چند قفسه ثبت شده`
        : shelfLabel
          ? `${bundleNumber} — ${shelfLabel} (موجودی: ${toPersianNumber(stock)})`
          : `${bundleNumber} — بسته خالی`,
      shelfId,
      shelfLabel,
      stock,
      disabled: !hasSingleShelf,
    };
  });
};
