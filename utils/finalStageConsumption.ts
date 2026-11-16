import { asNumber, getDeliveryMainQuantity, resolveDeliveryType } from './productionDeliveryRows';
import { isUseSourceBundleValue, isCreateNewBundleValue } from './productionBundles';
import type { ProductionMove } from './productionWorkflow';

// Forms belong to one task but can describe a receipt at another task.
export function finalStageConsumption(tasks: any[]): ProductionMove[] | null {
  const lastByLine = new Map<string, any>();
  for (const task of tasks) {
    const line = String(task.production_line_id || '');
    const last = lastByLine.get(line);
    if (!last || Number(task.sort_order || 0) > Number(last.sort_order || 0)) lastByLine.set(line, task);
  }
  const finalIds = new Set([...lastByLine.values()].map(task => task.id));
  const balances = new Map<string, ProductionMove>();
  let hasHistory = false;

  function add(product: string, shelf: string, bundle: string, quantity: number, unit?: string) {
    if (!quantity) return;
    if (!product || !shelf || !bundle || isCreateNewBundleValue(bundle)) throw new Error('اطلاعات محصول، قفسه یا بستهٔ فرم تحویل ناقص است.');
    const key = [product, shelf, bundle].join(':');
    const previous = balances.get(key);
    if (previous) previous.quantity += quantity;
    else balances.set(key, { product_id: product, from_shelf_id: shelf, to_shelf_id: shelf, bundle_id: bundle, quantity, unit });
  }

  for (const task of tasks) {
    const recurrence = typeof task.recurrence_info === 'string' ? JSON.parse(task.recurrence_info) : task.recurrence_info;
    const history = recurrence?.production_handover;
    const forms = history?.forms?.length ? history.forms : history?.groups?.length ? [history] : [];
    for (const form of forms) {
      if (!form.groups?.length) continue;
      hasHistory = true;
      const outgoing = form.direction === 'outgoing' || (!form.direction && form.sourceTaskId === task.id);
      const debit = finalIds.has(form.sourceTaskId || (outgoing ? task.id : null));
      const credit = finalIds.has(form.destinationTaskId || (!outgoing ? task.id : null));
      if (!debit && !credit) continue;
      const sourceShelf = form.sourceShelfId || (outgoing ? task.production_shelf_id : null);
      const targetShelf = form.targetShelfId || form.target_shelf_id || (!outgoing ? task.production_shelf_id : null);
      const sources = new Map<string, Set<string>>();
      for (const group of form.groups) {
        const pieces = Array.isArray(group.pieces) ? group.pieces : [];
        const rows = group.deliveryRows?.length ? group.deliveryRows : pieces;
        const piece = pieces.find((p: any) => p.selectedProductId || p.selected_product_id || p.product_id) || pieces[0];
        for (const row of rows) {
          const product = group.selectedProductId || group.selected_product_id || row.selectedProductId || row.selected_product_id || row.product_id || piece?.selectedProductId || piece?.selected_product_id || piece?.product_id;
          const source = row.sourceBundleId || row.source_bundle_id || row.bundle_id || group.sourceBundleId || group.source_bundle_id || group.bundle_id;
          const target = row.targetBundleId || row.target_bundle_id || group.targetBundleId || group.target_bundle_id;
          const qty = group.deliveryRows?.length ? getDeliveryMainQuantity(row, resolveDeliveryType(row.deliveryType || row.delivery_type ? row : group)) : asNumber(row.handoverQty ?? row.handover_qty ?? row.sourceQty ?? row.source_qty);
          const unit = row.mainUnit || row.main_unit || piece?.mainUnit || piece?.main_unit;
          if (credit) add(product, targetShelf, !target || isUseSourceBundleValue(target) ? source : target, qty, unit);
          if (debit) {
            add(product, sourceShelf, source, -qty, unit);
            if (!sources.has(product)) sources.set(product, new Set());
            if (source) sources.get(product)!.add(source);
          }
        }
      }
      if (debit) for (const [product, amount] of Object.entries(form.wasteByProduct || {})) {
        const candidates = [...(sources.get(product) || [])];
        const bundle = form.wasteBundleByProduct?.[product] || (candidates.length === 1 ? candidates[0] : null);
        add(product, sourceShelf, bundle, -asNumber(amount));
      }
    }
  }
  if (!hasHistory) return null; // Orders created before handover forms use their saved movements.
  const rows = [...balances.values()];
  if (rows.some(row => row.quantity < -1e-9)) throw new Error('خروج ثبت‌شده از دریافت مرحله بیشتر است. فرم‌های تحویل را بررسی کنید.');
  return rows.filter(row => row.quantity > 1e-9);
}
