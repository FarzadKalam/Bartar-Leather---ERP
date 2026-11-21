import { bomRouteGroups } from './bomGroupRoutes';
import { attachRoutes, finishedShelf, planIssue, stageKey, warehouse, type PlanStage, type PlannedTransfer } from './productionStagePlan';

export interface BomExcelRoute {
  code: string;
  kind: string;
  reference: string;
  name: string;
  from: string;
  to: string;
  quantity: number | null;
  unit: string;
}

// Routing quantities are independent at each station. Only material rows own material consumption.
export function importBomRoutes(stages: PlanStage[], materials: any[], rows: BomExcelRoute[]): PlanStage[] {
  const stations = new Map<string, string>([['انبار', warehouse], ['قفسهٔ خروجی', finishedShelf]]);
  stages.forEach((stage, index) => {
    const name = String(stage.name || stage.title || '').trim();
    if (!name || stations.has(name)) throw new Error('نام مرحله خالی یا تکراری است: ' + name);
    stations.set(name, stageKey(stage, index));
  });
  const groups = bomRouteGroups(materials);
  const references = new Map<string, { group: typeof groups[number]; item: typeof groups[number]['raw'] }>();
  function addReference(code: string, group: typeof groups[number], item: typeof group.raw) {
    if (!code) return;
    if (references.has(code)) throw new Error('کد گروه یا قطعه در مواد اولیه تکراری است: ' + code);
    references.set(code, { group, item });
  }
  materials.forEach((material, index) => {
    const group = groups[index];
    addReference(String(material.header?.bom_code || '').trim(), group, group.raw);
    (material.pieces || []).forEach((piece: any) => {
      const item = group.pieces.find(candidate => candidate.key === JSON.stringify([
        JSON.parse(group.raw.key)[0], String(piece.key ?? piece.id),
      ]));
      if (item) addReference(String(piece.bom_code || '').trim(), group, item);
    });
  });
  const codes = new Set<string>();
  const routes: PlannedTransfer[] = rows.map((row, index) => {
    const label = 'گردش قطعات، ردیف ' + (index + 2).toLocaleString('fa-IR') + ' — ';
    if (!row.code || codes.has(row.code)) throw new Error(label + 'کد مسیر خالی یا تکراری است.');
    codes.add(row.code);
    const from = stations.get(row.from), to = stations.get(row.to);
    if (!from || !to) throw new Error(label + 'مبدأ یا مقصد در فهرست مراحل تعریف نشده است.');
    const reference = references.get(row.reference);
    const linked = row.kind === 'مصرف ماده' || row.kind === 'قطعه شناسنامه';
    if (!linked && row.kind !== 'خروجی مرحله') throw new Error(label + 'نوع مسیر معتبر نیست.');
    if (linked && !reference) throw new Error(label + 'کد مرجع شناسنامه پیدا نشد.');
    if (reference?.group.issue) throw new Error(label + reference.group.issue);
    const raw = reference?.item === reference?.group.raw;
    if (linked && ((row.kind === 'مصرف ماده') !== raw)) throw new Error(label + 'نوع مسیر با کد مرجع گروه یا قطعه سازگار نیست.');
    if (row.kind === 'مصرف ماده' && from !== warehouse) throw new Error(label + 'مبدأ مصرف ماده باید انبار باشد.');
    if (row.kind === 'خروجی مرحله' && row.reference && (!reference || !raw))
      throw new Error(label + 'مرجع خروجی کلی باید کد گروه مواد یا خالی باشد.');
    const quantity = linked ? reference!.item.quantity : row.quantity;
    const unit = linked ? reference!.item.unit : row.unit;
    if (!quantity || !Number.isFinite(quantity) || quantity <= 0 || !unit) throw new Error(label + 'مقدار مثبت و واحد لازم است.');
    if (unit === 'عدد' && !Number.isInteger(quantity)) throw new Error(label + 'تعداد قطعه باید صحیح باشد.');
    if (!linked && !row.name) throw new Error(label + 'نام خروجی مرحله لازم است.');
    return {
      id: crypto.randomUUID(), routeCode: row.code, from, to,
      material: linked ? reference!.item.key : 'output:' + row.code,
      materialName: reference?.group.raw.name || '',
      state: linked ? reference!.item.name : row.name,
      mode: row.kind === 'مصرف ماده' ? 'bulk' : 'piece', unit, perItem: quantity,
      ...(reference ? { bomGroup: reference.group.raw.key } : {}),
      ...(!linked && reference ? { bomIntermediate: true } : {}),
    };
  });
  const issue = planIssue(stages, routes);
  if (issue) throw new Error(issue);
  return attachRoutes(stages, routes);
}
