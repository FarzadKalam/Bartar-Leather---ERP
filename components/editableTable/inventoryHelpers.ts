import type { SupabaseClient } from '@supabase/supabase-js';

export const updateProductStock = async (supabase: SupabaseClient, productId: string) => {
  try {
    const { data: rows, error } = await supabase
      .from('product_inventory')
      .select('stock')
      .eq('product_id', productId);
    if (error) throw error;

    const totalStock = (rows || []).reduce((sum: number, row: any) => sum + (parseFloat(row.stock) || 0), 0);
    await supabase.from('products').update({ stock: totalStock }).eq('id', productId);
  } catch (e) {
    console.error(e);
  }
};

export const fetchShelfOptions = async (supabase: SupabaseClient, productId: string) => {
  const { data: rows, error } = await supabase
    .from('product_inventory')
    .select('product_id, shelf_id, stock, shelves(shelf_number), warehouses(name)')
    .eq('product_id', productId)
    .order('stock', { ascending: false });
  if (error) throw error;

  return (rows || []).map((row: any) => {
    const shelfLabel = row?.shelves?.shelf_number || row.shelf_id;
    const warehouseLabel = row?.warehouses?.name ? ` - ${row.warehouses.name}` : '';
    const stockLabel = typeof row.stock === 'number' ? row.stock : parseFloat(row.stock) || 0;
    return {
      value: row.shelf_id,
      label: `${shelfLabel}${warehouseLabel} (موجودی: ${stockLabel})`,
    };
  });
};
