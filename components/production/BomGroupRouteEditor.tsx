import {useState} from 'react';
import {Alert, Button, Modal, Select, Table} from 'antd';
import {finishedShelf, type PlannedTransfer} from '../../utils/productionStagePlan';
import {connectBomGroup, type BomRouteGroup, type StationPair} from '../../utils/bomGroupRoutes';

interface Props {
  groups:BomRouteGroup[];
  routes:PlannedTransfer[];
  stations:{value:string;label:string}[];
  save:(routes:PlannedTransfer[])=>Promise<boolean>;
}
export default function BomGroupRouteEditor({groups,routes,stations,save}:Props) {
  const [open,setOpen]=useState(false);
  const [key,setKey]=useState('');
  const [receiver,setReceiver]=useState('');
  const [pairs,setPairs]=useState<Record<string,StationPair>>({});
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const group=groups.find(g=>g.raw.key===key);
  const destinations=[...stations,{value:finishedShelf,label:'قفسهٔ خروجی'}];
  function selectGroup(g:BomRouteGroup) {
    setKey(g.raw.key);setError('');
    const intake=routes.find(r=>r.material===g.raw.key && r.from==='warehouse')?.to || stations[0]?.value || '';
    setReceiver(intake);
    const existing=new Map(routes.filter(r=>r.bomGroup===g.raw.key).map(r=>[r.material,r]));
    setPairs(Object.fromEntries(g.pieces.map(p=>{
      const old=existing.get(p.key);
      return [p.key, old ? {from:old.from,to:old.to} : {from:intake,to:''}];
    })));
  }
  function assign(id:string, patch:Partial<StationPair>) {
    setPairs(prev=>({...prev,[id]:{...prev[id],...patch}}));
  }
  async function submit() {
    if (!group) return;
    setBusy(true);
    try {
      if (await save(connectBomGroup(routes,group,receiver,pairs))) setOpen(false);
      else setError('مسیرها ذخیره نشدند. مبدأ، مقصد و حلقه‌های احتمالی را بررسی کنید.');
    } catch(e) {setError(e instanceof Error ? e.message : 'خطا در ذخیره');}
    finally {setBusy(false);}
  }
  return <>
    <Button disabled={!groups.length} onClick={()=>{selectGroup(groups[0]);setOpen(true);}}>اتصال قطعات شناسنامه</Button>
    <Modal title="مصرف گروه و مسیر قطعات" open={open} width={880} okText="ثبت ارتباط" cancelText="انصراف"
      onCancel={()=>!busy&&setOpen(false)} onOk={()=>void submit()} confirmLoading={busy} okButtonProps={{disabled:!group || !!group.issue}}>
      <div dir="rtl" className="space-y-3">
        <label className="block">گروه مواد اولیه<Select aria-label="گروه مواد اولیه" className="w-full" value={key}
          options={groups.map(g=>({value:g.raw.key,label:g.raw.name}))} onChange={k=>selectGroup(groups.find(g=>g.raw.key===k)!)} /></label>
        {group && <>
          <p>مصرف استاندارد {group.raw.name} برای یک محصول، با پرت: <strong>{group.raw.quantity.toLocaleString('fa-IR',{maximumFractionDigits:6})} {group.raw.unit}</strong></p>
          <label className="block">ایستگاه دریافت ماده از انبار<Select aria-label="ایستگاه دریافت ماده" className="w-full" options={stations} value={receiver} onChange={setReceiver}/></label>
          {group.pieces.length>1 && <Select<string> aria-label="مقصد مشترک" className="w-full" placeholder="تعیین مقصد مشترک برای قطعات بدون مقصد" value={undefined}
            options={destinations} onChange={to=>setPairs(prev=>Object.fromEntries(Object.entries(prev).map(([id,pair])=>
              [id,!pair.to && pair.from!==to ? {...pair,to} : pair])))} />}
          <Table size="small" rowKey="key" pagination={false} scroll={{x:540,y:400}} dataSource={group.pieces} columns={[
            {title:'قطعه',dataIndex:'name'},{title:'تعداد در یک محصول',render:(_,p)=>p.quantity.toLocaleString('fa-IR')},
            {title:'ایستگاه سازنده',render:(_,p)=><Select aria-label={'سازندهٔ '+p.name} className="w-full" options={stations} value={pairs[p.key]?.from}
              onChange={from=>assign(p.key,{from,to:pairs[p.key]?.to===from?'':pairs[p.key]?.to})}/>},
            {title:'مقصد',render:(_,p)=><Select aria-label={'مقصد '+p.name} className="w-full" placeholder="انتخاب مقصد" options={destinations.filter(d=>d.value!==pairs[p.key]?.from)} value={pairs[p.key]?.to || undefined} onChange={to=>assign(p.key,{to})}/>},
          ]}/>
          {(error || group.issue) && <Alert type="error" message={error || group.issue}/>}
        </>}
      </div>
    </Modal>
  </>;
}
