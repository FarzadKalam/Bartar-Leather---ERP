import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Empty, Input, InputNumber, Modal, Space, Tag, message } from 'antd';
import { listReceipts, receiptAction, receiptChangedEvent } from '../../utils/productionReceipts';
import { receiptTotals, validateReceiptAmounts, type ProductionReceipt } from '../../utils/productionReceiptModel';

const labels = { draft: 'پیش‌نویس؛ بدون اثر بر موجودی', sent: 'در انتظار دریافت', partial: 'دریافت ناقص؛ مانده باز است', received: 'دریافت کامل', cancelled: 'لغوشده' };
const number = (n: number) => Number(n).toLocaleString('fa-IR', { maximumFractionDigits: 6 });
export default function ProductionReceiptBoard({ orderIds, onChanged }: { orderIds: string[]; onChanged?: () => void }) {
  const key = [...new Set(orderIds)].sort().join(',');
  const [receipts, setReceipts] = useState<ProductionReceipt[]>([]), [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null), [loading, setLoading] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({}), [reason, setReason] = useState('');
  const inFlight = useRef(false), retry = useRef<{ signature: string; id: string } | null>(null);
  const selected = receipts.find(r => r.id === selectedId);
  const refresh = useCallback(async () => {
    try { setReceipts(await listReceipts(key ? key.split(',') : [])); setError(''); } catch (e: any) { setError(e.message); }
  }, [key]);
  useEffect(() => { void refresh(); const changed = () => { void refresh(); };
    window.addEventListener(receiptChangedEvent, changed); return () => window.removeEventListener(receiptChangedEvent, changed);
  }, [refresh]);
  const open = (r: ProductionReceipt) => { setSelectedId(r.id); setQuantities({}); setReason(''); retry.current = null; };
  const act = async (action: 'send' | 'receive' | 'cancel') => {
    if (!selected || inFlight.current) return;
    if (action === 'receive') { const issue = validateReceiptAmounts(selected.lines, quantities); if (issue) { message.error(issue); return; } }
    const permitted = action === 'receive' ? selected.can_receive : selected.can_send;
    if (!permitted && (!selected.can_proxy || reason.trim().length < 5)) { message.error('برای ثبت به نمایندگی، دلیل را بنویسید؛ این عملیات فقط برای مدیر مجاز است.'); return; }
    inFlight.current = true; setLoading(true);
    const signature = JSON.stringify([selected.id, selected.revision, action, quantities, reason]);
    if (retry.current?.signature !== signature) retry.current = { signature, id: crypto.randomUUID() };
    try {
      await receiptAction(selected.id, selected.revision, action, quantities, reason, retry.current.id);
      setQuantities({}); setReason(''); retry.current = null; await refresh(); onChanged?.();
      message.success(action === 'send' ? 'ارسال ثبت شد؛ موجودی مقصد تا تأیید دریافت قابل استفاده نیست.' : action === 'receive' ? 'فقط مقدار دریافت واقعی به موجودی مقصد اضافه شد.' : 'پیش‌نویس لغو شد؛ موجودی تغییری نکرد.');
    } catch (e: any) {
      // A lost response may follow a committed receipt. Never retain the previous input as a new receipt.
      setQuantities({}); retry.current = null; message.error(e.message); await refresh();
    }
    finally { inFlight.current = false; setLoading(false); }
  };
  return <Card title="ارسال و دریافت مواد" extra={<Button onClick={() => void refresh()}>به‌روزرسانی تحویل‌ها</Button>} className="my-3" dir="rtl">
    <p className="mb-3 text-sm">۱. ذخیرهٔ پیش‌نویس ← ۲. تأیید ارسال توسط تحویل‌دهنده ← ۳. ثبت مقدار واقعی توسط تحویل‌گیرنده</p>
    {error ? <Alert type="warning" message={error} /> : receipts.length === 0 ? <Empty description="هنوز فرم جدیدی ثبت نشده؛ فرم‌های قبلی در سوابق تحویل هستند." /> :
      <div className="grid gap-3 md:grid-cols-2">{receipts.map(r => <div key={r.id} className="rounded-lg border p-3">
        <strong>تحویل {number(r.number)} — {r.stage_name}</strong><p>{r.order_name}</p><Tag>{labels[r.status]}</Tag>
        {r.returned_at && <Tag>ماندهٔ سفارش به مبدأ برگشت خورده</Tag>}
        <p className="my-2 text-sm">{r.sender_name} ← {r.receiver_name}</p>
        <Button onClick={() => open(r)}>بازکردن / ثبت دریافت</Button>
      </div>)}</div>}
    <Modal open={!!selected} onCancel={() => { if (!loading) setSelectedId(null); }} title={selected ? `تحویل ${number(selected.number)} به ${selected.stage_name}` : ''}
      zIndex={12000}
      width={880} style={{ top: 24, maxWidth: 'calc(100vw - 24px)' }} styles={{ body: { maxHeight: 'calc(100dvh - 190px)', overflowY: 'auto' } }}
      footer={<Space wrap><Button onClick={() => setSelectedId(null)} disabled={loading}>بستن</Button>
        {selected?.status === 'draft' && <><Button danger disabled={!selected.can_send && !selected.can_proxy} loading={loading} onClick={() => void act('cancel')}>لغو پیش‌نویس</Button>
          <Button type="primary" loading={loading} disabled={!selected.can_send && !selected.can_proxy} onClick={() => void act('send')}>تأیید ارسال توسط تحویل‌دهنده</Button></>}
        {selected && ['sent','partial'].includes(selected.status) && <Button type="primary" loading={loading} disabled={!selected.can_receive && !selected.can_proxy} onClick={() => void act('receive')}>تأیید مقدار دریافت این نوبت</Button>}
      </Space>}>
      {selected && <div dir="rtl" className="space-y-3">
        <Alert type="info" message={labels[selected.status]} description={selected.status === 'draft'
          ? 'این فرم هنوز اثری بر موجودی ندارد. پس از تأیید ارسال، تحویل‌گیرنده مقدار واقعی را وارد می‌کند. برای اصلاح پیش‌نویس، آن را لغو و فرم اصلاح‌شده را ثبت کنید.'
          : selected.status === 'received' ? 'مقادیر نمایش‌داده‌شده، سابقهٔ دریافت تأییدشده‌اند. موجودی فعلی ممکن است با ادامهٔ تولید یا برگشت به مبدأ تغییر کرده باشد.'
          : 'مقدار دریافت این نوبت را خودتان وارد کنید. ماندهٔ تأییدنشده جدا می‌ماند و به موجودی قابل‌مصرف مقصد اضافه نمی‌شود.'} />
        <p>تحویل‌دهنده: {selected.sender_name} | تحویل‌گیرنده: {selected.receiver_name}</p>
        {selected.lines.map(line => <div key={line.id} className="rounded-lg border p-3">
          <strong>{line.product_name}</strong><p className="text-xs my-1">بستهٔ مبدأ: {line.source_label || 'بدون شماره'} | بستهٔ مقصد: {line.target_label || 'پس از دریافت ایجاد می‌شود'}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>{selected.status === 'draft' ? 'مقدار پیش‌نویس' : 'ارسال‌شده'}<p>{number(line.sent)} {line.unit}</p></div>
            <div>دریافت تأییدشده<p>{number(line.received)} {line.unit}</p></div>
            <div>ماندهٔ در انتظار دریافت<p>{number(Number(line.sent)-Number(line.received))} {line.unit}</p></div>
            {['sent','partial'].includes(selected.status) && <label>دریافت این نوبت ({line.unit})<InputNumber aria-label={`دریافت ${line.product_name}`} className="w-full" min={0} max={Number(line.sent)-Number(line.received)}
              disabled={loading || (!selected.can_receive && !selected.can_proxy)} value={quantities[line.id] ?? null}
              onChange={v => setQuantities(q => ({ ...q, [line.id]: Number(v || 0) }))} /></label>}
          </div>
        </div>)}
        <div className="rounded-lg bg-green-50 p-3">{receiptTotals(selected.lines, quantities).map(row => <p key={row.unit}>
          جمع ({row.unit}): ارسال {number(row.sent)} | دریافت قبلی {number(row.received)} | این نوبت {number(row.accepting)} | مانده پس از تأیید {number(row.pending-row.accepting)}
        </p>)}</div>
        {selected.can_proxy && <label className="block">دلیل ثبت به نمایندگی از مسئول دیگر (در سابقه ثبت می‌شود)<Input.TextArea value={reason} onChange={e => setReason(e.target.value)} /></label>}
        {selected.events.map((event,index) => <div key={index} className="border-t pt-2 text-xs">
          {event.action === 'send' ? 'ارسال' : event.action === 'receive' ? 'دریافت' : 'لغو'} توسط {event.actor} — {new Date(event.at).toLocaleString('fa-IR')}
          {event.reason && <p>به نمایندگی؛ دلیل: {event.reason}</p>}
          <p>{selected.lines.filter(line => Number(event.quantities[line.id]) > 0).map(line => `${line.product_name}: ${number(event.quantities[line.id])} ${line.unit}`).join('؛ ')}</p>
        </div>)}
      </div>}
    </Modal>
  </Card>;
}
