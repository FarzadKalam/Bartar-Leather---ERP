/**
 * نگه‌داری پیش‌نویس فرم‌های عملیاتی در مرورگر.
 * داده فقط روی دستگاه کاربر باقی می‌ماند و تا ثبت نهایی فرم پاک نمی‌شود.
 */
export const readDurableDraft = <T>(key: string): T | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.value as T || null;
  } catch {
    return null;
  }
};

export const writeDurableDraft = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), value }));
  } catch {
    // پر بودن فضای مرورگر نباید مانع تکمیل فرم شود.
  }
};

export const clearDurableDraft = (key: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage access failures
  }
};
