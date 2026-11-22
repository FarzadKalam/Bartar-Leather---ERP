import { getHandoverPersonAmounts } from '../../utils/productionHandoverSummary';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

export default function HandoverAmountSummary({ groups, giverConfirmed, receiverConfirmed }: {
  groups: any[]; giverConfirmed: boolean; receiverConfirmed: boolean;
}) {
  const amounts = getHandoverPersonAmounts(groups);
  const format = (quantity: number, unit: string) =>
    `${toPersianNumber(quantity.toLocaleString('en-US', { maximumFractionDigits: 3 }))} ${unit}`;
  return <div className="overflow-x-auto rounded-lg border border-gray-200">
    <table className="w-full text-right text-xs" aria-label="مقدار تأییدشده توسط هر شخص">
      <thead className="bg-gray-50"><tr>
        <th className="p-2">ماده یا محصول</th><th className="p-2">مقدار این فرم</th>
        <th className="p-2">تحویل‌داده‌شده توسط تحویل‌دهنده</th><th className="p-2">دریافت‌شده توسط تحویل‌گیرنده</th>
      </tr></thead>
      <tbody>{amounts.map(row => <tr key={row.key} className="border-t border-gray-100">
        <td className="p-2">{row.label}</td><td className="p-2">{format(row.quantity, row.unit)}</td>
        <td className="p-2">{giverConfirmed ? format(row.quantity, row.unit) : 'در انتظار تأیید تحویل‌دهنده'}</td>
        <td className="p-2">{receiverConfirmed ? format(row.quantity, row.unit) : 'در انتظار تأیید تحویل‌گیرنده'}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
