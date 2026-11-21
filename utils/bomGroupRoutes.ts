import { attachRoutes, defaultTransferMode, finishedShelf, materialChoices, materialGroupKey, warehouse, type PlanStage, type PlannedTransfer } from './productionStagePlan';
import { convertBetweenUnits } from './unitConversions';

interface BomItem { key:string; name:string; materialName:string; unit:string; quantity:number }
export interface BomRouteGroup { raw:BomItem; pieces:BomItem[]; issue:string }
export interface StationPair { from:string; to:string; via?:string[] }
export interface IntermediateOutput { name:string; quantity:number; to:string }

export function readPiecePair(routes: PlannedTransfer[], material: string): StationPair {
  const legs = routes.filter(r => r.material === material && r.bomGroup && !r.bomIntermediate);
  const first = legs.find(r => !legs.some(other => other.to === r.from));
  if (!first) return {from:'', to:''};
  const path = [first.from, first.to];
  const visited = new Set([first.id]);
  let current = first;
  while (true) {
    const next = legs.find(r => r.from === current.to && !visited.has(r.id));
    if (!next) break;
    visited.add(next.id);
    path.push(next.to);
    current = next;
  }
  return {from:path[0], to:path[path.length-1], via:path.slice(1,-1)};
}

export function bomRouteGroups(rows:any[]): BomRouteGroup[] {
  const choices = new Map(materialChoices(rows).map(o => [o.value,o]));
  return rows.map((row,index) => {
    const groupKey = materialGroupKey(row,index);
    const key = JSON.stringify([groupKey]);
    const choice = choices.get(key)!;
    let usage = 0;
    let issue = choice.unit ? '' : 'واحد مصرف گروه را در جدول مواد اولیه مشخص کنید.';
    const pieces: BomItem[] = [];
    for (const [i,piece] of (row.pieces || []).entries()) {
      const count = Number(piece.quantity) || 0;
      if (!piece.name?.trim() && !count && !Number(piece.final_usage)) continue;
      const base = piece.length && piece.width ? Number(piece.length)*Number(piece.width)*count : count;
      const standard = Number(piece.final_usage ?? base*(1+Number(piece.waste_rate || 0)/100));
      const unit = piece.main_unit || choice.unit;
      const amount = unit === choice.unit ? standard : convertBetweenUnits(standard,unit,choice.unit,{record:{...row.specs,conversion_width_mm:piece.conversion_width_mm ?? row.specs?.conversion_width_mm}});
      if (!piece.name?.trim() || !Number.isInteger(count) || count<=0 || !Number.isFinite(amount) || amount<=0)
        issue='نام، تعداد، واحد و مصرف استاندارد هر قطعه را در جدول مواد اولیه کامل کنید.';
      if (piece.length && piece.width && ['عدد','بسته',''].includes(unit))
        issue='قطعهٔ دارای طول و عرض باید واحد مساحت داشته باشد. واحد مصرف را در جدول مواد اولیه اصلاح کنید.';
      usage += amount;
      pieces.push({key:JSON.stringify([groupKey,String(piece.key ?? piece.id ?? i)]),name:piece.name || 'قطعه بدون نام',materialName:choice.label,unit:'عدد',quantity:count});
    }
    if (!pieces.length) issue='این گروه هنوز قطعه‌ای ندارد.';
    return {raw:{key,name:choice.label,materialName:choice.label,unit:choice.unit,quantity:Number(usage.toFixed(9))},pieces,issue};
  });
}

export function refreshBomRoutes(routes:PlannedTransfer[], groups:BomRouteGroup[]) {
  const items = new Map(groups.flatMap(g=>[g.raw,...g.pieces]).map(item=>[item.key,item]));
  return routes.flatMap(r=>{
    if (!r.bomGroup) return [r];
    if (r.bomIntermediate) return items.has(r.bomGroup) ? [r] : [];
    const item=items.get(r.material);
    if (!item) return [];
    return [{...r,state:r.stateOverride || item.name, materialName:item.materialName, perItem:item.quantity,unit:item.unit,mode:r.modeOverride || defaultTransferMode(item.unit)}];
  });
}

export function hasBomQuantity(route?: PlannedTransfer) {
  return !!route?.bomGroup && !route.bomIntermediate;
}

export function editBomRoute(old: PlannedTransfer, values: PlannedTransfer, groups: BomRouteGroup[]): PlannedTransfer {
  const next = {...old, ...values, id:old.id, state:values.state.trim()};
  if (!old.bomGroup) return next;
  next.bomGroup = old.bomGroup;
  next.material = old.material;
  next.bomIntermediate = old.bomIntermediate;
  next.routeCode = old.routeCode;
  if (!hasBomQuantity(old)) return next;
  const group = groups.find(g=>g.raw.key===old.bomGroup);
  const item = group && [group.raw,...group.pieces].find(p=>p.key===old.material);
  if (!item) throw new Error('مرجع این مسیر در شناسنامه پیدا نشد. صفحه را تازه کنید.');
  next.perItem = item.quantity;
  next.unit = item.unit;
  next.modeOverride = values.mode === defaultTransferMode(item.unit) ? undefined : values.mode;
  next.stateOverride = next.state === item.name ? undefined : next.state;
  return refreshBomRoutes([next],groups)[0];
}

