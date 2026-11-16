import { finishedShelf, warehouse, type PlanStage, type PlannedTransfer, stageKey } from './productionStagePlan';

export interface StageLot {
  id: string;
  routeId: string;
  stageId: string;
  label: string;
  unit: string;
  bundle: string;
  shelf: string;
  quantity: number;
  resultId?: string;
}
export interface ResultInput { lotId: string; used: number; waste: number }
export interface ResultOutput { routeId: string; quantity: number }
export interface StageResult {
  id: string;
  revision: number;
  stageId: string;
  authorId: string;
  status: 'draft' | 'confirmed' | 'rejected';
  inputs: ResultInput[];
  outputs: ResultOutput[];
  approvals: { stageId: string; userId?: string; at?: string }[];
  createdAt: string;
  confirmedAt?: string;
  rejection?: string;
}
export interface StageExecution {
  revision: number;
  lots: StageLot[];
  results: StageResult[];
}
export type ResultCommand =
  | { kind: 'save'; id: string; revision?: number; stageId: string; inputs: ResultInput[]; outputs: ResultOutput[] }
  | { kind: 'approve'; id: string; revision: number }
  | { kind: 'reject'; id: string; revision: number; reason: string };
export interface StageOperator { id: string; stageIds: string[] }
const epsilon = 1e-9;
const round = (value: number) => Number(value.toFixed(9));
function fail(message: string): never { throw new Error(message); }
const validQuantity = (n: number) => Number.isFinite(n) && n >= 0;
export function plannedRoutes(stages: PlanStage[]) {
  return stages.flatMap(stage => stage.materialRoutes || []);
}
export function resultInputBalance(lot: StageLot, input: ResultInput) {
  return round(lot.quantity - input.used - input.waste);
}
export function pendingQuantity(state: StageExecution, lotId: string, exceptId?: string) {
  return round(state.results.filter(r => r.status === 'draft' && r.id !== exceptId)
    .flatMap(r => r.inputs).filter(i => i.lotId === lotId).reduce((sum,i) => sum + i.used + i.waste, 0));
}

