import dayjs from 'dayjs';

// --- توابع عمومی ---

export const toPersianNumber = (num: any): string => {
  if (num === null || num === undefined || num === '') return '';
  const str = String(num);
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return str.replace(/\d/g, (digit) => persianDigits[parseInt(digit)]);
};

export const fromPersianNumber = (persianNum: string): number => {
  if (!persianNum) return 0;
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  let str = String(persianNum);
  for (let i = 0; i < 10; i++) {
    str = str.replace(new RegExp(persianDigits[i], 'g'), String(i));
  }
  return parseFloat(str) || 0;
};

export const formatPersianPrice = (num: any, withComma = true): string => {
  if (num === null || num === undefined || num === '') return '';
  const number = Number(num);
  if (isNaN(number)) return String(num);
  const str = withComma ? number.toLocaleString('en-US') : String(number);
  return toPersianNumber(str);
};

// --- توابع تاریخ و زمان ---

export const safeJalaliFormat = (value: any, format: string = 'YYYY/MM/DD'): string => {
  if (!value) return '';
  try {
    const date = dayjs(value).toDate();
    if (isNaN(date.getTime())) return '';
    
    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    };
    if (format.includes('HH') || format.includes('mm')) {
        options.hour = '2-digit';
        options.minute = '2-digit';
        options.hour12 = false;
    }
    const formatter = new Intl.DateTimeFormat('fa-IR', options);
    return formatter.format(date);
  } catch (e) { return ''; }
};

export const formatPersianTime = (val: any): string => {
  if (!val) return '';
  try {
    if (typeof val === 'string' && val.includes(':')) {
       const parts = val.split(':');
       return toPersianNumber(`${parts[0]}:${parts[1]}`);
    }
    const d = dayjs(val);
    if (!d.isValid()) return '';
    return toPersianNumber(d.format('HH:mm'));
  } catch { return ''; }
};

export const toEnglishTimeForDB = (val: any): string | null => {
  if (!val) return null;
  try {
    if (dayjs.isDayjs(val)) {
      return val.format('HH:mm:ss');
    }
    const str = String(val);
    const englishStr = str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
    if (englishStr.length === 5) return `${englishStr}:00`;
    return englishStr;
  } catch { return null; }
};

export const toGregorianDateString = (dateVal: any, format: string = 'YYYY-MM-DD'): string | null => {
  if (!dateVal) return null;
  try {
    const base = dayjs.isDayjs(dateVal) ? dateVal : dayjs(dateVal);
    const hasCalendar = (d: any): d is { calendar: (cal: string) => dayjs.Dayjs } =>
      !!d && typeof d.calendar === 'function';
    const greg = hasCalendar(base) ? base.calendar('gregory') : base;
    if (!greg.isValid()) return null;
    return greg.format(format);
  } catch (e) { return null; }
};

export const parseDateValue = (val: any) => {
  if (!val) return null;
  if (typeof val === 'string') {
    const timeMatch = val.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (timeMatch) {
      const normalized = timeMatch[3] ? val : `${val}:00`;
      const t = dayjs(`1970-01-01T${normalized}`);
      return t.isValid() ? t : null;
    }
  }
  const d = dayjs(val);
  if (!d.isValid()) return null;
  const hasCalendar = (o: any): o is { calendar: (cal: string) => dayjs.Dayjs } =>
    !!o && typeof o.calendar === 'function';
  return hasCalendar(d) ? d.calendar('jalali') : d;
};