export function incompleteBomGroups(groups: BomRouteGroup[], routes: PlannedTransfer[]) {
  const linked = new Set(routes.filter(r=>r.bomGroup).map(r=>r.material));
  const finalAssembly = new Set(routes.filter(r=>r.to===finishedShelf).map(r=>r.from));
  return groups.filter(group=>{
    if (!linked.has(group.raw.key) || group.pieces.every(piece=>linked.has(piece.key))) return false;
    // Direct ingredients of a final pack have no separate manufactured piece output.
    const transformed = group.pieces.some(piece=>linked.has(piece.key)) || routes.some(r=>r.bomGroup===group.raw.key&&r.bomIntermediate);
    const receipts = routes.filter(r=>r.material===group.raw.key&&r.from===warehouse);
    return transformed || !receipts.length || !receipts.every(r=>finalAssembly.has(r.to));
  });
}

export function snapshotBomStages(stages:PlanStage[], materials:any[]) {
  if (!Array.isArray(stages) || !Array.isArray(materials)) return stages;
  const routes=stages.flatMap(s=>s.materialRoutes || []);
  if (!routes.some(r=>r.bomGroup)) return stages;
  return attachRoutes(stages,refreshBomRoutes(routes,bomRouteGroups(materials)));
}

export function connectBomGroup(routes:PlannedTransfer[], group:BomRouteGroup, receiving:string, pairs: Record<string,StationPair>, intermediate?:IntermediateOutput) {
  if (group.issue) throw new Error(group.issue);
  const signature=(material:string,from:string,to:string)=>JSON.stringify([material,from,to]);
  const priorByPath=new Map(routes.filter(r=>r.bomGroup===group.raw.key).map(r=>[signature(r.material,r.from,r.to),r]));
  const manual=new Map<string,PlannedTransfer[]>();
  for (const route of routes) {
    if (route.bomGroup) continue;
    const key=signature(route.material,route.from,route.to);
    if (!manual.has(key)) manual.set(key,[]);
    manual.get(key)!.push(route);
  }
  const replaced=new Set<string>();
  const linked:PlannedTransfer[]=[];
  for (const item of [group.raw,...group.pieces]) {
    const raw=item===group.raw;
    const pair=raw ? {from:warehouse,to:receiving} : pairs[item.key];
    if (!pair?.from || !pair.to) throw new Error('ایستگاه سازنده و مقصد همهٔ قطعات را تعیین کنید.');
    const path = [pair.from, ...('via' in pair ? pair.via || [] : []), pair.to];
    for (let step=0; step<path.length-1; step++) {
      const from=path[step], to=path[step+1];
      const pathKey=signature(item.key,from,to);
      const prior=priorByPath.get(pathKey);
      const matches=manual.get(pathKey) || [];
      if (matches.length>1) throw new Error('برای این ماده و مسیر چند ردیف دستی دارید. ابتدا مسیرهای تکراری را بررسی کنید.');
      const match=matches[0];
      if (match) replaced.add(match.id);
      linked.push({id:prior?.id || match?.id || crypto.randomUUID(),from,to,material:item.key, materialName:item.materialName,
        state:prior?.stateOverride || item.name,mode:prior?.modeOverride || defaultTransferMode(item.unit),unit:item.unit,perItem:item.quantity,bomGroup:group.raw.key,
        ...(prior?.modeOverride ? {modeOverride:prior.modeOverride} : {}),
        ...(prior?.stateOverride ? {stateOverride:prior.stateOverride} : {}),
        ...(prior?.routeCode ? {routeCode:prior.routeCode} : {})});
    }
  }
  if (intermediate) {
    if (!intermediate.name.trim() || !Number.isInteger(intermediate.quantity) || intermediate.quantity<=0 || !intermediate.to)
      throw new Error('نام، تعداد صحیح مثبت و مقصد خروجی کلی مرحلهٔ اول را وارد کنید.');
    const prior=routes.find(r=>r.bomGroup===group.raw.key && r.bomIntermediate);
    linked.push({id:prior?.id || crypto.randomUUID(),from:receiving,to:intermediate.to,
      material:group.raw.key + ':intermediate',materialName:group.raw.name,state:intermediate.name.trim(),
      mode:'piece',unit:'عدد',perItem:intermediate.quantity,bomGroup:group.raw.key,bomIntermediate:true,
      ...(prior?.routeCode ? {routeCode:prior.routeCode} : {})});
  }
  return [...routes.filter(r=>r.bomGroup!==group.raw.key && !replaced.has(r.id)),...linked];
}
