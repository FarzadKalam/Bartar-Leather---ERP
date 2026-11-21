import * as assert from 'node:assert/strict';
import { importBomRoutes, type BomExcelRoute } from '../utils/bomExcelRoutes';
import { buildProductionBomTemplate } from '../utils/excelImportTemplates';
import { bomRouteGroups, connectBomGroup, readPiecePair, refreshBomRoutes } from '../utils/bomGroupRoutes';
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
console.log('PASS BOM Excel routes, independent 10-to-14 outputs, shared paths for 60 pieces, consumption units and template validation.');
