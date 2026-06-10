import type { SupabaseClient } from '@supabase/supabase-js';
import { getAllowNegativeInventory } from '../../utils/companySettings';

export const fetchShelfOptions = async (
  supabase: SupabaseClient,
  productId: string,
  options?: { includeNonPositive?: boolean }
) => {
  const { data: productRow } = await supabase
    .from('products')
    .select('main_unit')
    .eq('id', productId)
    .maybeSingle();
  const productMainUnit = String(productRow?.main_unit || '').trim();
  const allowNegativeInventory = await getAllowNegativeInventory(supabase);
  const includeNonPositive = options?.includeNonPositive || allowNegativeInventory;
  let query = supabase
    .from('product_inventory')
    .select(`
      product_id,
      shelf_id,
      bundle_id,
      stock,
      shelves(
        system_code,
        shelf_number,
        name,
        warehouses(name)
      ),
      product_bundles:bundle_id(
        id,
        bundle_number
      )
    `)
    .eq('product_id', productId)
    .order('stock', { ascending: false });
  if (!includeNonPositive) {
    query = query.gt('stock', 0);
  }
  const { data: rows, error } = await query;
  if (error) throw error;

  // Invoice rows store only shelf_id, so we must expose one option per shelf.
  const inventoryByShelf = new Map<string, {
    value: string;
    shelfLabel: string;
    stock: number;
    unit: string | null;
  }>();

  (rows || []).forEach((row: any) => {
    const shelfId = String(row?.shelf_id || '').trim();
    if (!shelfId) return;

    const shelfNumber = row?.shelves?.shelf_number || row?.shelves?.name || shelfId;
    const systemCode = row?.shelves?.system_code || '';
    const warehouseName = row?.shelves?.warehouses?.name || '';
    const shelfLabel = [systemCode, shelfNumber, warehouseName].filter(Boolean).join(' - ');
    const stockLabel = typeof row.stock === 'number' ? row.stock : parseFloat(row.stock) || 0;
    const existing = inventoryByShelf.get(shelfId);

    if (existing) {
      existing.stock += stockLabel;
      if (!existing.shelfLabel && shelfLabel) existing.shelfLabel = shelfLabel;
      return;
    }

    inventoryByShelf.set(shelfId, {
      value: shelfId,
      shelfLabel,
      stock: stockLabel,
      unit: productMainUnit || null,
    });
  });

  const inventoryOptions = Array.from(inventoryByShelf.values()).map((item) => {
    const unitSuffix = productMainUnit ? ` ${productMainUnit}` : '';
    return {
      value: item.value,
      label: `${item.shelfLabel} (موجودی: ${item.stock}${unitSuffix})`,
      stock: item.stock,
      unit: item.unit,
    };
  });

  if (!includeNonPositive) {
    return inventoryOptions;
  }

  const { data: shelves, error: shelvesError } = await supabase
    .from('shelves')
    .select(`
      id,
      system_code,
      shelf_number,
      name,
      warehouses(name)
    `)
    .limit(2000);
  if (shelvesError) throw shelvesError;

  const plainShelfIds = new Set(
    inventoryOptions
      .map((row: any) => String(row?.value || ''))
      .filter(Boolean)
  );

  const syntheticOptions = (shelves || [])
    .filter((shelf: any) => !plainShelfIds.has(String(shelf?.id || '')))
    .map((shelf: any) => {
      const shelfNumber = shelf?.shelf_number || shelf?.name || shelf?.id;
      const systemCode = shelf?.system_code || '';
      const warehouseName = shelf?.warehouses?.name || '';
      const shelfLabel = [systemCode, shelfNumber, warehouseName].filter(Boolean).join(' - ');
      const unitSuffix = productMainUnit ? ` ${productMainUnit}` : '';
      return {
        value: shelf.id,
        label: `${shelfLabel} (موجودی: 0${unitSuffix})`,
        stock: 0,
        unit: productMainUnit || null,
      };
    });

  return [...inventoryOptions, ...syntheticOptions].sort((a, b) => {
    const stockDiff = (Number(b?.stock) || 0) - (Number(a?.stock) || 0);
    if (stockDiff !== 0) return stockDiff;
    return String(a?.label || '').localeCompare(String(b?.label || ''), 'fa');
  });
};
