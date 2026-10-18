import { supabase } from '../supabaseClient';
import { convertArea, type UnitValue } from './unitConversions';
import { normalizeQuantityToProductMainUnit } from './inventoryTransactions';
import { getAllowNegativeInventory } from './companySettings';

export type ProductionMove = {
  product_id: string;
  from_shelf_id: string;
  to_shelf_id: string;
  // شناسه قدیمی bundle_id همچنان بسته مبدأ است تا داده‌های قبلی سازگار بمانند.
  bundle_id?: string | null;
  target_bundle_id?: string | null;
  create_new_target_bundle?: boolean;
  client_key?: string;
  quantity: number;
  unit?: string | null;
};

export type ProductionMoveResult = {
  client_key: string;
  source_bundle_id: string;
  target_bundle_id: string;
  target_bundle_number?: string | null;
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
  const missingBundle = [] as string[];

  ITEM_TABLES.forEach((table) => {
    const rows = Array.isArray(order?.[table]) ? order[table] : [];
    rows.forEach((row: any, idx: number) => {
      const productId = row?.selected_product_id || row?.product_id;
      const fromShelfId = row?.selected_shelf_id || row?.shelf_id;
      const bundleId = row?.source_bundle_id || row?.bundle_id || null;
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
      if (!bundleId) {
        missingBundle.push(`${table}:${idx}`);
        return;
      }
      moves.push({
        product_id: productId,
        from_shelf_id: fromShelfId,
        to_shelf_id: productionShelfId,
        bundle_id: String(bundleId),
        quantity: usage * quantity,
        unit: row?.main_unit ? String(row.main_unit) : null,
      });
    });
  });

  return { moves, missingProduct, missingShelf, missingBundle, quantity };
};

const getShelfWarehouseId = async (shelfId: string) => {
  const { data } = await supabase.from('shelves').select('warehouse_id').eq('id', shelfId).maybeSingle();
  return data?.warehouse_id || null;
};

const productLabelCache = new Map<string, string>();
const shelfLabelCache = new Map<string, string>();
const bundleLabelCache = new Map<string, string>();

const getBundleLabel = async (bundleId?: string | null) => {
  if (!bundleId) return 'بدون بسته';
  const normalizedId = String(bundleId);
  const cached = bundleLabelCache.get(normalizedId);
  if (cached) return cached;
  const { data } = await supabase
    .from('product_bundles')
    .select('bundle_number')
    .eq('id', normalizedId)
    .maybeSingle();
  const label = String(data?.bundle_number || normalizedId);
  bundleLabelCache.set(normalizedId, label);
  return label;
};

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

