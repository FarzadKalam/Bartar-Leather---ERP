// ==========================================
// Persian Number Formatting Utilities
// اعداد فارسی برای نمایش (مقادیر داخلی انگلیسی باقی می‌ماند)
// ==========================================

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
  
  let formatted = number.toLocaleString('en-US');
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
  
  return toPersianNumber(String(time));
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


