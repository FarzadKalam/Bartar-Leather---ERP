import { useState } from 'react';
import { Alert, Button, Checkbox, Input, InputNumber, Modal, Select, Table } from 'antd';
import { finishedShelf, type PlannedTransfer } from '../../utils/productionStagePlan';
import { connectBomGroup, readPiecePair, type BomRouteGroup, type IntermediateOutput, type StationPair } from '../../utils/bomGroupRoutes';

interface Props {
  groups: BomRouteGroup[];
  routes: PlannedTransfer[];
  stations: { value: string; label: string }[];
  save: (routes: PlannedTransfer[]) => Promise<boolean>;
}

export default function BomGroupRouteEditor({ groups, routes, stations, save }: Props) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [receiver, setReceiver] = useState('');
  const [pairs, setPairs] = useState<Record<string, StationPair>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [commonPath, setCommonPath] = useState<string[]>([]);
  const [hasIntermediate, setHasIntermediate] = useState(false);
  const [intermediate, setIntermediate] = useState<IntermediateOutput>({ name: '', quantity: 0, to: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [openedSnapshot, setOpenedSnapshot] = useState('');
  const group = groups.find(g => g.raw.key === key);
  const destinations = [...stations, { value: finishedShelf, label: 'قفسهٔ خروجی' }];
  const snapshot = JSON.stringify({ groups, routes, stations });

  function selectGroup(g: BomRouteGroup) {
    setKey(g.raw.key);
    setError('');
    const intake = routes.find(r => r.material === g.raw.key && r.from === 'warehouse')?.to || stations[0]?.value || '';
    setReceiver(intake);
    setPairs(Object.fromEntries(g.pieces.map(p => {
      const existing = readPiecePair(routes, p.key);
      return [p.key, existing.from ? existing : { from: '', to: '' }];
    })));
    setSelected(g.pieces.map(p => p.key));
    setCommonPath([]);
    const existing = routes.find(r => r.bomGroup === g.raw.key && r.bomIntermediate);
    setHasIntermediate(!!existing);
    setIntermediate(existing ? { name: existing.state, quantity: existing.perItem, to: existing.to }
      : { name: 'تکه‌های برش اول ' + g.raw.name, quantity: 0, to: '' });
  }

  function applyCommonPath() {
    const pair = { from: commonPath[0], to: commonPath[commonPath.length - 1], via: commonPath.slice(1, -1) };
    setPairs(prev => ({ ...prev, ...Object.fromEntries(selected.map(id => [id, pair])) }));
    setError('');
  }

  async function submit() {
    if (!group) return;
    if (snapshot !== openedSnapshot) {
      setError('شناسنامه تغییر کرده است. فرم را ببندید و دوباره باز کنید.');
      return;
    }
    setBusy(true);
    try {
      const next = connectBomGroup(routes, group, receiver, pairs, hasIntermediate ? intermediate : undefined);
      if (await save(next)) setOpen(false);
      else setError('مسیرها ذخیره نشدند. مبدأ، مقصد و حلقه‌های احتمالی را بررسی کنید.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ذخیره');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Button disabled={!groups.length} onClick={() => {
      selectGroup(groups[0]); setOpenedSnapshot(snapshot); setOpen(true);
    }}>مسیر گروهی قطعات شناسنامه</Button>
    <Modal title="مصرف ماده و مسیر قطعات" open={open} width={1050} okText="ثبت مسیرها" cancelText="انصراف"
      onCancel={() => !busy && setOpen(false)} onOk={() => void submit()} confirmLoading={busy}
      okButtonProps={{ disabled: !group || !!group.issue }}>
      <div dir="rtl" className="space-y-4">
        <label className="block">گروه مواد اولیه
          <Select className="w-full" disabled={busy} value={key}
            options={groups.map(g => ({ value: g.raw.key, label: g.raw.name }))}
            onChange={value => selectGroup(groups.find(g => g.raw.key === value)!)} />
        </label>
        {group && <>
          <p>مصرف استاندارد برای یک محصول، با پرت
            <strong className="mr-2">{group.issue ? 'نیازمند اصلاح اطلاعات مواد' : group.raw.quantity.toLocaleString('fa-IR', { maximumFractionDigits: 6 }) + ' ' + group.raw.unit}</strong>
          </p>
          <label className="block">ایستگاه دریافت ماده از انبار
            <Select className="w-full" disabled={busy} options={stations} value={receiver} onChange={setReceiver} />
          </label>
          <Checkbox disabled={busy} checked={hasIntermediate} onChange={event => setHasIntermediate(event.target.checked)}>
            خروجی کلی مرحلهٔ دریافت را با تعداد جدا تعریف می‌کنم
          </Checkbox>
          {hasIntermediate && <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-lg border p-3">
            <label>نام خروجی<Input disabled={busy} value={intermediate.name}
              onChange={event => setIntermediate(prev => ({ ...prev, name: event.target.value }))} /></label>
            <label>تعداد تکه برای یک محصول<InputNumber className="w-full" disabled={busy} min={1} precision={0}
              value={intermediate.quantity || null} onChange={value => setIntermediate(prev => ({ ...prev, quantity: value || 0 }))} /></label>
            <label>تحویل به<Select className="w-full" disabled={busy} placeholder="مثلاً برش لیزر"
              options={stations.filter(s => s.value !== receiver)} value={intermediate.to || undefined}
              onChange={to => setIntermediate(prev => ({ ...prev, to }))} /></label>
            <p className="md:col-span-3 text-gray-600">مثلاً ۱۰ تکه برای هر کیف. تعداد قطعات خروجی لیزر از شناسنامه خوانده می‌شود.</p>
          </div>}
          <div className="rounded-lg border p-3 space-y-2">
            <label className="block">مسیر مشترک قطعات، به ترتیب عبور
              <Select mode="multiple" className="w-full" disabled={busy} value={commonPath}
                placeholder="مثلاً برش لیزر، لویس، بسته‌بندی" options={destinations} onChange={setCommonPath} />
            </label>
            <Button disabled={busy || selected.length === 0 || commonPath.length < 2} onClick={applyCommonPath}>
              اعمال مسیر به {selected.length.toLocaleString('fa-IR')} قطعهٔ انتخاب‌شده
            </Button>
            <p className="text-gray-600">ابتدا سازنده، سپس ایستگاه‌های دریافت را انتخاب کنید. همهٔ قطعات ابتدا انتخاب شده‌اند. برای استثناها، انتخاب‌ها یا مسیر همان ردیف را تغییر دهید.</p>
          </div>
          <Table size="small" rowKey="key" pagination={false} scroll={{ x: 620, y: 320 }} dataSource={group.pieces}
            rowSelection={{ selectedRowKeys: selected, onChange: keys => setSelected(keys.map(String)), getCheckboxProps: () => ({ disabled: busy }) }}
            columns={[
              { title: 'قطعه', dataIndex: 'name', width: 160 },
              { title: 'تعداد در یک محصول', width: 150, render: (_, piece) => piece.quantity.toLocaleString('fa-IR') },
              { title: 'مسیر به ترتیب عبور', render: (_, piece) => {
                const pair = pairs[piece.key];
                const path = pair?.from ? [pair.from, ...(pair.via || []), pair.to].filter(Boolean) : [];
                return <Select mode="multiple" aria-label={'مسیر ' + piece.name} className="w-full" disabled={busy}
                  options={destinations} value={path} placeholder="سازنده و مرحله‌های بعد"
                  onChange={values => setPairs(prev => ({ ...prev, [piece.key]: {
                    from: values[0] || '', to: values.length > 1 ? values[values.length - 1] : '', via: values.slice(1, -1),
                  } }))} />;
              } },
            ]} />
          {(error || group.issue) && <Alert type="error" message={error || group.issue} />}
        </>}
      </div>
    </Modal>
  </>;
}
