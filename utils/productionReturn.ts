import type { ProductionMove } from './productionWorkflow';

type Lot = { shelf: string; bundle: string; qty: number };
const epsilon = 1e-9;
const historyError = () => new Error('سابقهٔ گردش برای تعیین مبدأ مانده کافی نیست. حواله‌ها و بسته‌های این سفارش را بررسی کنید.');

// Replay order-specific transfers, keeping the origin attached through each change of shelf or bundle.
export function planProductionReturn(initial: ProductionMove[], logs: any[]): ProductionMove[] {
  const positions = new Map<string, Lot[]>();
  const opening = new Map<string, number>();
  const signature = (p: string, from: string, to: string, src: string, dst: string) => [p, from, to, src, dst].join(':');
  for (const m of initial) {
    const key = signature(m.product_id, m.from_shelf_id, m.to_shelf_id, m.bundle_id!, m.target_bundle_id || m.bundle_id!);
    opening.set(key, (opening.get(key) || 0) + Number(m.quantity));
  }
  function deposit(key: string, lot: Lot) {
    const lots = positions.get(key) || [];
    const existing = lots.find(x => x.shelf === lot.shelf && x.bundle === lot.bundle);
    if (existing) existing.qty += lot.qty;
    else lots.push(lot);
    positions.set(key, lots);
  }
  const wasteBin = 'waste';
  for (const log of logs) {
    const p = log.product_id, from = log.from_shelf_id, to = log.to_shelf_id;
    const src = log.source_bundle_id || log.bundle_id, dst = log.target_bundle_id || log.bundle_id;
    const qty = Number(log.delivered_qty);
    if (!Number.isFinite(qty) || qty <= 0 || !p || !(src && dst)) throw historyError();
    const key = signature(p, from, to, src, dst);
    const expected = opening.get(key) || 0;
    const originKey = [p, from, src].join(':');
    const targetKey = [p, to, dst].join(':');
    // Ambiguous histories must never borrow material from another order.
    const external = log.stage_task_id && !log.source_task_id && log.destination_task_id && !log.notes;
    if (external) {
      deposit(targetKey, { shelf: from, bundle: src, qty });
      continue;
    }
    if (expected + epsilon >= qty && expected > epsilon) {
      if ((positions.get(originKey) || []).some(l => l.qty > epsilon)) throw historyError();
      opening.set(key, expected - qty);
      deposit(targetKey, { shelf: from, bundle: src, qty });
      continue;
    }
    const wasteKey = [wasteBin, p, from || to, src].join(':');
    const lots = (positions.get(from ? originKey : wasteKey) || []).filter(x => x.qty > epsilon);
    const total = lots.reduce((sum, l) => sum + l.qty, 0);
    if (total + epsilon < qty || (lots.length > 1 && total - qty > epsilon)) throw historyError();
    let remaining = qty;
    for (const lot of lots) {
      const taken = Math.min(remaining, lot.qty);
      if (taken <= epsilon) break;
      lot.qty -= taken;
      remaining -= taken;
      deposit(to ? targetKey : wasteKey, { ...lot, qty: taken });
    }
  }
  if ([...opening.values()].some(qty => qty > epsilon)) throw historyError();
  const result: ProductionMove[] = [];
  for (const [key, lots] of positions) {
    const [product, shelf, bundle] = key.split(':');
    if (product === wasteBin) continue;
    for (const lot of lots) if (lot.qty > epsilon && (shelf !== lot.shelf || bundle !== lot.bundle)) {
      result.push({ product_id: product, from_shelf_id: shelf, to_shelf_id: lot.shelf, bundle_id: bundle, target_bundle_id: lot.bundle, quantity: lot.qty });
    }
  }
  // Relocate an intact origin bundle before merging split lots back into it.
  return result.sort((a, b) => Number(b.bundle_id === b.target_bundle_id) - Number(a.bundle_id === a.target_bundle_id));
}
