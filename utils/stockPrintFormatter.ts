import { convertBetweenUnits } from './unitConversions';
import { toPersianNumber } from './persianNumberFormatter';

const normalizeNumericValue = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const normalized = String(value)
    .trim()
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u066C\u060C]/g, ',')
    .replace(/\s+/g, '')
    .replace(/,/g, '');

  if (!normalized) return null;
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatNumericLabel = (value: number) => {
  const text = Number.isInteger(value)
    ? String(value)
    : value.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      });
  return toPersianNumber(text);
};

const buildUnitLabel = (value: number, unit?: string | null) => {
  const suffix = String(unit || '').trim();
  return `${formatNumericLabel(value)}${suffix ? ` ${suffix}` : ''}`.trim();
};

export const formatStockPrintValue = (fieldKey: string, value: any, record?: any) => {
  const numericValue = normalizeNumericValue(value);
  if (numericValue === null) return value === null || value === undefined ? '' : String(value);

  const mainUnit = String(record?.main_unit || '').trim();
  const subUnit = String(record?.sub_unit || '').trim();

  if (fieldKey === 'stock') {
    const mainLabel = buildUnitLabel(numericValue, mainUnit);
    if (!subUnit || subUnit === mainUnit) return mainLabel;

    const storedSecondaryValue = normalizeNumericValue(record?.sub_stock);
    const computedSecondaryValue = convertBetweenUnits(numericValue, mainUnit, subUnit, { record });
    const secondaryValue = storedSecondaryValue === null
      || (storedSecondaryValue === 0 && numericValue !== 0 && Number.isFinite(computedSecondaryValue) && computedSecondaryValue !== 0)
      ? computedSecondaryValue
      : storedSecondaryValue;

    if (!Number.isFinite(secondaryValue)) return mainLabel;
    return `${mainLabel} (${buildUnitLabel(secondaryValue, subUnit)})`;
  }

  if (fieldKey === 'sub_stock') {
    const subLabel = buildUnitLabel(numericValue, subUnit);
    if (!mainUnit || !subUnit || mainUnit === subUnit) return subLabel;

    const storedMainValue = normalizeNumericValue(record?.stock);
    const computedMainValue = convertBetweenUnits(numericValue, subUnit, mainUnit, { record });
    const mainValue = storedMainValue === null
      || (storedMainValue === 0 && numericValue !== 0 && Number.isFinite(computedMainValue) && computedMainValue !== 0)
      ? computedMainValue
      : storedMainValue;
    if (!Number.isFinite(mainValue)) return subLabel;
    return `${subLabel} (${buildUnitLabel(mainValue, mainUnit)})`;
  }

  return formatNumericLabel(numericValue);
};
