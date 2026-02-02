// ==========================================
// Persian Number Formatting Utilities
// اعداد فارسی برای نمایش (مقادیر داخلی انگلیسی باقی می‌ماند)
// ==========================================

import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import jalaliday from 'jalaliday';

dayjs.extend(jalaliday);

const isJalaliYear = (valueStr: string): boolean => {
  const yearMatch = valueStr.match(/^(\d{4})/);
  if (!yearMatch) return false;
  const year = parseInt(yearMatch[1], 10);
  return year >= 1300 && year <= 1500;
};

export const toGregorianDateString = (value: Dayjs | null, format: string): string | null => {
  if (!value) return null;
  const baseValue = dayjs.isDayjs(value) ? value : dayjs(value);
  const gregorian = baseValue.calendar('gregory');
  return gregorian.format(format);
};

/**
 * تبدیل اعداد انگلیسی به فارسی
 * 0-9 → ۰-۹
 * فقط نمایش برای صارف، مقدار واقعی تغییر نمی‌کند
 * 
 * @param num - عدد یا string
 * @returns string با اعداد فارسی
 */
export const toPersianNumber = (num: any): string => {
  if (num === null || num === undefined || num === '') return '-';
  
  const str = String(num);
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  
  return str.replace(/\d/g, (digit) => persianDigits[parseInt(digit)]);
};

/**
 * فرمت کردن عدد با جداکننده هزارها و تبدیل به فارسی
 * مثال: 1234567 → ۱۲۳۴۵۶۷
 * یا با comma: 1234567 → ۱,۲۳۴,۵۶۷
 * 
 * @param num - عدد
 * @param withComma - اضافه کردن جداکننده هزارها
 * @returns string فرمت شده به فارسی
 */
export const formatPersianPrice = (num: any, withComma = true): string => {
  if (num === null || num === undefined || num === '') return '-';
  
  const number = Number(num);
  if (isNaN(number)) return '-';
  
  let formatted = withComma ? number.toLocaleString('en-US') : number.toString();
  return toPersianNumber(formatted);
};

/**
 * فرمت کردن قیمت با واحد پول و اعداد فارسی
 * مثال: 1500 → ۱۵۰۰ تومان
 * 
 * @param price - قیمت
 * @param unit - واحد (تومان، ریال، وغیره)
 * @returns string
 */
export const formatPersianCurrency = (price: any, unit = 'تومان'): string => {
  if (price === null || price === undefined || price === '') return '-';
  
  const number = Number(price);
  if (isNaN(number)) return '-';
  
  const formatted = formatPersianPrice(number, true);
  return `${formatted} ${unit}`;
};

/**
 * فرمت کردن درصد به فارسی
 * مثال: 25.5 → ۲۵٫۵%
 * 
 * @param percentage - درصد
 * @param decimals - تعداد اعشار
 * @returns string
 */
export const formatPersianPercentage = (percentage: any, decimals = 1): string => {
  if (percentage === null || percentage === undefined || percentage === '') return '-';
  
  const num = Number(percentage);
  if (isNaN(num)) return '-';
  
  const fixed = num.toFixed(decimals).replace('.', '٫');
  return toPersianNumber(fixed) + '%';
};

/**
 * فرمت کردن تعداد به فارسی
 * مثال: 100 → ۱۰۰
 * 
 * @param quantity - تعداد
 * @returns string
 */
export const formatPersianQuantity = (quantity: any): string => {
  if (quantity === null || quantity === undefined || quantity === '') return '-';
  
  const num = Number(quantity);
  if (isNaN(num)) return String(num);
  
  return toPersianNumber(num.toString());
};

/**
 * فرمت کردن اعشار به فارسی با کاما
 * مثال: 123.45 → ۱۲۳٫۴۵
 * 
 * @param num - عدد اعشاری
 * @param decimals - تعداد اعشار
 * @returns string
 */
export const formatPersianDecimal = (num: any, decimals = 2): string => {
  if (num === null || num === undefined || num === '') return '-';
  
  const number = Number(num);
  if (isNaN(number)) return '-';
  
  const fixed = number.toFixed(decimals).replace('.', '٫');
  return toPersianNumber(fixed);
};

