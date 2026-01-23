import faIR from 'antd/locale/fa_IR';
import type { PickerLocale } from 'antd/es/date-picker/generatePicker';
import type { TimePickerLocale } from 'antd/es/time-picker';

export const JALALI_MONTHS_FA = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند'
];

export const jalaliDatePickerLocale: PickerLocale = {
  ...(faIR.DatePicker as PickerLocale),
  lang: {
    ...(faIR.DatePicker?.lang || ({} as any)),
    months: JALALI_MONTHS_FA,
    monthsShort: JALALI_MONTHS_FA,
  },
  timePickerLocale: faIR.TimePicker as TimePickerLocale,
};

export const jalaliTimePickerLocale: TimePickerLocale = faIR.TimePicker as TimePickerLocale;
