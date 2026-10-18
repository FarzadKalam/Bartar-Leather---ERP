import { toPersianNumber } from './persianNumberFormatter';

const toEnglishDigits = (value: unknown) => String(value ?? '')
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

/** Removes visual thousands separators while preserving a valid decimal number. */
export const normalizeGroupedNumberInput = (value: unknown): string => (
  toEnglishDigits(value).replace(/[٬,\s]/g, '').trim()
);

/** Formats a numeric input with Persian digits and three-digit price separators. */
export const formatGroupedNumberInput = (value: unknown): string => {
  const raw = normalizeGroupedNumberInput(value);
  if (!raw) return '';

  const sign = raw.startsWith('-') ? '-' : '';
  const unsigned = raw.replace(/-/g, '');
  const [integerRaw, decimalPart] = unsigned.split('.');
  const integer = (integerRaw || '0').replace(/^0+(?=\d)/, '');
  const grouped = (integer || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return toPersianNumber(`${sign}${decimalPart === undefined ? grouped : `${grouped}.${decimalPart}`}`);
};

/** Parser suitable for Ant Design InputNumber fields. */
export const parseGroupedNumberInput = (value?: string): number => {
  const normalized = normalizeGroupedNumberInput(value);
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};
