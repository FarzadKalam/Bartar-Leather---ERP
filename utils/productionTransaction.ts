import { supabase } from '../supabaseClient';
import type { InventoryDelta } from './inventoryTransactions';
import { getUnitConversionFactor, normalizeUnitValue } from './unitConversions';
import type { ProductionMove } from './productionWorkflow';

export type OrderChange = {
  id: string;
  revision?: number;
  patch?: Record<string, unknown>;
};
export type TaskChange = {
  id: string;
  previous: unknown;
  shelf: string | null;
  recurrence: unknown;
};

export function prepareProductionMoves(moves: ProductionMove[]) {
  return moves.map((move, index) => {
    if (!move.bundle_id) throw new Error('بستهٔ مبدأ مشخص نشده است.');
    return {
      client_key: move.client_key || String(index),
      product_id: move.product_id, source_shelf_id: move.from_shelf_id, target_shelf_id: move.to_shelf_id,
      source_bundle_id: move.bundle_id,
      target_bundle_id: move.create_new_target_bundle ? crypto.randomUUID() : move.target_bundle_id || move.bundle_id,
      new_bundle: !!move.create_new_target_bundle,
      quantity: move.quantity, unit: move.unit,
      target_bundle_number: null as string | null,
    };
  });
}

type Command = {
  kind: 'deliver' | 'handover' | 'complete' | 'hold' | 'resume' | 'return';
  orders: OrderChange[];
  tasks?: TaskChange[];
  groupId?: string;
  moves?: ReturnType<typeof prepareProductionMoves>;
  transfers?: Record<string, unknown>[];
  deltas?: InventoryDelta[];
};

export async function commitProduction(command: Command) {
  const deltas = command.deltas || [];
  const moves = command.moves || [];
  const ids = [...new Set([...moves.map(m => m.product_id), ...deltas.map(d => d.productId)])];
  const factors: Record<string, number> = {};
  if (ids.length) {
    const fields = 'id,name,main_unit,sub_unit,category,leather_width,lining_width,accessory_width,parent_product_id';
    const { data, error } = await supabase.from('products').select(fields).in('id', ids);
    if (error) throw error;
    const products = new Map((data || []).map(p => [p.id, p]));
    for (const row of [...moves.map(m => ({ id: m.product_id, unit: m.unit })), ...deltas.map(d => ({ id: d.productId, unit: d.unit }))]) {
      const product = products.get(row.id);
      if (!product) throw new Error('محصول مورد نیاز یافت نشد.');
      if (row.unit && product.main_unit && normalizeUnitValue(row.unit) !== normalizeUnitValue(product.main_unit))
        throw new Error('مقدار تحویل باید با واحد اصلی محصول ثبت شود.');
    }
    const parents = [...new Set((data || []).map(p => p.parent_product_id).filter(Boolean))];
    if (parents.length) {
      const parentResult = await supabase.from('products').select(fields).in('id', parents);
      if (parentResult.error) throw parentResult.error;
      for (const p of parentResult.data || []) products.set(p.id, p);
    }
    for (const p of products.values()) {
      const factor = getUnitConversionFactor(p.main_unit, p.sub_unit, { record: p });
      factors[p.id] = Number.isFinite(factor) ? factor : 0;
    }
  }
  const { error } = await supabase.rpc('commit_production_operation', { command: { ...command, factors } });
  if (error?.code === 'PGRST202') throw new Error('نسخهٔ پایگاه داده برای ثبت عملیات جدید تولید آماده نیست.');
  if (error) throw new Error(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i.test(error.message) ? 'ثبت عملیات تولید ناموفق بود. گردش و موجودی بسته‌ها را بررسی کنید.' : error.message);
}
