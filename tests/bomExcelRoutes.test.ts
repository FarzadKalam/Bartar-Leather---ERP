import * as assert from 'node:assert/strict';
import { importBomRoutes, type BomExcelRoute } from '../utils/bomExcelRoutes';
import { buildProductionBomTemplate } from '../utils/excelImportTemplates';
import { bomRouteGroups, connectBomGroup, editBomRoute, hasBomQuantity, incompleteBomGroups, readPiecePair, refreshBomRoutes } from '../utils/bomGroupRoutes';
import { expectedAmount, planIssue } from '../utils/productionStagePlan';

const template = buildProductionBomTemplate();
const data = (name: string) => template.sheets.find(sheet => sheet.name === name)!.rows;
const materialGroups = new Map<string, any>();
for (const row of data('مواد اولیه')) {
  const code = String(row['کد گروه']);
  if (!materialGroups.has(code)) materialGroups.set(code, {key:code, header:{bom_code:code}, pieces:[]});
  materialGroups.get(code).pieces.push({
    key:row['کد قطعه'], bom_code:row['کد قطعه'], name:row['نام تکه'], quantity:row['تعداد'],
    length:row['طول'], width:row['عرض'], waste_rate:row['نرخ پرت'], main_unit:row['واحد اصلی'],
  });
}
const materials = [...materialGroups.values()];
const stages = data('مراحل پیش نویس تولید').filter(row => !['انبار','قفسهٔ خروجی'].includes(String(row['عنوان مرحله'])))
  .map(row => ({id:String(row['شناسه مرحله']), name:String(row['عنوان مرحله'])}));
const rows: BomExcelRoute[] = data('گردش قطعات').map(row => ({
  code:String(row['کد مسیر']), kind:String(row['نوع']), reference:String(row['مرجع شناسنامه']),
  name:String(row['نام خروجی']), from:String(row['مبدأ']), to:String(row['مقصد']),
  quantity:row['مقدار برای یک محصول'] === '' ? null : Number(row['مقدار برای یک محصول']), unit:String(row['واحد']),
}));
const imported = importBomRoutes(stages, materials, rows);
const routes = imported.flatMap(stage => stage.materialRoutes || []);
const byCode = (code:string) => routes.find(route => route.routeCode === code)!;
assert.equal(byCode('CUT').perItem,10);
assert.equal(byCode('CH1').perItem + byCode('CH2').perItem,14);
assert.equal(byCode('RAW-CH').perItem,1260);
assert.equal(byCode('RAW-CH').unit,'سانتیمتر مربع');
assert.equal(byCode('RAW-CH').mode,'bulk');
assert.equal(byCode('ZIP').mode,'piece');
assert.equal(byCode('CUT').mode,'piece');
assert.equal(byCode('PACK').mode,'piece');
assert.equal(expectedAmount(byCode('CUT'),5),50);
assert.equal(expectedAmount(byCode('PACK'),5),5);
assert.equal(planIssue(stages,routes),null);
const groups = bomRouteGroups(materials);
const leather = groups[0];
const pairs = Object.fromEntries(leather.pieces.map(piece => [piece.key,readPiecePair(routes,piece.key)]));
assert.equal(pairs[leather.pieces[0].key].via?.length,1);
const rebuilt = connectBomGroup(routes,leather,'stage-1',pairs,{name:'تکه‌های برش اول',quantity:10,to:'stage-2'});
assert.equal(rebuilt.length,routes.length);
assert.equal(planIssue(stages,rebuilt),null);
materials[0].pieces[0].quantity=4;
const refreshed=refreshBomRoutes(rebuilt,bomRouteGroups(materials));
assert.deepEqual(refreshed.filter(route=>route.material===leather.pieces[0].key).map(route=>route.perItem),[4,4]);
assert.equal(refreshed.find(route=>route.bomIntermediate)?.perItem,10);
assert.equal(refreshed.find(route=>route.routeCode==='PACK')?.perItem,1);

// Older imports labelled all warehouse receipts bulk. Refresh derived BOM rows only.
const legacyFitting = {...byCode('ZIP'),mode:'bulk' as const};
const manualPack = {...byCode('PACK'),mode:'bulk' as const};
assert.equal(refreshBomRoutes([legacyFitting],groups)[0].mode,'piece');
assert.equal(legacyFitting.mode,'bulk');
assert.deepEqual(refreshBomRoutes([manualPack],groups),[manualPack]);
const fitting = groups.find(group=>group.raw.key===byCode('ZIP').bomGroup)!;
const fittingPairs=Object.fromEntries(fitting.pieces.map(piece=>[piece.key,{from:'stage-2',to:'stage-5'}]));
assert.equal(connectBomGroup([],fitting,'stage-2',fittingPairs).find(route=>route.material===fitting.raw.key)?.mode,'piece');

