export const warehouse = 'warehouse';
export const finishedShelf = 'finished-shelf';

export interface PlannedTransfer {
  id: string;
  from: string;
  to: string;
  material: string;
  materialName: string;
  state: string;
  mode: 'bulk' | 'piece';
  unit: string;
  perItem: number;
  bomGroup?: string;
}

export interface PlanStage {
  id?: string | number;
  name?: string;
  title?: string;
  sort_order?: number;
  materialRoutes?: PlannedTransfer[];
}

export function stageKey(stage: PlanStage, index: number) {
  return String(stage.id ?? ('legacy-stage-' + index));
}

export function materialGroupKey(row: any, index: number) {
  return String(row.key ?? row.id ?? (row.header || row).selected_product_id ?? index);
}

export function materialChoices(materials: any[]) {
  const choices: {value: string; label: string; unit: string}[] = [];
  const categories: Record<string,string> = {leather:'چرم', lining:'آستر', fitting:'یراق', accessory:'خرجکار'};
  for (const [i, row] of materials.entries()) {
    const header = row.header || row;
    const key = materialGroupKey(row,i);
    const label = header.selected_product_name || row.product_name || categories[header.category] || ('مادهٔ ' + (i + 1).toLocaleString('fa-IR'));
    const unit = header.selected_product_main_unit || header.main_unit || row.pieces?.[0]?.main_unit || 'عدد';
    choices.push({value:JSON.stringify([key]), label, unit});
    for (const [j, piece] of (row.pieces || []).entries()) {
      if (piece.name?.trim()) choices.push({value:JSON.stringify([key,String(piece.key ?? piece.id ?? j)]), label:label + ' / ' + piece.name, unit:'عدد'});
    }
  }
  return choices;
}

export function planIssue(stages: PlanStage[], routes: PlannedTransfer[]) {
  const ids = new Set(stages.map(stageKey));
  const edges = new Map<string,string[]>();
  const seen = new Set<string>();
  for (const r of routes) {
    if ((!ids.has(r.from) && r.from !== warehouse) || (!ids.has(r.to) && r.to !== finishedShelf) ||
        (r.from === warehouse && r.to === finishedShelf)) return 'مبدأ و مقصد باید به یک مرحلهٔ تولید متصل باشند.';
    if (!r.state.trim() || !r.unit || !Number.isFinite(r.perItem) || r.perItem <= 0) return 'شکل قطعه، واحد و مقدار مثبت به‌ازای یک محصول را وارد کنید.';
    const key = JSON.stringify([r.from,r.to,r.material,r.state.trim(),r.unit,r.mode]);
    if (seen.has(key)) return 'این ردیف قبلاً تعریف شده است. مقدار همان ردیف را ویرایش کنید.';
    seen.add(key);
    if (!edges.has(r.from)) edges.set(r.from, []);
    edges.get(r.from)!.push(r.to);
  }
  const visiting = new Set<string>(), done = new Set<string>();
  function circular(id: string): boolean {
    if (visiting.has(id)) return true;
    if (done.has(id)) return false;
    visiting.add(id);
    if ((edges.get(id) || []).some(circular)) return true;
    visiting.delete(id);
    done.add(id);
    return false;
  }
  return [...ids].some(circular) ? 'مسیر عادی تولید نمی‌تواند به خودش برگردد.' : null;
}

// One stored row supplies both the sending stage’s output and the receiving stage’s input.
export function attachRoutes<T extends PlanStage>(stages: T[], routes: PlannedTransfer[]) {
  const grouped = new Map<string,PlannedTransfer[]>();
  for (const route of routes) {
    const owner = route.from === warehouse ? route.to : route.from;
    if (!grouped.has(owner)) grouped.set(owner, []);
    grouped.get(owner)!.push(route);
  }
  return stages.map((stage,i) => ({...stage, id:stage.id ?? stageKey(stage,i), materialRoutes:grouped.get(stageKey(stage,i)) || []}));
}

export function expectedAmount(route: PlannedTransfer, quantity: number) {
  return Number((route.perItem * quantity).toFixed(9));
}
