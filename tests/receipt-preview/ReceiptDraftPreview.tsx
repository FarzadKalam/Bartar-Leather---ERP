import { useState } from 'react';
import { message } from 'antd';
import TaskHandoverModal from '../../components/production/TaskHandoverModal';
import { CREATE_NEW_BUNDLE_VALUE } from '../../utils/productionBundles';
import { applyDeliveryRowFieldUpdate, getDeliveryMainQuantity } from '../../utils/productionDeliveryRows';
import { saveReceiptDrafts } from '../../utils/productionReceipts';
export default function ReceiptDraftPreview({ ids, onClose }: { ids: any; onClose: () => void }) {
  const row = () => ({ key: crypto.randomUUID(), name: 'چرم عسلی پاکباز', deliveryType: 'bulk', mainUnit: 'فوت مربع', subUnit: '',
    quantity: 8, mainQuantity: 8, subQuantity: 0, deliveredQty: 8, sourceBundleId: ids.bundle, sourceShelfId: ids.source, targetBundleId: CREATE_NEW_BUNDLE_VALUE });
  const [groups, setGroups] = useState<any[]>([{ key:'leather', rowIndex:0, categoryLabel:'چرم', selectedProductId:ids.product, selectedProductName:'چرم عسلی پاکباز', selectedProductCode:'TEST-LEATHER',
    sourceShelfId:ids.source,targetShelfId:ids.stage,deliveryType:'bulk',pieces:[],orderPieces:[],deliveryRows:[row()],totalSourceQty:100,totalOrderQty:6.48,totalHandoverQty:8,collapsed:false,isConfirmed:false }]);
  const [busy,setBusy]=useState(false),[requestKey]=useState(()=>crypto.randomUUID());
  const update=(index:number,fn:(g:any)=>any)=>setGroups(all=>all.map((g,i)=>{if(i!==index)return g;const next=fn(g);return {...next,totalHandoverQty:next.deliveryRows.reduce((sum:number,r:any)=>sum+getDeliveryMainQuantity(r,next.deliveryType),0)};}));
  const save=async()=>{setBusy(true);try{
    const moves=groups.flatMap(g=>g.deliveryRows.map((r:any)=>({client_key:r.key,product_id:ids.product,source_shelf_id:r.sourceShelfId,target_shelf_id:ids.stage,
      source_bundle_id:r.sourceBundleId,target_bundle_id:crypto.randomUUID(),new_bundle:true,quantity:getDeliveryMainQuantity(r,g.deliveryType),unit:r.mainUnit,target_bundle_number:null}))).filter(m=>m.quantity>0);
    await saveReceiptDrafts({kind:'deliver',requestKey,orders:[{id:ids.order}],moves});message.success('پیش‌نویس بدون تغییر موجودی ذخیره شد.');onClose();
  }catch(e:any){message.error(e.message);}finally{setBusy(false);}};
  return <TaskHandoverModal open loading={busy} taskName="برش اول" sourceStageName="انبار مرکزی" giverName="انباردار" receiverName="تحویل‌گیرنده"
    trafficType="incoming" trafficTypeEditable={false} sourceStageValue="__central__" destinationStageId={null} stageOptions={[]} groups={groups}
    giverConfirmation={{confirmed:false}} receiverConfirmation={{confirmed:false}} targetShelfId={ids.stage}
    bundleOptionsByProduct={{[ids.product]:[{value:ids.bundle,label:'بسته ۱ — انبار اصلی',shelfId:ids.source,stock:100}]}}
    onCancel={onClose} onSave={()=>void save()} onTrafficTypeChange={()=>{}} onSourceStageChange={()=>{}} onDestinationStageChange={()=>{}}
    onToggleGroup={(i,collapsed)=>update(i,g=>({...g,collapsed}))} onConfirmGroup={i=>update(i,g=>({...g,isConfirmed:true,collapsed:true}))}
    onDeliveryRowAdd={i=>update(i,g=>({...g,deliveryRows:[...g.deliveryRows,{...row(),quantity:0,mainQuantity:0,deliveredQty:0}]}))}
    onDeliveryRowsDelete={(i,keys)=>update(i,g=>({...g,deliveryRows:g.deliveryRows.filter((r:any)=>!keys.includes(r.key))}))}
    onDeliveryRowsTransfer={()=>{}} onDeliveryRowFieldChange={(i,key,field,value)=>update(i,g=>({...g,deliveryRows:g.deliveryRows.map((r:any)=>r.key===key?applyDeliveryRowFieldUpdate(r,g,field,value):r)}))}
    onConfirmGiver={()=>{}} onConfirmReceiver={()=>{}} />;
}