/** Immutable transition. The caller must persist the returned state atomically against its revision. */
export function applyStageResult(
  state: StageExecution, stages: PlanStage[], actor: StageOperator, command: ResultCommand, at: string,
): StageExecution {
  if (!actor.id || !at || Number.isNaN(Date.parse(at))) fail('ثبت‌کننده یا زمان ثبت معتبر نیست.');
  const routes = new Map(plannedRoutes(stages).map(route => [route.id,route]));
  const result = state.results.find(r => r.id === command.id);
  if (!command.id) fail('سند نتیجه مشخص نشده است.');
  if (result && (result.revision !== command.revision || result.status !== 'draft')) fail('این نتیجه تغییر کرده یا قطعی شده است. اطلاعات را تازه کنید.');
  if (command.kind === 'save') {
    if ((!result && command.revision !== undefined) || (result && result.authorId !== actor.id)) fail('اجازهٔ ویرایش این نتیجه را ندارید.');
    if (!actor.stageIds.includes(command.stageId) || (result && result.stageId !== command.stageId) ||
        !stages.some((s,i) => stageKey(s,i) === command.stageId)) fail('این ایستگاه در اختیار شما نیست.');
    const seenInputs = new Set<string>();
    const inputs = command.inputs.filter(i => i.used !== 0 || i.waste !== 0).map(i => ({...i}));
    if (!inputs.length) fail('حداقل یک ورودی مصرف‌شده یا ضایعات را ثبت کنید.');
    for (const input of inputs) {
      const lot = state.lots.find(l => l.id === input.lotId);
      if (!lot || lot.stageId !== command.stageId || seenInputs.has(input.lotId) ||
          routes.get(lot.routeId)?.to !== command.stageId) fail('بستهٔ ورودی این مرحله معتبر نیست.');
      if (!validQuantity(input.used) || !validQuantity(input.waste) ||
          resultInputBalance(lot,input) - pendingQuantity(state,lot.id,result?.id) < -epsilon) fail('مصرف و ضایعات از ماندهٔ آزاد بسته بیشتر است.');
      if (routes.get(lot.routeId)?.mode === 'piece' && (!Number.isInteger(input.used) || !Number.isInteger(input.waste))) {
        fail('مصرف و ضایعات قطعه‌ای باید تعداد صحیح باشند.');
      }
      seenInputs.add(input.lotId);
    }
    const seenOutputs = new Set<string>();
    const outputs = command.outputs.filter(o => o.quantity !== 0).map(o => ({...o}));
    if (!outputs.length) fail('خروجی سالم را وارد کنید.');
    if (!inputs.some(i => i.used > 0)) fail('برای خروجی سالم، مصرف ورودی را ثبت کنید.');
    const destinations = new Set<string>();
    for (const output of outputs) {
      const route = routes.get(output.routeId);
      if (!route || route.from !== command.stageId || seenOutputs.has(output.routeId)) fail('مسیر خروجی این مرحله معتبر نیست.');
      if (!validQuantity(output.quantity) || (route.mode === 'piece' && !Number.isInteger(output.quantity))) fail('تعداد خروجی قطعه‌ای باید عدد صحیح مثبت باشد.');
      if (route.to === warehouse || route.to === command.stageId) fail('مقصد خروجی معتبر نیست.');
      if (route.to !== finishedShelf && !stages.some((s,i) => stageKey(s,i) === route.to)) fail('مرحلهٔ مقصد یافت نشد.');
      seenOutputs.add(output.routeId);
      destinations.add(route.to);
    }
    const finalOutputs = outputs.filter(o => routes.get(o.routeId)?.to === finishedShelf);
    if (finalOutputs.length) {
      const productCount = finalOutputs.reduce((sum,output) => sum + output.quantity / routes.get(output.routeId)!.perItem,0);
      for (const route of routes.values()) {
        if (route.to !== command.stageId) continue;
        const used = inputs.filter(i => state.lots.find(l => l.id === i.lotId)?.routeId === route.id)
          .reduce((sum,i) => sum+i.used,0);
        if (used + epsilon < productCount*route.perItem) fail('برای تعداد پک کامل، همهٔ اقلام شناسنامه به مقدار کافی مصرف نشده‌اند.');
      }
    }
    const next: StageResult = { id:command.id, revision:(result?.revision || 0) + 1, stageId:command.stageId,
      authorId:actor.id, status:'draft', inputs, outputs,
      approvals:[...destinations].map(stageId => ({stageId})), createdAt:result?.createdAt || at };
    return { ...state, revision:state.revision+1, results:result ? state.results.map(r => r.id === result.id ? next : r) : [...state.results,next] };
  }
  if (!result) fail('نتیجه یافت نشد.');
  const approval = result.approvals.find(a => actor.stageIds.includes(a.stageId) && !a.userId);
  if (actor.id === result.authorId || !approval) fail('تأیید یا رد باید توسط تحویل‌گیرندهٔ تعیین‌شده انجام شود.');
  if (command.kind === 'reject') {
    if (!command.reason.trim()) fail('علت رد را وارد کنید.');
    return {...state, revision:state.revision+1, results:state.results.map(r => r.id === result.id
      ? {...r, revision:r.revision+1, status:'rejected', rejection:command.reason.trim()} : r)};
  }
  const approvals = result.approvals.map(a => a.stageId === approval.stageId ? {...a,userId:actor.id,at} : {...a});
  const confirmed = approvals.every(a => a.userId);
  let lots = state.lots;
  if (confirmed) {
    lots = state.lots.map(l => ({...l}));
    for (const input of result.inputs) {
      const lot = lots.find(l => l.id === input.lotId);
      if (!lot || lot.stageId !== result.stageId || resultInputBalance(lot,input) < -epsilon) fail('موجودی ورودی تغییر کرده است. نتیجه باید دوباره بررسی شود.');
      lot.quantity = Math.max(0,resultInputBalance(lot,input));
    }
    for (const [index,output] of result.outputs.entries()) {
      const route = routes.get(output.routeId);
      if (!route || route.from !== result.stageId) fail('مسیر شناسنامه تغییر کرده است.');
      lots.push({id:result.id + '/' + index, routeId:route.id, stageId:route.to, label:route.state, unit:route.unit,
        quantity:output.quantity, resultId:result.id, bundle:'بستهٔ خروجی ' + (state.results.indexOf(result)+1).toLocaleString('fa-IR') + ' / ' + (index+1).toLocaleString('fa-IR'),
        shelf:route.to === finishedShelf ? 'قفسهٔ نیمه‌آماده' : 'قفسهٔ ' + (stages.find((s,i) => stageKey(s,i) === route.to)?.name || 'مرحلهٔ مقصد')});
    }
  }
  return {...state, revision:state.revision+1, lots, results:state.results.map(r => r.id === result.id
    ? {...r, revision:r.revision+1, approvals, status:confirmed ? 'confirmed' : 'draft', confirmedAt:confirmed ? at : undefined} : r)};
}

export function routeName(route: PlannedTransfer) {
  return [route.materialName,route.state].filter(Boolean).join(' · ');
}
