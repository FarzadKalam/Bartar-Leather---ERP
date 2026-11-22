import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App, Alert, Button, ConfigProvider, InputNumber, Select, Space, message } from 'antd';
import 'antd/dist/reset.css';
import '../../index.css';
import ProductionReceiptBoard from '../../components/production/ProductionReceiptBoard';
import { receiptChangedEvent, saveReceiptDrafts } from '../../utils/productionReceipts';
import { api, setActor } from './client';
import ReceiptDraftPreview from './ReceiptDraftPreview';
function Preview() {
  const [fullForm,setFullForm]=useState(false);
  const [state, setState] = useState<any>(), [qty, setQty] = useState(8), [actor, actorState] = useState('sender'), [busy, setBusy] = useState(false);
  const refresh = async () => { const r = await api('state'); if (r.error) message.error(r.error.message); else setState(r.data); };
  useEffect(() => { void refresh(); const changed=()=>{void refresh();};window.addEventListener(receiptChangedEvent,changed);return()=>window.removeEventListener(receiptChangedEvent,changed); },[]);
  const action = async (name: string) => { setBusy(true);try { const r = await api(name); if(r.error)throw Error(r.error.message); await refresh(); window.dispatchEvent(new Event(receiptChangedEvent));message.success(name==='return'?'مانده به بسته و قفسهٔ مبدأ برگشت.':'دادهٔ ساختگی از نو آماده شد.'); } catch(e:any){message.error(e.message);}finally{setBusy(false);} };
  const draft = async () => { setBusy(true);try {
    const i=state.ids;
    await saveReceiptDrafts({kind:'deliver',requestKey:crypto.randomUUID(),orders:[{id:i.order}],moves:[{client_key:'leather',product_id:i.product,source_shelf_id:i.source,target_shelf_id:i.stage,source_bundle_id:i.bundle,target_bundle_id:crypto.randomUUID(),new_bundle:true,quantity:qty,unit:'فوت مربع',target_bundle_number:null}]});
    message.success('پیش‌نویس ثبت شد؛ موجودی تغییری نکرد.');
  }catch(e:any){message.error(e.message);}finally{setBusy(false);} };
  return <main dir="rtl" style={{maxWidth:1100,padding:24,margin:'auto'}}>
    <h1>تست ارسال و دریافت — سفارش ۵ بایگان</h1>
    <Alert type="info" showIcon message="فقط دادهٔ ساختگی؛ بدون اتصال به سایت اصلی" description="فرم ارسال و دریافت و محاسبات تراکنشی از کد پروژه هستند. انتخاب حساب در این صفحه برای شبیه‌سازی نقش‌ها در PostgreSQL محلی است." />
    <Space wrap style={{margin:'20px 0'}}><span>حساب آزمایشی:</span><Select style={{width:180}} value={actor} onChange={v=>{setActor(v);actorState(v);window.dispatchEvent(new Event(receiptChangedEvent));}} options={[{value:'sender',label:'انباردار'},{value:'receiver',label:'تحویل‌گیرنده'},{value:'other',label:'کاربر نامرتبط'},{value:'admin',label:'مدیر'}]} />
    <Button disabled={busy} onClick={()=>void action('reset')}>شروع دوباره با دادهٔ ساختگی</Button></Space>
    {state && <><Alert type="success" message={`موجودی (فوت مربع): انبار ${state.source} | در انتظار دریافت ${state.transit} | قفسهٔ برش اول ${state.stage} | جمع ${state.source+state.transit+state.stage}`} />
      <Space wrap style={{margin:'16px 0'}}><label>مقدار چرم برای ارسال (فوت مربع): <InputNumber aria-label="مقدار پیش‌نویس" min={0.001} value={qty} onChange={v=>setQty(Number(v||0))} /></label><Button loading={busy} onClick={()=>void draft()}>ذخیرهٔ پیش‌نویس جدید</Button><Button loading={busy} onClick={()=>void action('return')}>برگشت مانده به مبدأ</Button></Space>
      <p>نمونهٔ تست: ۸ فوت ارسال کنید؛ با حساب تحویل‌گیرنده ۶ فوت دریافت کنید، سپس ۲ فوت باقی‌مانده را تأیید کنید. جمع موجودی باید همیشه ۱۰۰ بماند. پس از دریافت کامل، برگشت مانده را امتحان کنید.</p>
      <Button onClick={()=>setFullForm(true)}>فرم کامل تحویل کالا</Button>
      {fullForm && <ReceiptDraftPreview ids={state.ids} onClose={()=>setFullForm(false)} />}
      <ProductionReceiptBoard key={state.ids.order} orderIds={[state.ids.order]} onChanged={()=>void refresh()} />
    </>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider direction="rtl"><App><Preview/></App></ConfigProvider>);