/**
 * فرمت کردن وقت (ساعت:دقیقه:ثانیه) به فارسی
 * مثال: "12:30:45" → "۱۲:۳۰:۴۵"
 * 
 * @param time - وقت در فرمت HH:MM:SS یا HH:MM
 * @returns string
 */
export const formatPersianTime = (time: any): string => {
  if (!time) return '-';
  const str = String(time);
  const trimmed = str.includes(':') ? str.split(':').slice(0, 2).join(':') : str;
  return toPersianNumber(trimmed);
};

/**
 * فرمت امن تاریخ/زمان جلالی
 * تبدیل هر تاریخی (timestamptz، ISO string، Dayjs) به فرمت جلالی
 * 
 * @param value - تاریخ ورودی (ISO string، timestamp، Dayjs object)
 * @param format - فرمت خروجی (مثل 'YYYY/MM/DD' یا 'YYYY/MM/DD HH:mm')
 * @returns string فرمت شده به جلالی یا خالی اگر نامعتبر باشد
 */
export const safeJalaliFormat = (value: Dayjs | string | number | null | undefined, format?: string): string => {
  if (!value) return '';
  
  try {
    const resolvedFormat = format ?? 'YYYY/MM/DD';
    let dayjsObj: any;
    
    // Check if it's already a Dayjs object
    if (dayjs.isDayjs(value)) {
      dayjsObj = value;
    } else if (value && typeof value === 'object' && value.$d) {
      // It's a Dayjs object, use the internal Date
      dayjsObj = dayjs(value.$d);
    } else {
      // Check if the value string contains a Jalali year (1300-1500 range)
      const valueStr = String(value);
      if (isJalaliYear(valueStr)) {
        dayjsObj = dayjs(valueStr, { jalali: true });
      } else {
        // Parse as Gregorian and convert to Jalali
        dayjsObj = dayjs(value);
      }
    }
    
    // Validate
    if (!dayjsObj || !dayjsObj.isValid()) {
      return '';
    }
    
    const gregorianYear = dayjsObj.calendar('gregory').year();
    if (gregorianYear < 1900 || gregorianYear > 2100) {
      return '';
    }
    
    // Convert to Jalali calendar for display
    const jalaliDate = dayjsObj.calendar('jalali');
    
    // Check if we have a valid Jalali date
    if (!jalaliDate || typeof jalaliDate.format !== 'function') {
      console.error('Failed to convert to Jalali calendar:', value);
      return '';
    }
    
    return jalaliDate.format(resolvedFormat);
    
  } catch (e) {
    console.error('Failed to format Jalali:', value, e);
    return '';
  }
};

/**
 * تابع مرکزی برای parse کردن تاریخ
 * هر نوع ورودی (ISO string، timestamp، Date object، Dayjs) را به Dayjs تبدیل می‌کند
 * 
 * @param rawValue - تاریخ ورودی
 * @returns Dayjs object یا null اگر نامعتبر باشد
 */
export const parseDateValue = (rawValue: Dayjs | string | number | null | undefined): Dayjs | null => {
  if (!rawValue) return null;
  
  try {
    if (dayjs.isDayjs(rawValue)) {
      return rawValue;
    }
    
    const rawStr = String(rawValue);
    const dayjsObj = isJalaliYear(rawStr) ? dayjs(rawStr, { jalali: true }) : dayjs(rawValue);
    
    if (!dayjsObj.isValid()) return null;
    
    const gregorianYear = dayjsObj.calendar('gregory').year();
    if (gregorianYear < 1900 || gregorianYear > 2100) return null;
    
    return dayjsObj;
    
  } catch (e) {
    console.error('Failed to parse date:', rawValue, e);
    return null;
  }
};

/**
 * Inverse: تبدیل فارسی به انگلیسی
 * (اگر کاربر فارسی تایپ کند و بخواهیم عدد انگلیسی ذخیره کنیم)
 * 
 * @param persianNum - عدد فارسی
 * @returns number
 */
export const fromPersianNumber = (persianNum: string): number => {
  if (!persianNum) return 0;
  
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  let englishStr = String(persianNum);
  
  persianDigits.forEach((persian, index) => {
    englishStr = englishStr.replace(new RegExp(persian, 'g'), String(index));
  });
  
  // حذف جداکننده‌های کاما
  englishStr = englishStr.replace(/,/g, '');
  
  return Number(englishStr);
};
