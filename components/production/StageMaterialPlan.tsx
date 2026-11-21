import { useMemo, useState } from 'react';
import BomGroupRouteEditor from './BomGroupRouteEditor';
import { bomRouteGroups, refreshBomRoutes } from '../../utils/bomGroupRoutes';
import { Alert, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Table } from 'antd';
import { HARD_CODED_UNIT_OPTIONS } from '../../utils/unitConversions';
import { attachRoutes, expectedAmount, finishedShelf, materialChoices, planIssue, stageKey, warehouse, type PlanStage, type PlannedTransfer } from '../../utils/productionStagePlan';

interface Props {
  stages: PlanStage[];
  materials: any[];
  quantity: number;
  isOrder: boolean;
  canEdit: boolean;
  onSave: (stages: PlanStage[]) => Promise<void>;
}

const custom = 'custom-output';
const required = [{ required: true, message: 'این مورد را وارد کنید.' }];
const format = (value: number) => value.toLocaleString('fa-IR', {maximumFractionDigits:9});

export default function StageMaterialPlan({ stages, materials, quantity, isOrder, canEdit, onSave }: Props) {
  const [form] = Form.useForm<PlannedTransfer>();
  const [editing, setEditing] = useState<{id?:string; snapshot:string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState('');
  const [filter, setFilter] = useState<string>();
  const options = stages.map((s,i) => ({value:stageKey(s,i), label:s.name || s.title || 'مرحله بدون نام'}));
  const names = new Map([...options, {value:warehouse,label:'انبار'}, {value:finishedShelf,label:'قفسهٔ خروجی'}].map(o => [o.value,o.label]));
  const choices = useMemo(() => materialChoices(materials), [materials]);
  const groups = useMemo(()=>bomRouteGroups(materials),[materials]);
  const routes = refreshBomRoutes(stages.flatMap(s => s.materialRoutes || []),groups);
  const linkedItems = new Set(routes.filter(r=>r.bomGroup).map(r=>r.material));
  const incompleteGroups = groups.filter(g=>linkedItems.has(g.raw.key) && g.pieces.some(p=>!linkedItems.has(p.key)));
  const snapshot = JSON.stringify(stages);
  const visible = routes.filter(r => !filter || r.from === filter || r.to === filter);
  function open(row?: PlannedTransfer) {
    setIssue('');
    form.resetFields();
    form.setFieldsValue(row || {from:warehouse, mode:'bulk', unit:'عدد'});
    setEditing({id:row?.id, snapshot});
  }
  async function persist(next: PlannedTransfer[]) {
    const error = planIssue(stages,next);
    if (error) { setIssue(error); return false; }
    setBusy(true);
    try {
      await onSave(attachRoutes(stages,next));
      setIssue('');
      setEditing(null);
      return true;
    } catch { setIssue('ذخیره انجام نشد. اطلاعات را بررسی و دوباره تلاش کنید.'); return false; }
    finally { setBusy(false); }
  }
  function submit(values: PlannedTransfer) {
    if (!editing || !canEdit) return;
    if (editing.snapshot !== snapshot) { setIssue('مراحل تغییر کرده‌اند. فرم را دوباره باز کنید.'); return; }
    const old = routes.find(r => r.id === editing.id);
    const row = {...old, ...values, state:values.state.trim(), id:old?.id || crypto.randomUUID(),
      materialName: choices.find(o => o.value === values.material)?.label || (old?.material === values.material ? old.materialName : '')};
    void persist(old ? routes.map(r => r.id === row.id ? row : r) : [...routes,row]);
  }
  if (!stages.length || (!routes.length && !canEdit)) return null;
  return <section className="rounded-lg border bg-white p-3 space-y-3" dir="rtl">
    <div className="flex flex-wrap items-center gap-3">
      <strong>ورودی و خروجی مراحل</strong>
      {routes.length > 0 && <Select allowClear placeholder="همهٔ مراحل" value={filter} onChange={setFilter} options={options} style={{minWidth:150}} />}
      {canEdit && <Button disabled={busy} onClick={() => open()}>افزودن مسیر</Button>}
      {canEdit && <BomGroupRouteEditor groups={groups} stations={options} routes={routes} save={persist}/>}
    </div>
    {issue && !editing && <Alert type="error" message={issue}/>}
    {incompleteGroups.length>0 && <Alert type="warning" message={'مسیر بعضی قطعات تعیین نشده است: '+incompleteGroups.map(g=>g.raw.name).join('، ')}/>}
    <Table size="small" pagination={false} rowKey="id" scroll={{x:720}} dataSource={visible}
      locale={{emptyText:'مسیر مواد و قطعات هنوز تعریف نشده است.'}}
      columns={[
        {title:'مبدأ', dataIndex:'from', render:v => names.get(v) || 'مرحلهٔ حذف‌شده'},
        {title:'مقصد', dataIndex:'to', render:v => names.get(v) || 'مرحلهٔ حذف‌شده'},
        {title:'ماده یا قطعه', render:(_,r) => <>{r.materialName && <div className="text-xs text-gray-500">{r.materialName}</div>}{r.state}{r.routeCode && <span className="mr-2 text-xs" dir="ltr">{r.routeCode}</span>}</>},
        {title:'شکل تحویل', render:(_,r) => r.mode === 'bulk' ? 'فله‌ای' : 'قطعه‌ای'},
        {title:'برای یک محصول', render:(_,r) => format(r.perItem) + ' ' + r.unit},
        ...(isOrder ? [{title:'برای سفارش (' + format(quantity) + ' محصول)', render:(_:unknown,r:PlannedTransfer) => format(expectedAmount(r,quantity)) + ' ' + r.unit}] : []),
        ...(canEdit ? [{title:'عملیات',render:(_:unknown,r:PlannedTransfer) => <div className="flex">
          {r.bomGroup ? <span className="text-xs">از شناسنامه</span> : <Button size="small" type="link" disabled={busy} onClick={() => open(r)}>ویرایش</Button>}
          <Popconfirm title="این مسیر حذف شود؟" okText="حذف" cancelText="انصراف" onConfirm={() => persist(routes.filter(x => x.id !== r.id))}>
            <Button size="small" type="link" danger disabled={busy}>حذف</Button></Popconfirm></div>}] : []),
      ]}/>
    <Modal title={editing?.id ? 'ویرایش مسیر قطعه' : 'افزودن مسیر قطعه'} open={!!editing} forceRender confirmLoading={busy}
      okText="ثبت مسیر" cancelText="انصراف" onCancel={() => !busy && setEditing(null)} onOk={() => form.submit()}>
      <Form form={form} layout="vertical" onFinish={submit} dir="rtl">
        <div className="grid grid-cols-2 gap-x-3">
          <Form.Item name="from" label="از کجا" rules={required}><Select options={[{value:warehouse,label:'انبار'},...options]}/></Form.Item>
          <Form.Item name="to" label="به کجا" rules={required}><Select options={[...options,{value:finishedShelf,label:'قفسهٔ خروجی'}]}/></Form.Item>
        </div>
        <Form.Item name="material" label="ماده یا قطعهٔ شناسنامه" rules={required}><Select showSearch optionFilterProp="label"
          options={[...choices, ...(editing?.id ? routes.filter(r => r.id === editing.id && r.material !== custom && !choices.some(c => c.value === r.material)).map(r => ({value:r.material,label:r.materialName || 'قطعهٔ قبلی'})) : []),{value:custom,label:'قطعه یا پک با نام مستقل'}]}
          onChange={value => {
            const choice = choices.find(o => o.value === value);
            const item = groups.flatMap(group => [group.raw, ...group.pieces]).find(candidate => candidate.key === value);
            if (choice && item) form.setFieldsValue({unit:choice.unit, perItem:item.quantity, state:item.name,
              mode:groups.some(group => group.raw.key === value) ? 'bulk' : 'piece'});
          }}/></Form.Item>
        <Form.Item name="state" label="نام و وضعیت هنگام تحویل" rules={[...required,{whitespace:true,message:'نام و وضعیت را وارد کنید.'}]}>
          <Input placeholder="مثلاً بدنهٔ کیف بایگان، لیزرشده" maxLength={160}/></Form.Item>
        <div className="grid grid-cols-3 gap-x-3">
          <Form.Item name="mode" label="شکل تحویل" rules={required}><Select options={[{value:'bulk',label:'فله‌ای'},{value:'piece',label:'قطعه‌ای'}]}/></Form.Item>
          <Form.Item name="perItem" label="برای یک محصول" rules={required}><InputNumber className="w-full" min={0} /></Form.Item>
          <Form.Item name="unit" label="واحد" rules={required}><Select options={HARD_CODED_UNIT_OPTIONS}/></Form.Item>
        </div>
        {issue && <Alert type="error" message={issue}/>}
      </Form>
    </Modal>
  </section>;
}
