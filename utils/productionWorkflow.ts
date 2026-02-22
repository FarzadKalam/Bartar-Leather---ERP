import { supabase } from '../supabaseClient';
import { convertArea, type UnitValue } from './unitConversions';
import { normalizeQuantityToProductMainUnit } from './inventoryTransactions';

export type ProductionMove = {
  product_id: string;
  from_shelf_id: string;
  to_shelf_id: string;
  quantity: number;
  unit?: string | null;
};

const ITEM_TABLES = ['items_leather', 'items_lining', 'items_fitting', 'items_accessory'];

const getRowUsage = (row: any) => {
  const raw = row?.usage ?? row?.quantity ?? row?.qty ?? row?.count ?? row?.stock ?? 0;
  const num = parseFloat(raw);
  return Number.isFinite(num) ? num : 0;
};

export const collectProductionMoves = (order: any, productionShelfId: string) => {
  const quantity = parseFloat(order?.quantity || 0);
  const moves: ProductionMove[] = [];
  const missingProduct = [] as string[];
  const missingShelf = [] as string[];

  ITEM_TABLES.forEach((table) => {
    const rows = Array.isArray(order?.[table]) ? order[table] : [];
    rows.forEach((row: any, idx: number) => {
      const productId = row?.selected_product_id || row?.product_id;
      const fromShelfId = row?.selected_shelf_id || row?.shelf_id;
      const usage = getRowUsage(row);
      if (usage <= 0) return;
      if (!productId) {
        missingProduct.push(`${table}:${idx}`);
        return;
      }
      if (!fromShelfId) {
        missingShelf.push(`${table}:${idx}`);
        return;
      }
      moves.push({
        product_id: productId,
        from_shelf_id: fromShelfId,
        to_shelf_id: productionShelfId,
        quantity: usage * quantity,
        unit: row?.main_unit ? String(row.main_unit) : null,
      });
    });
  });

  return { moves, missingProduct, missingShelf, quantity };
};

const getShelfWarehouseId = async (shelfId: string) => {
  const { data } = await supabase.from('shelves').select('warehouse_id').eq('id', shelfId).maybeSingle();
  return data?.warehouse_id || null;
};

const productLabelCache = new Map<string, string>();
const shelfLabelCache = new Map<string, string>();

const getProductLabel = async (productId: string) => {
  const cached = productLabelCache.get(productId);
  if (cached) return cached;
  const { data } = await supabase
    .from('products')
    .select('name, system_code')
    .eq('id', productId)
    .maybeSingle();
  const label = data?.system_code
    ? `${String(data?.name || productId)} (${String(data.system_code)})`
    : String(data?.name || productId);
  productLabelCache.set(productId, label);
  return label;
};

const getShelfLabel = async (shelfId: string) => {
  const cached = shelfLabelCache.get(shelfId);
  if (cached) return cached;
  const { data } = await supabase
    .from('shelves')
    .select('shelf_number, name, warehouses(name)')
    .eq('id', shelfId)
    .maybeSingle();
  const shelfNumber = String(data?.shelf_number || data?.name || shelfId);
  const warehouseName = String((data as any)?.warehouses?.name || '');
  const label = warehouseName ? `${shelfNumber} - ${warehouseName}` : shelfNumber;
  shelfLabelCache.set(shelfId, label);
  return label;
};

const adjustStock = async (productId: string, shelfId: string, delta: number, warehouseId?: string | null) => {
  const { data: row, error } = await supabase
    .from('product_inventory')
    .select('id, stock, warehouse_id')
    .eq('product_id', productId)
    .eq('shelf_id', shelfId)
    .maybeSingle();

  if (error) throw error;

  const current = parseFloat(row?.stock) || 0;
  const next = current + delta;
  if (next < 0) {
    const [productLabel, shelfLabel] = await Promise.all([
      getProductLabel(productId),
      getShelfLabel(shelfId),
    ]);
    throw new Error(
      `موجودی قفسه کافی نیست. محصول: "${productLabel}"، قفسه: "${shelfLabel}"، موجودی فعلی: ${current}، مقدار موردنیاز: ${Math.abs(delta)}`
    );
  }

  const payload = {
    product_id: productId,
    shelf_id: shelfId,
    warehouse_id: warehouseId ?? row?.warehouse_id ?? null,
    stock: next,
  };

  const { error: upsertError } = await supabase
    .from('product_inventory')
    .upsert(payload, { onConflict: 'product_id,shelf_id' });
  if (upsertError) throw upsertError;
};

