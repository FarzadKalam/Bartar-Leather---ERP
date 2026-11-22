/** Quantities are always in the product's stock unit; different units are never added. */
export type ReceiptLine = {
  id: string; product_name: string; unit: string; sent: number; received: number;
  source_label?: string; target_label?: string;
};
export type ProductionReceipt = {
  id: string; number: number; order_id: string; order_name: string; stage_name: string;
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'; revision: number;
  returned_at?: string | null;
  sender_name: string; receiver_name: string; can_send: boolean; can_receive: boolean; can_proxy: boolean;
  lines: ReceiptLine[]; events: { action: string; actor: string; at: string; reason: string; quantities: Record<string, number> }[];
};
export function receiptTotals(lines: ReceiptLine[], proposed: Record<string, number> = {}) {
  const byUnit = new Map<string, { unit: string; sent: number; received: number; pending: number; accepting: number }>();
  for (const line of lines) {
    const row = byUnit.get(line.unit) || { unit: line.unit, sent: 0, received: 0, pending: 0, accepting: 0 };
    row.sent += Number(line.sent); row.received += Number(line.received);
    row.pending += Number(line.sent) - Number(line.received);
    row.accepting += Number(proposed[line.id] || 0);
    byUnit.set(line.unit, row);
  }
  return [...byUnit.values()];
}
export function validateReceiptAmounts(lines: ReceiptLine[], proposed: Record<string, number>) {
  if (Object.keys(proposed).some(id => !lines.some(line => line.id === id))) return 'ردیف دریافت معتبر نیست.';
  let total = 0;
  for (const line of lines) {
    const amount = Number(proposed[line.id] || 0);
    if (!Number.isFinite(amount) || amount < 0 || amount > Number(line.sent) - Number(line.received) + 1e-9)
      return 'مقدار دریافت باید بین صفر و ماندهٔ در انتظار دریافت باشد.';
    if (['عدد', 'بسته'].includes(line.unit) && !Number.isInteger(amount)) return 'تعداد قطعه یا بسته باید عدد صحیح باشد.';
    total += amount;
  }
  return total > 0 ? null : 'مقدار واقعی دریافت را وارد کنید.';
}
