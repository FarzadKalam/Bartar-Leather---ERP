import { Button, InputNumber } from 'antd';
import { CheckOutlined, CloseOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

type Props = {
  lines: Array<{ id: string; line_no: number; quantity: number }>;
  drafts: Record<string, number>;
  savingId: string | null;
  disabled: boolean;
  onEdit: (id: string, quantity: number) => void;
  onChange: (id: string, quantity: number | null) => void;
  onSave: (id: string) => void;
  onCancel: (id: string) => void;
  onAdd: () => void;
};

export default function ProductionQuantityEditor(props: Props) {
  const total = props.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  return <section dir="rtl" className="mb-5 rounded-2xl border border-green-200 bg-green-50 p-4 space-y-3">
    <div className="font-bold text-lg text-green-900">تعداد تولید: {toPersianNumber(total)} محصول</div>
    <div className="flex flex-wrap gap-3">
      {props.lines.map(line => {
        const editing = Object.prototype.hasOwnProperty.call(props.drafts, line.id);
        return <div key={line.id} className="flex items-center gap-2 rounded-lg bg-white p-2">
          <span>خط {toPersianNumber(line.line_no)}</span>
          {editing ? <>
            <InputNumber aria-label={`تعداد تولید خط ${line.line_no}`} min={0} value={props.drafts[line.id]}
              disabled={props.disabled || props.savingId === line.id} onChange={value => props.onChange(line.id, value)}
              onPressEnter={event => { event.preventDefault(); event.stopPropagation(); props.onSave(line.id); }} />
            <Button type="primary" icon={<CheckOutlined />} loading={props.savingId === line.id}
              disabled={props.disabled} onClick={() => props.onSave(line.id)}>ثبت تعداد</Button>
            <Button aria-label="انصراف از تغییر تعداد" icon={<CloseOutlined />} disabled={props.savingId === line.id}
              onClick={() => props.onCancel(line.id)} />
          </> : <Button icon={<EditOutlined />} disabled={props.disabled} onClick={() => props.onEdit(line.id, Number(line.quantity || 0))}>
            {toPersianNumber(line.quantity || 0)} محصول — تغییر تعداد
          </Button>}
        </div>;
      })}
      {!props.lines.length && <Button icon={<PlusOutlined />} disabled={props.disabled} onClick={props.onAdd}>تعیین تعداد و ایجاد خط</Button>}
    </div>
    <p className="text-xs text-green-900 m-0">تعداد هر خط با «ثبت تعداد» همان لحظه ذخیره می‌شود. تعداد قطعات شناسنامه برای یک محصول است و مصرف کل بر اساس تعداد تولید محاسبه می‌شود.</p>
  </section>;
}
