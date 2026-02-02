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

// نام روزهای هفته به فارسی (شنبه اول هفته)
const JALALI_WEEKDAYS_FA = [
  'شنبه',   // Saturday (0)
  'یکشنبه',  // Sunday (1)
  'دوشنبه',  // Monday (2)
  'سه‌شنبه', // Tuesday (3)
  'چهارشنبه', // Wednesday (4)
  'پنج‌شنبه', // Thursday (5)
  'جمعه'    // Friday (6)
];

const JALALI_WEEKDAYS_SHORT_FA = [
  'ش',   // Saturday
  'ی',   // Sunday
  'د',   // Monday
  'س',   // Tuesday
  'چ',   // Wednesday
  'پ',   // Thursday
  'ج'    // Friday
];

export const jalaliDatePickerLocale: PickerLocale = {
  ...(faIR.DatePicker as PickerLocale),
  lang: {
    ...(faIR.DatePicker?.lang || ({} as any)),
    locale: 'fa_IR',
    // روزهای هفته به فارسی با شنبه اول
    dayFormat: 'dd',
    weekdaysShort: JALALI_WEEKDAYS_SHORT_FA,
    weekdays: JALALI_WEEKDAYS_FA,
    // ماه‌های جلالی
    months: JALALI_MONTHS_FA,
    monthsShort: JALALI_MONTHS_FA,
    shortWeekDays: JALALI_WEEKDAYS_SHORT_FA,
    shortMonths: JALALI_MONTHS_FA,
  },
  timePickerLocale: faIR.TimePicker as TimePickerLocale,
};

export const jalaliTimePickerLocale: TimePickerLocale = faIR.TimePicker as TimePickerLocale;