const adjustStock = async (
  productId: string,
  shelfId: string,
  delta: number,
  warehouseId?: string | null,
  bundleId?: string | null,
  options?: { allowNegativeStock?: boolean }
) => {
  const normalizedBundleId = bundleId ? String(bundleId) : null;
  const scopedQuery = normalizedBundleId
    ? supabase
      .from('product_inventory')
      .select('id, stock, warehouse_id')
      .eq('product_id', productId)
      .eq('shelf_id', shelfId)
      .eq('bundle_id', normalizedBundleId)
      .maybeSingle()
    : supabase
      .from('product_inventory')
      .select('id, stock, warehouse_id')
      .eq('product_id', productId)
      .eq('shelf_id', shelfId)
      .is('bundle_id', null)
      .maybeSingle();
  const { data: scopedRow, error: scopedError } = await scopedQuery;
  if (scopedError) throw scopedError;

  const current = parseFloat(scopedRow?.stock) || 0;
  const next = current + delta;
  const allowNegativeStock = typeof options?.allowNegativeStock === 'boolean'
    ? options.allowNegativeStock
    : await getAllowNegativeInventory(supabase as any);
  if (!allowNegativeStock && next < 0) {
    const [productLabel, shelfLabel, bundleLabel] = await Promise.all([
      getProductLabel(productId),
      getShelfLabel(shelfId),
      getBundleLabel(normalizedBundleId),
    ]);
    throw new Error(
      `موجودی بسته کافی نیست. محصول: "${productLabel}"، بسته: "${bundleLabel}"، قفسه: "${shelfLabel}"، موجودی فعلی: ${current}، مقدار موردنیاز: ${Math.abs(delta)}`
    );
  }

  if (scopedRow?.id) {
    const { error: updateError } = await supabase
      .from('product_inventory')
      .update({
        warehouse_id: warehouseId ?? scopedRow?.warehouse_id ?? null,
        stock: next,
      })
      .eq('id', scopedRow.id);
    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await supabase
    .from('product_inventory')
    .insert({
      product_id: productId,
      shelf_id: shelfId,
      bundle_id: normalizedBundleId,
      warehouse_id: warehouseId ?? null,
      stock: next,
    });
  if (insertError) throw insertError;
};

export const applyProductionMoves = async (moves: ProductionMove[]): Promise<ProductionMoveResult[]> => {
  const allowNegativeStock = await getAllowNegativeInventory(supabase as any);
  const productMetaCache = new Map<string, { mainUnit: string | null; name: string | null }>();
  const decisionCache = new Map<string, boolean>();
  const normalizedMoves: ProductionMove[] = [];
  for (const move of moves || []) {
    if (!move?.bundle_id) {
      throw new Error('برای برداشت یا جابه‌جایی مواد در تولید، بسته محصول الزامی است.');
    }
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

  if (!normalizedMoves.length) return [];

  // کم‌کردن موجودی مبدأ، ساخت بسته مقصد و افزودن موجودی مقصد باید یک تراکنش واحد باشد؛
  // در غیر این صورت شکست یکی از درخواست‌ها موجودی را نیمه‌کاره باقی می‌گذارد.
  const payload = normalizedMoves.map((move, index) => ({
    client_key: move.client_key || `production_move_${index}`,
    product_id: move.product_id,
    source_shelf_id: move.from_shelf_id,
    target_shelf_id: move.to_shelf_id,
    source_bundle_id: move.bundle_id,
    target_bundle_id: move.target_bundle_id || null,
    create_new_bundle: move.create_new_target_bundle === true,
    quantity: move.quantity,
  }));
  const { data, error } = await (supabase as any).rpc('apply_production_bundle_moves', {
    p_moves: payload,
    p_allow_negative: allowNegativeStock,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as ProductionMoveResult[];
};

export const rollbackProductionMoves = async (moves: ProductionMove[]) => {
  const reversed = moves.map((move) => ({
    ...move,
    from_shelf_id: move.to_shelf_id,
    to_shelf_id: move.from_shelf_id,
    bundle_id: move.target_bundle_id || move.bundle_id,
    target_bundle_id: move.bundle_id || null,
    create_new_target_bundle: false,
  }));
  await applyProductionMoves(reversed);
};

export const consumeProductionMaterials = async (moves: ProductionMove[], productionShelfId?: string) => {
  const allowNegativeStock = await getAllowNegativeInventory(supabase as any);
  const productMetaCache = new Map<string, { mainUnit: string | null; name: string | null }>();
  const decisionCache = new Map<string, boolean>();
  const grouped = new Map<string, number>();
  for (const move of moves || []) {
    const productionBundleId = move?.target_bundle_id || move?.bundle_id;
    if (!productionBundleId) {
      throw new Error('برای مصرف مواد در تولید، بسته محصول الزامی است.');
    }
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
    const key = `${move.product_id}:${targetShelfId}:${productionBundleId || '__null__'}`;
    grouped.set(key, (grouped.get(key) || 0) + normalizedQty);
  }
  for (const [key, qty] of grouped.entries()) {
    const [productId, shelfId, bundleKey] = key.split(':');
    await adjustStock(productId, shelfId, -qty, undefined, bundleKey === '__null__' ? null : bundleKey, { allowNegativeStock });
  }
};

export const addFinishedGoods = async (productId: string, shelfId: string, quantity: number, bundleId?: string | null) => {
  const warehouseId = await getShelfWarehouseId(shelfId);
  await adjustStock(productId, shelfId, quantity, warehouseId, bundleId);
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
    .select('main_unit, sub_unit, category, leather_width, lining_width, accessory_width')
    .eq('id', productId)
    .maybeSingle();
  const mainUnit = productRow?.main_unit as UnitValue | undefined;
  const subUnit = productRow?.sub_unit as UnitValue | undefined;
  const computedSubStock = mainUnit && subUnit
    ? convertArea(totalStock, mainUnit, subUnit, { record: productRow as any })
    : 0;
  const subStock = Number.isFinite(computedSubStock) ? computedSubStock : 0;
  const { error: updateError } = await supabase
    .from('products')
    .update({ stock: totalStock, sub_stock: subStock })
    .eq('id', productId);
  if (updateError) throw updateError;
};




