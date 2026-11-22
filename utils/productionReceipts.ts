import { supabase } from '../supabaseClient';
import type { Command } from './productionTransaction';
import type { ProductionReceipt } from './productionReceiptModel';
import { normalizeUnitValue } from './unitConversions';

export const receiptChangedEvent = 'production-receipts-changed';
let transitShelfPromise: Promise<string> | undefined;
export function productionTransitShelf(): Promise<string> {
  return transitShelfPromise ||= (async () => {
    const { data, error } = await supabase.from('production_transit_location').select('shelf_id').single();
    if (error) { transitShelfPromise = undefined; throw receiptError(error); }
    return data.shelf_id as string;
  })();
}
export function receiptError(error: any): Error {
  if (error?.code === 'PGRST202' || error?.code === '42P01')
    return new Error('روال جدید ارسال و دریافت هنوز روی این پایگاه نصب نشده است. ابتدا نسخهٔ محلی را تست کنید.');
  return new Error(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i.test(error?.message || '')
    ? 'ثبت تحویل انجام نشد؛ فرم و موجودی بسته‌ها را تازه کنید.' : error?.message || 'ثبت تحویل انجام نشد.');
}
export async function listReceipts(orderIds: string[]): Promise<ProductionReceipt[]> {
  if (!orderIds.length) return [];
  const { data, error } = await supabase.rpc('list_production_receipts', { order_ids: orderIds });
  if (error) throw receiptError(error);
  return data || [];
}
export async function receiptAction(id: string, revision: number, action: string, quantities: Record<string, number>, reason: string, requestKey: string) {
  const { error } = await supabase.rpc('production_receipt_action', { command: { id, revision, action, quantities, reason, request_key: requestKey } });
  if (error) throw receiptError(error);
  window.dispatchEvent(new Event(receiptChangedEvent));
}
/** Adapt existing delivery editors to one transaction per batch, without moving stock on Save. */
export async function saveReceiptDrafts(command: Command) {
  if (command.deltas?.some(d => d.delta !== 0)) throw new Error('ضایعات را جدا از فرم ارسال ثبت کنید؛ پیش‌نویس تحویل نباید موجودی را تغییر دهد.');
  const documents = new Map<string, any>();
  const ids = [...new Set((command.moves || []).map(m => m.product_id))];
  const { data: products, error: unitError } = await supabase.from('products').select('id,main_unit').in('id', ids);
  if (unitError) throw receiptError(unitError);
  for (const move of command.moves || []) {
    const unit = products?.find(p => p.id === move.product_id)?.main_unit;
    if (!unit || (move.unit && normalizeUnitValue(move.unit) !== normalizeUnitValue(unit))) throw new Error('مقدار تحویل باید با واحد اصلی محصول ثبت شود.');
    const log = command.transfers?.find(t => t.product_id === move.product_id && t.from_shelf_id === move.source_shelf_id
      && t.to_shelf_id === move.target_shelf_id && t.source_bundle_id === move.source_bundle_id && t.target_bundle_id === move.target_bundle_id);
    const order = command.orders.find(o => o.id === log?.production_order_id) || (command.orders.length === 1 ? command.orders[0] : null);
    if (!order) throw new Error('سفارش مربوط به این ردیف تحویل مشخص نیست.');
    const task = command.tasks?.find(t => {
      if (t.orderId ? t.orderId !== order.id : command.orders.length > 1) return false;
      const form = (t.recurrence as any)?.production_handover;
      return t.shelf === move.target_shelf_id || form?.targetShelfId === move.target_shelf_id;
    });
    const form = (task?.recurrence as any)?.production_handover;
    const destination = form?.direction === 'outgoing' ? form?.destinationTaskId : task?.id;
    const source = form?.direction === 'outgoing' ? task?.id : form?.sourceTaskId;
    const key = `${order.id}:${destination || move.target_shelf_id}:${source || 'warehouse'}`;
    let doc = documents.get(key);
    if (!doc) {
      doc = { request_key: `${form?.activeFormId || command.requestKey || crypto.randomUUID()}:${key}`, order_id: order.id,
        destination_task_id: destination || null, source_task_id: source || null, target_shelf_id: move.target_shelf_id,
        ...(order.revision !== undefined ? { revision: order.revision } : {}), lines: [] };
      documents.set(key, doc);
    }
    doc.lines.push({ ...move, unit });
  }
  if (!documents.size) throw new Error('ردیف دارای مقدار مثبت برای ارسال وجود ندارد. برای فرم قبلی از تأیید سوابق استفاده کنید.');
  const { error } = await supabase.rpc('save_production_receipt_drafts', { documents: [...documents.values()] });
  if (error) throw receiptError(error);
  window.dispatchEvent(new Event(receiptChangedEvent));
}

export async function confirmLegacyReceipt(taskId: string, formId: string, side: 'giver' | 'receiver') {
  const { data, error } = await supabase.rpc('confirm_legacy_production_receipt', { task_id: taskId, form_id: formId, confirmation_side: side });
  if (error) throw receiptError(error);
  return data;
}
