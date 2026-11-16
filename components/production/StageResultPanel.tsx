import { useState } from 'react';
import { Alert, Button, Input, InputNumber, Modal, Select, Table, Tag } from 'antd';
import { finishedShelf, stageKey, type PlanStage } from '../../utils/productionStagePlan';
import { pendingQuantity, plannedRoutes, resultInputBalance, routeName, type ResultCommand, type StageExecution, type StageOperator, type StageResult } from '../../utils/productionStageExecution';

interface Props {
  stages: PlanStage[];
  state: StageExecution;
  actor: StageOperator;
  quantity: number;
  onCommand: (command: ResultCommand, expectedRevision: number) => Promise<void>;
}
const number = (n: number) => n.toLocaleString('fa-IR', {maximumFractionDigits:6});

export default function StageResultPanel({stages,state,actor,quantity,onCommand}: Props) {
  const [stageId,setStageId] = useState<string>();
  const [form,setForm] = useState<{id:string; revision?:number; stateRevision:number; stageId:string; inputs:Record<string,{used:number;waste:number}>; outputs:Record<string,number>}>();
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [reject,setReject] = useState<StageResult>();
  const [reason,setReason] = useState('');
  const routes = plannedRoutes(stages);
  const incoming = state.lots.filter(l => l.stageId === stageId && (l.quantity > 0 || form?.inputs[l.id]));
  const outgoing = routes.filter(r => r.from === stageId);
  const labels = new Map(stages.map((s,i) => [stageKey(s,i),s.name || s.title || 'مرحله']));
  labels.set(finishedShelf,'قفسهٔ خروجی');
  function edit(result?: StageResult) {
    if (!stageId) return;
    setError('');
    setForm({id:result?.id || crypto.randomUUID(), revision:result?.revision, stateRevision:state.revision, stageId,
      inputs:Object.fromEntries((result?.inputs || []).map(i => [i.lotId,{used:i.used,waste:i.waste}])),
      outputs:Object.fromEntries((result?.outputs || []).map(o => [o.routeId,o.quantity]))});
  }
  async function run(command: ResultCommand, revision=state.revision) {
    setBusy(true);setError('');
    try { await onCommand(command,revision);setForm(undefined);setReject(undefined); }
    catch (e) { setError(e instanceof Error ? e.message : 'ثبت انجام نشد. دوباره تلاش کنید.'); }
    finally { setBusy(false); }
  }
  function setInput(id:string, key:'used'|'waste', n:number|null) {
    setForm(old => old && {...old, inputs:{...old.inputs,[id]:{...(old.inputs[id] || {used:0,waste:0}),[key]:n ?? 0}}});
  }
  return <section dir="rtl" className="space-y-3 rounded-lg border bg-white p-4">
    <strong>نتیجهٔ واقعی مرحله</strong>
    <div className="flex flex-wrap gap-3">
      <Select aria-label="ایستگاه نتیجه" placeholder="انتخاب ایستگاه" style={{minWidth:180}} value={stageId}
        options={stages.map((s,i) => ({value:stageKey(s,i),label:s.name || s.title || 'مرحله'}))}
        onChange={id=>{setStageId(id);setForm(undefined);setError('');}}/>
      {stageId && actor.stageIds.includes(stageId) && <Button onClick={()=>edit()} disabled={busy}>ثبت نتیجهٔ جدید</Button>}
    </div>
    {error && <Alert type="error" message={error}/>}
    {stageId && <>
      <Table rowKey="id" size="small" pagination={false} dataSource={incoming} scroll={{x:600}}
        locale={{emptyText:'ورودی قطعی برای این مرحله ثبت نشده است.'}} columns={[
          {title:'موجودی در اختیار مرحله',dataIndex:'label'},
          {title:'بسته',dataIndex:'bundle'}, {title:'قفسه',dataIndex:'shelf'},
          {title:'موجودی قطعی',render:(_,l)=>number(l.quantity)+' '+l.unit},
          {title:'در انتظار تأیید',render:(_,l)=>number(pendingQuantity(state,l.id))+' '+l.unit},
        ]}/>
      <Table rowKey="id" size="small" pagination={false} scroll={{x:650}}
        dataSource={state.results.filter(r=>r.stageId===stageId || r.approvals.some(a=>a.stageId===stageId))}
        locale={{emptyText:'نتیجه‌ای ثبت نشده است.'}} columns={[
          {title:'ایستگاه سازنده',render:(_,r)=>labels.get(r.stageId)},
          {title:'خروجی سالم',render:(_,r)=>r.outputs.map(o=><div key={o.routeId}>{routes.find(x=>x.id===o.routeId)?.state} · {number(o.quantity)} {routes.find(x=>x.id===o.routeId)?.unit}</div>)},
          {title:'وضعیت',render:(_,r)=><><Tag color={r.status==='confirmed'?'green':r.status==='rejected'?'red':'orange'}>{r.status==='confirmed'?'قطعی':r.status==='rejected'?'ردشده':'منتظر تأیید'}</Tag>{r.rejection && <div>{r.rejection}</div>}
            {r.approvals.map(a=><div key={a.stageId} className="text-xs">{labels.get(a.stageId)} · {a.userId?'تأیید شده':'در انتظار'}</div>)}</>},
          {title:'عملیات',render:(_,r)=><div className="flex flex-wrap gap-2">
            {r.status==='draft' && actor.id===r.authorId && <Button size="small" disabled={busy || r.stageId!==stageId} onClick={()=>edit(r)}>ویرایش پیش‌نویس</Button>}
            {r.status==='draft' && actor.id!==r.authorId && r.approvals.some(a=>actor.stageIds.includes(a.stageId)&&!a.userId) && <>
              <Button size="small" type="primary" disabled={busy} onClick={()=>void run({kind:'approve',id:r.id,revision:r.revision})}>تأیید دریافت</Button>
              <Button size="small" danger disabled={busy} onClick={()=>{setReason('');setReject(r);}}>رد نتیجه</Button></>}
            <Button size="small" onClick={()=>Modal.info({title:'جزئیات نتیجه',okText:'بستن',width:620,content:<div dir="rtl" className="space-y-2">
              {r.inputs.map(i=>{const lot=state.lots.find(l=>l.id===i.lotId);return <div key={i.lotId}>{lot?.label} · {lot?.bundle}<br/>مصرف در خروجی سالم {number(i.used)}، ضایعات {number(i.waste)} {lot?.unit}</div>;})}
              {r.outputs.map(o=>{const route=routes.find(x=>x.id===o.routeId);return <div key={o.routeId}>{route?.state} · {number(o.quantity)} {route?.unit} ← {labels.get(route?.to || '')}</div>;})}
            </div>})}>جزئیات</Button>
          </div>},
        ]}/>
    </>}
    <Modal title="ثبت نتیجهٔ واقعی" open={!!form} width={920} confirmLoading={busy}
      okText="ذخیرهٔ پیش‌نویس" cancelText="انصراف" onCancel={()=>!busy&&setForm(undefined)}
      onOk={()=>form&&void run({kind:'save',id:form.id,revision:form.revision,stageId:form.stageId,
        inputs:Object.entries(form.inputs).map(([lotId,i])=>({lotId,...i})),
        outputs:Object.entries(form.outputs).map(([routeId,n])=>({routeId,quantity:n}))},form.stateRevision)}>
      <div dir="rtl" className="space-y-3">
        <p>مصرف در قطعات سالم و ضایعات را جدا وارد کنید. ماندهٔ سالم از موجودی بسته محاسبه می‌شود.</p>
        <Table rowKey="id" size="small" pagination={false} scroll={{x:650}} dataSource={incoming} columns={[
          {title:'ورودی',render:(_,l)=><>{l.label}<div className="text-xs">{l.bundle} · {number(l.quantity)} {l.unit}</div></>},
          {title:'مصرف در خروجی سالم',render:(_,l)=><InputNumber aria-label={'مصرف '+l.label} min={0} value={form?.inputs[l.id]?.used || 0} onChange={n=>setInput(l.id,'used',n)}/>},
          {title:'ضایعات',render:(_,l)=><InputNumber aria-label={'ضایعات '+l.label} min={0} value={form?.inputs[l.id]?.waste || 0} onChange={n=>setInput(l.id,'waste',n)}/>},
          {title:'ماندهٔ سالم پس از تأیید',render:(_,l)=>number(resultInputBalance(l,{lotId:l.id,used:form?.inputs[l.id]?.used||0,waste:form?.inputs[l.id]?.waste||0}))+' '+l.unit},
        ]}/>
        <Table rowKey="id" size="small" pagination={false} dataSource={outgoing} columns={[
          {title:'خروجی',render:(_,r)=>routeName(r)}, {title:'مقصد',render:(_,r)=>labels.get(r.to)},
          {title:'استاندارد کل سفارش',render:(_,r)=>number(r.perItem*quantity)+' '+r.unit},
          {title:'خروجی سالم این نوبت',render:(_,r)=><InputNumber aria-label={'خروجی '+r.state} min={0} precision={r.mode==='piece'?0:6}
            value={form?.outputs[r.id]||0} onChange={n=>setForm(old=>old&&({...old,outputs:{...old.outputs,[r.id]:n??0}}))}/>},
        ]}/>
        {error && <Alert type="error" message={error}/>}
      </div>
    </Modal>
    <Modal title="رد نتیجه" open={!!reject} confirmLoading={busy} okText="ثبت رد" cancelText="انصراف"
      onCancel={()=>!busy&&setReject(undefined)} onOk={()=>reject&&void run({kind:'reject',id:reject.id,revision:reject.revision,reason})}>
      <Input.TextArea aria-label="علت رد" value={reason} onChange={e=>setReason(e.target.value)} placeholder="علت رد نتیجه"/>
    </Modal>
  </section>;
}