const threadMaterials=structuredClone(materials);
const thread=threadMaterials.find(row=>row.header.bom_code==='G-ZIP')!.pieces[0];
thread.quantity=12;
thread.main_unit='متر طول';
const threadImport=importBomRoutes(stages,threadMaterials,rows).flatMap(stage=>stage.materialRoutes||[]);
assert.equal(threadImport.find(route=>route.routeCode==='ZIP')?.mode,'bulk');
assert.equal(threadImport.find(route=>route.routeCode==='ZIP')?.perItem,12);
const measuredOutput=importBomRoutes(stages,materials,[{...rows[rows.length-1],unit:'متر طول',quantity:1.5}]);
assert.equal(measuredOutput.flatMap(stage=>stage.materialRoutes||[])[0].mode,'bulk');

const editedFitting=editBomRoute(byCode('ZIP'),{...byCode('ZIP'),mode:'bulk',state:'یراق آمادهٔ بسته‌بندی',perItem:99,unit:'متر طول'},groups);
assert.equal(editedFitting.perItem,byCode('ZIP').perItem);
assert.equal(editedFitting.unit,'عدد');
assert.equal(editedFitting.id,byCode('ZIP').id);
assert.equal(editedFitting.routeCode,'ZIP');
assert.equal(refreshBomRoutes([editedFitting],groups)[0].mode,'bulk');
assert.equal(refreshBomRoutes([editedFitting],groups)[0].state,'یراق آمادهٔ بسته‌بندی');
const restoredFitting=editBomRoute(editedFitting,{...editedFitting,mode:'piece',state:fitting.raw.name},groups);
assert.equal(restoredFitting.modeOverride,undefined);
assert.equal(restoredFitting.stateOverride,undefined);
const editedPiece=editBomRoute(byCode('CH1'),{...byCode('CH1'),to:'stage-5',state:'بدنهٔ آماده'},groups);
const withEdit=routes.map(r=>r.id===editedPiece.id?editedPiece:r);
assert.equal(refreshBomRoutes(withEdit,bomRouteGroups(materials)).find(r=>r.id===editedPiece.id)?.perItem,4);
assert.equal(refreshBomRoutes(withEdit,bomRouteGroups(materials)).find(r=>r.id===editedPiece.id)?.state,'بدنهٔ آماده');
assert.equal(refreshBomRoutes(withEdit,bomRouteGroups(materials)).find(r=>r.id===editedPiece.id)?.to,'stage-5');
const editedCut=editBomRoute(byCode('CUT'),{...byCode('CUT'),perItem:11},groups);
assert.equal(refreshBomRoutes([editedCut],groups)[0].perItem,11);
assert.equal(hasBomQuantity(editedCut),false);
assert.equal(hasBomQuantity(byCode('ZIP')),true);
assert.equal(incompleteBomGroups(groups,routes).length,0);
assert.ok(incompleteBomGroups(groups,routes.filter(r=>r.material!==leather.pieces[0].key)).some(g=>g.raw.key===leather.raw.key));
const preserveEdit=connectBomGroup([editedFitting],fitting,editedFitting.to,fittingPairs).find(r=>r.id===editedFitting.id)!;
assert.equal(preserveEdit.mode,'bulk');
assert.equal(preserveEdit.state,'یراق آمادهٔ بسته‌بندی');
assert.throws(()=>importBomRoutes(stages,materials,[{...rows[0],to:'مرحله ناشناخته'}]),/مبدأ یا مقصد/);
assert.throws(()=>importBomRoutes(stages,materials,[rows[0],rows[0]]),/تکراری/);
assert.throws(()=>importBomRoutes(stages,materials,[{...rows[2],reference:'missing'}]),/مرجع/);
assert.throws(()=>importBomRoutes(stages,materials,[{...rows[1],quantity:2.5}]),/صحیح/);
assert.throws(()=>importBomRoutes(stages,materials,[{...rows[1],to:rows[1].from}]),/خودش/);
assert.ok(bomRouteGroups([{header:{category:'leather'},pieces:[{name:'چرم',quantity:2,length:20,width:10,main_unit:'عدد'}]}])[0].issue);
assert.equal(bomRouteGroups([{header:{selected_product_main_unit:'عدد'},pieces:[{name:'بدنه',quantity:2,final_usage:20,main_unit:'سانتیمتر مربع'}]}])[0].raw.unit,'سانتیمتر مربع');
const many={...leather,pieces:Array.from({length:60},(_,i)=>({...leather.pieces[0],key:'piece-'+i}))};
const manyPairs=Object.fromEntries(many.pieces.map(piece=>[piece.key,{from:'stage-2',via:['stage-4'],to:'stage-5'}]));
assert.equal(connectBomGroup([],many,'stage-1',manyPairs).length,121);
console.log('PASS BOM Excel routes, independent outputs, countable receipts, persistent route edits, linked BOM quantities, direct pack ingredients and template validation.');
