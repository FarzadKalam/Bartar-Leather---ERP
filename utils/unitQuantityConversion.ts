import {
  canConvertUnits,
  convertBetweenUnits,
  isCrossDimensionUnitConversion,
  resolveUnitConversionWidthMm,
} from './unitConversions';

export type QuantityDirection = 'main_to_sub' | 'sub_to_main';

export type UnitQuantityConversion = {
  direction: QuantityDirection;
  sourceQtyKey: string;
  targetQtyKey: string;
  sourceUnitKey: string;
  targetUnitKey: string;
  buttonLabel: string;
  title: string;
};

const PAIRS = [
  { mainQtyKey: 'stock', subQtyKey: 'sub_stock' },
  { mainQtyKey: 'quantity', subQtyKey: 'sub_quantity' },
  { mainQtyKey: 'main_quantity', subQtyKey: 'sub_quantity' },
  { mainQtyKey: 'qty_main', subQtyKey: 'qty_sub' },
  { mainQtyKey: 'delivered_qty', subQtyKey: 'required_qty' },
  { mainQtyKey: 'opening_stock', subQtyKey: 'opening_sub_stock' },
];

export const getUnitQuantityConversion = (
  fieldKey?: string | null,
  options?: { availableKeys?: Iterable<string> | null }
): UnitQuantityConversion | null => {
  const key = String(fieldKey || '').trim();
  const availableKeys = options?.availableKeys
    ? new Set(Array.from(options.availableKeys).map((item) => String(item || '').trim()).filter(Boolean))
    : null;
  const candidates = PAIRS.filter((item) => item.mainQtyKey === key || item.subQtyKey === key);
  const pair = availableKeys
    ? (candidates.find((item) => availableKeys.has(item.mainQtyKey) && availableKeys.has(item.subQtyKey)) || candidates[0])
    : candidates[0];
  if (!pair) return null;

  if (key === pair.mainQtyKey) {
    return {
      direction: 'main_to_sub',
      sourceQtyKey: pair.mainQtyKey,
      targetQtyKey: pair.subQtyKey,
      sourceUnitKey: 'main_unit',
      targetUnitKey: 'sub_unit',
      buttonLabel: 'محاسبه واحد فرعی',
      title: 'محاسبه واحد فرعی',
    };
  }

  return {
    direction: 'sub_to_main',
    sourceQtyKey: pair.subQtyKey,
    targetQtyKey: pair.mainQtyKey,
    sourceUnitKey: 'sub_unit',
    targetUnitKey: 'main_unit',
    buttonLabel: 'محاسبه واحد اصلی',
    title: 'محاسبه واحد اصلی',
  };
};

const normalizeDigitsToEnglish = (raw: unknown): string => {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u066C\u060C]/g, ',')
    .replace(/\s+/g, '')
    .replace(/,/g, '');
};

export const toUnitQuantityNumber = (raw: unknown): number => {
  const normalized = normalizeDigitsToEnglish(raw);
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return 0;
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const canCalculateUnitQuantity = (
  values: Record<string, unknown> | null | undefined,
  conversion: UnitQuantityConversion | null
) => {
  if (!values || !conversion) return false;
  const sourceUnit = String(values[conversion.sourceUnitKey] || '').trim();
  const targetUnit = String(values[conversion.targetUnitKey] || '').trim();
  if (!sourceUnit || !targetUnit) return false;
  return sourceUnit === targetUnit || canConvertUnits(sourceUnit, targetUnit);
};

export const calculateUnitQuantity = (
  values: Record<string, unknown> | null | undefined,
  conversion: UnitQuantityConversion
) => {
  const sourceQty = toUnitQuantityNumber(values?.[conversion.sourceQtyKey]);
  const sourceUnit = String(values?.[conversion.sourceUnitKey] || '').trim();
  const targetUnit = String(values?.[conversion.targetUnitKey] || '').trim();

  if (!sourceQty) {
    throw new Error('برای محاسبه، مقدار مبدا باید بیشتر از صفر باشد.');
  }
  if (!sourceUnit || !targetUnit) {
    throw new Error('برای محاسبه، واحد اصلی و واحد فرعی باید مشخص باشند.');
  }
  if (sourceUnit === targetUnit) return sourceQty;
  if (!canConvertUnits(sourceUnit, targetUnit)) {
    throw new Error(`تبدیل واحد "${sourceUnit}" به "${targetUnit}" ممکن نیست.`);
  }

  if (isCrossDimensionUnitConversion(sourceUnit, targetUnit) && !resolveUnitConversionWidthMm({ record: values })) {
    throw new Error('برای تبدیل بین واحد سطح و طول، عرض اختصاصی ماده اولیه باید بر حسب میلیمتر وارد شده باشد.');
  }

  const converted = convertBetweenUnits(sourceQty, sourceUnit, targetUnit, { record: values });
  if (!Number.isFinite(converted)) {
    throw new Error(`تبدیل واحد "${sourceUnit}" به "${targetUnit}" ممکن نیست.`);
  }
  return converted;
};