export const applyProductionMoves = async (moves: ProductionMove[]) => {
  const productMetaCache = new Map<string, { mainUnit: string | null; name: string | null }>();
  const decisionCache = new Map<string, boolean>();
  const normalizedMoves: ProductionMove[] = [];
  for (const move of moves || []) {
    const normalizedQty = await normalizeQuantityToProductMainUnit(
      supabase as any,
      {
        productId: move.product_id,
        quantity: move.quantity,
        unit: move.unit ?? null,
      },
      { productMetaCache, decisionCache }
    );
    if (!normalizedQty) continue;
    normalizedMoves.push({ ...move, quantity: normalizedQty });
  }

  const grouped = new Map<string, ProductionMove>();
  normalizedMoves.forEach((move) => {
    const key = `${move.product_id}:${move.from_shelf_id}:${move.to_shelf_id}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += move.quantity;
    } else {
      grouped.set(key, { ...move });
    }
  });

  const groupedMoves = Array.from(grouped.values());
  for (const move of groupedMoves) {
    await adjustStock(move.product_id, move.from_shelf_id, -move.quantity);
    const destWarehouseId = await getShelfWarehouseId(move.to_shelf_id);
    await adjustStock(move.product_id, move.to_shelf_id, move.quantity, destWarehouseId);
  }
};

export const rollbackProductionMoves = async (moves: ProductionMove[]) => {
  const reversed = moves.map((move) => ({
    ...move,
    from_shelf_id: move.to_shelf_id,
    to_shelf_id: move.from_shelf_id,
  }));
  await applyProductionMoves(reversed);
};

export const consumeProductionMaterials = async (moves: ProductionMove[], productionShelfId?: string) => {
  const productMetaCache = new Map<string, { mainUnit: string | null; name: string | null }>();
  const decisionCache = new Map<string, boolean>();
  const grouped = new Map<string, number>();
  for (const move of moves || []) {
    const normalizedQty = await normalizeQuantityToProductMainUnit(
      supabase as any,
      {
        productId: move.product_id,
        quantity: move.quantity,
        unit: move.unit ?? null,
      },
      { productMetaCache, decisionCache }
    );
    if (!normalizedQty) continue;
    const targetShelfId = move?.to_shelf_id || productionShelfId;
    if (!targetShelfId) continue;
    const key = `${move.product_id}:${targetShelfId}`;
    grouped.set(key, (grouped.get(key) || 0) + normalizedQty);
  }
  for (const [key, qty] of grouped.entries()) {
    const [productId, shelfId] = key.split(':');
    await adjustStock(productId, shelfId, -qty);
  }
};

export const addFinishedGoods = async (productId: string, shelfId: string, quantity: number) => {
  const warehouseId = await getShelfWarehouseId(shelfId);
  await adjustStock(productId, shelfId, quantity, warehouseId);
};

export const syncProductStock = async (productId: string) => {
  const { data, error } = await supabase
    .from('product_inventory')
    .select('stock')
    .eq('product_id', productId);
  if (error) throw error;
  const totalStock = (data || []).reduce((sum: number, row: any) => sum + (parseFloat(row.stock) || 0), 0);
  const { data: productRow } = await supabase
    .from('products')
    .select('main_unit, sub_unit')
    .eq('id', productId)
    .maybeSingle();
  const mainUnit = productRow?.main_unit as UnitValue | undefined;
  const subUnit = productRow?.sub_unit as UnitValue | undefined;
  const subStock = mainUnit && subUnit ? convertArea(totalStock, mainUnit, subUnit) : 0;
  const { error: updateError } = await supabase
    .from('products')
    .update({ stock: totalStock, sub_stock: subStock })
    .eq('id', productId);
  if (updateError) throw updateError;
};




