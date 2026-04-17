import type { SupabaseClient } from '@supabase/supabase-js';
import { convertArea, type UnitValue } from '../../utils/unitConversions';
import { getAllowNegativeInventory } from '../../utils/companySettings';

export const updateProductStock = async (supabase: SupabaseClient, productId: string) => {
  try {
    const { data: rows, error } = await supabase
      .from('product_inventory')
      .select('stock')
      .eq('product_id', productId);
    if (error) throw error;

    const totalStock = (rows || []).reduce((sum: number, row: any) => sum + (parseFloat(row.stock) || 0), 0);
    const { data: productRow } = await supabase
      .from('products')
      .select('main_unit, sub_unit')
      .eq('id', productId)
      .maybeSingle();
    const mainUnit = productRow?.main_unit as UnitValue | undefined;
    const subUnit = productRow?.sub_unit as UnitValue | undefined;
    const subStock = mainUnit && subUnit ? convertArea(totalStock, mainUnit, subUnit) : 0;
    await supabase.from('products').update({ stock: totalStock, sub_stock: subStock }).eq('id', productId);
  } catch (e) {
    console.error(e);
  }
};

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

  const inventoryOptions = (rows || []).map((row: any) => {
    const shelfNumber = row?.shelves?.shelf_number || row?.shelves?.name || row.shelf_id;
    const systemCode = row?.shelves?.system_code || '';
    const warehouseName = row?.shelves?.warehouses?.name || '';
    const shelfLabel = [systemCode, shelfNumber, warehouseName].filter(Boolean).join(' - ');
    const stockLabel = typeof row.stock === 'number' ? row.stock : parseFloat(row.stock) || 0;
    const unitSuffix = productMainUnit ? ` ${productMainUnit}` : '';
    const bundleNumber = row?.product_bundles?.bundle_number || '';
    return {
      value: row.shelf_id,
      label: `${shelfLabel}${bundleNumber ? ` - بسته ${bundleNumber}` : ''} (موجودی: ${stockLabel}${unitSuffix})`,
      stock: stockLabel,
      unit: productMainUnit || null,
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
    (rows || [])
      .filter((row: any) => !row?.bundle_id)
      .map((row: any) => String(row?.shelf_id || ''))
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
