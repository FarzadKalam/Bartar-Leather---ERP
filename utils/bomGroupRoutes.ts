import { attachRoutes, materialChoices, materialGroupKey, warehouse, type PlanStage, type PlannedTransfer } from './productionStagePlan';
import { convertBetweenUnits } from './unitConversions';

interface BomItem { key:string; name:string; materialName:string; unit:string; quantity:number }
export interface BomRouteGroup { raw:BomItem; pieces:BomItem[]; issue:string }
export interface StationPair { from:string; to:string }

export function bomRouteGroups(rows:any[]): BomRouteGroup[] {
  const choices = new Map(materialChoices(rows).map(o => [o.value,o]));
  return rows.map((row,index) => {
    const groupKey = materialGroupKey(row,index);
    const key = JSON.stringify([groupKey]);
    const choice = choices.get(key)!;
    let usage = 0;
    let issue = '';
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
    const item=items.get(r.material);
    if (!item) return [];
    return [{...r,state:item.name, materialName:item.materialName, perItem:item.quantity,unit:item.unit}];
  });
}

export function snapshotBomStages(stages:PlanStage[], materials:any[]) {
  if (!Array.isArray(stages) || !Array.isArray(materials)) return stages;
  const routes=stages.flatMap(s=>s.materialRoutes || []);
  if (!routes.some(r=>r.bomGroup)) return stages;
  return attachRoutes(stages,refreshBomRoutes(routes,bomRouteGroups(materials)));
}

export function connectBomGroup(routes:PlannedTransfer[], group:BomRouteGroup, receiving:string, pairs: Record<string,StationPair>) {
  if (group.issue) throw new Error(group.issue);
  const priorByItem=new Map(routes.filter(r=>r.bomGroup===group.raw.key).map(r=>[r.material,r]));
  const signature=(material:string,from:string,to:string)=>JSON.stringify([material,from,to]);
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
    const prior=priorByItem.get(item.key);
    const matches=manual.get(signature(item.key,pair.from,pair.to)) || [];
    if (matches.length>1) throw new Error('برای این ماده و مسیر چند ردیف دستی دارید. ابتدا مسیرهای تکراری را بررسی کنید.');
    const match=matches[0];
    if (match) replaced.add(match.id);
    linked.push({id:prior?.id || match?.id || crypto.randomUUID(),...pair,material:item.key, materialName:item.materialName,
      state:item.name,mode:raw?'bulk':'piece',unit:item.unit,perItem:item.quantity,bomGroup:group.raw.key});
  }
  return [...routes.filter(r=>r.bomGroup!==group.raw.key && !replaced.has(r.id)),...linked];
}
