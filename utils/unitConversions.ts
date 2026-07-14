export type UnitValue =
  | 'عدد'
  | 'بسته'
  | 'فوت مربع'
  | 'سانتیمتر مربع'
  | 'میلیمتر مربع'
  | 'متر مربع'
  | 'میلیمتر طول'
  | 'سانتیمتر طول'
  | 'متر طول';

export type UnitConversionRecord = Record<string, unknown>;

export type UnitConversionContext = {
  record?: UnitConversionRecord | null;
  widthMm?: number | null;
};

export const HARD_CODED_UNIT_OPTIONS: Array<{ label: UnitValue; value: UnitValue }> = [
  { label: 'عدد', value: 'عدد' },
  { label: 'بسته', value: 'بسته' },
  { label: 'فوت مربع', value: 'فوت مربع' },
  { label: 'سانتیمتر مربع', value: 'سانتیمتر مربع' },
  { label: 'میلیمتر مربع', value: 'میلیمتر مربع' },
  { label: 'متر مربع', value: 'متر مربع' },
  { label: 'میلیمتر طول', value: 'میلیمتر طول' },
  { label: 'سانتیمتر طول', value: 'سانتیمتر طول' },
  { label: 'متر طول', value: 'متر طول' },
];

const FT2_IN_CM2 = 929.0304;
const FT2_IN_MM2 = 92903.04;
const FT2_IN_M2 = 0.09290304;
const M_IN_MM = 1000;
const M_IN_CM = 100;

const AREA_UNITS: UnitValue[] = ['فوت مربع', 'سانتیمتر مربع', 'میلیمتر مربع', 'متر مربع'];
const LENGTH_UNITS: UnitValue[] = ['میلیمتر طول', 'سانتیمتر طول', 'متر طول'];
const DISCRETE_UNITS = new Set<string>(['عدد', 'بسته']);

const MATERIAL_WIDTH_FIELD_KEYS = {
  leather: 'leather_width',
  lining: 'lining_width',
  accessory: 'accessory_width',
} as const;

export const normalizeUnitValue = (raw?: string | null): UnitValue | '' => {
  const value = String(raw || '')
    .trim()
    .replace(/\u200c/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ');
  const compact = value.replace(/\s+/g, '');
  if (!compact) return '';
  if (compact === 'سانتیمترمربع' || compact === 'سانتیمترمربع') return 'سانتیمتر مربع';
  if (compact === 'میلیمترمربع') return 'میلیمتر مربع';
  if (compact === 'مترمربع') return 'متر مربع';
  if (compact === 'فوتمربع' || compact === 'فوت') return 'فوت مربع';
  if (compact === 'سانتیمترطول' || compact === 'سانتیمتر') return 'سانتیمتر طول';
  if (compact === 'میلیمترطول' || compact === 'میلیمتر') return 'میلیمتر طول';
  if (compact === 'مترطول' || compact === 'متر') return 'متر طول';
  if (compact === 'عدد') return 'عدد';
  if (compact === 'بسته') return 'بسته';
  return value as UnitValue;
};
const roundToThree = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
};

const normalizeNumericInput = (raw: unknown) => {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/\u066B/g, '.')
    .replace(/[\u066C\u060C]/g, ',')
    .replace(/\s+/g, '')
    .replace(/,/g, '');
};

const toNumber = (raw: unknown) => {
  const normalized = normalizeNumericInput(raw);
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return 0;
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeMaterialCategory = (raw?: unknown) => {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value === 'چرم') return 'leather';
  if (value === 'آستر') return 'lining';
  if (value === 'خرجکار') return 'accessory';
  if (value === 'یراق') return 'fitting';
  return value;
};

const getWidthFieldCandidates = (record?: UnitConversionRecord | null) => {
  const category = normalizeMaterialCategory(record?.category ?? record?.material_category);
  const preferred = category && category in MATERIAL_WIDTH_FIELD_KEYS
    ? [MATERIAL_WIDTH_FIELD_KEYS[category as keyof typeof MATERIAL_WIDTH_FIELD_KEYS]]
    : [];

  return [
    ...preferred,
    'conversion_width_mm',
    'material_width_mm',
    'leather_width',
    'lining_width',
    'accessory_width',
  ];
};

export const resolveUnitConversionWidthMm = (context?: UnitConversionContext | null) => {
  const directWidth = toNumber(context?.widthMm);
  if (directWidth > 0) return directWidth;

  const record = context?.record;
  if (!record) return null;

  const candidates = getWidthFieldCandidates(record);
  for (const key of candidates) {
    const width = toNumber(record?.[key]);
    if (width > 0) return width;
  }
  return null;
};

export const isAreaUnit = (value?: string | null) => AREA_UNITS.includes(normalizeUnitValue(value) as UnitValue);
export const isLengthUnit = (value?: string | null) => LENGTH_UNITS.includes(normalizeUnitValue(value) as UnitValue);

export const isCrossDimensionUnitConversion = (from?: string | null, to?: string | null) => {
  const source = normalizeUnitValue(from);
  const target = normalizeUnitValue(to);
  if (!source || !target || source === target) return false;
  return (AREA_UNITS.includes(source) && LENGTH_UNITS.includes(target))
    || (LENGTH_UNITS.includes(source) && AREA_UNITS.includes(target));
};

export const canConvertUnits = (from?: string | null, to?: string | null) => {
  const source = normalizeUnitValue(from);
  const target = normalizeUnitValue(to);
  if (!source || !target || source === target) return false;
  if (DISCRETE_UNITS.has(source) || DISCRETE_UNITS.has(target)) return false;
  const isArea = AREA_UNITS.includes(source) && AREA_UNITS.includes(target);
  const isLength = LENGTH_UNITS.includes(source) && LENGTH_UNITS.includes(target);
  const isCrossDimension = isCrossDimensionUnitConversion(source, target);
  return isArea || isLength || isCrossDimension;
};

export const convertBetweenUnits = (
  value: number,
  from?: string | null,
  to?: string | null,
  context?: UnitConversionContext | null,
) => {
  if (!Number.isFinite(value)) return 0;
  const source = normalizeUnitValue(from);
  const target = normalizeUnitValue(to);
  if (!source || !target) return 0;
  if (source === target) return roundToThree(value);
  if (!canConvertUnits(source, target)) return Number.NaN;
  return convertArea(value, source, target, context);
};

const convertAreaValue = (
  value: number,
  from: UnitValue,
  to: UnitValue,
  context?: UnitConversionContext | null,
  roundResult = true,
) => {
  const finalize = (result: number) => roundResult ? roundToThree(result) : result;
  if (!Number.isFinite(value)) return 0;
  if (from === to) return finalize(value);
  if (['عدد', 'بسته'].includes(from) || ['عدد', 'بسته'].includes(to)) return 0;

  const isArea = AREA_UNITS.includes(from) && AREA_UNITS.includes(to);
  const isLength = LENGTH_UNITS.includes(from) && LENGTH_UNITS.includes(to);
  const isCrossDimension = isCrossDimensionUnitConversion(from, to);
  if (!isArea && !isLength && !isCrossDimension) return Number.NaN;

  const toFt2 = (val: number, unit: UnitValue) => {
    switch (unit) {
      case 'فوت مربع':
        return val;
      case 'سانتیمتر مربع':
        return val / FT2_IN_CM2;
      case 'میلیمتر مربع':
        return val / FT2_IN_MM2;
      case 'متر مربع':
        return val / FT2_IN_M2;
      default:
        return 0;
    }
  };

  const fromFt2 = (val: number, unit: UnitValue) => {
    switch (unit) {
      case 'فوت مربع':
        return val;
      case 'سانتیمتر مربع':
        return val * FT2_IN_CM2;
      case 'میلیمتر مربع':
        return val * FT2_IN_MM2;
      case 'متر مربع':
        return val * FT2_IN_M2;
      default:
        return 0;
    }
  };

  const toMeter = (val: number, unit: UnitValue) => {
    switch (unit) {
      case 'متر طول':
        return val;
      case 'سانتیمتر طول':
        return val / M_IN_CM;
      case 'میلیمتر طول':
        return val / M_IN_MM;
      default:
        return 0;
    }
  };

  const fromMeter = (val: number, unit: UnitValue) => {
    switch (unit) {
      case 'متر طول':
        return val;
      case 'سانتیمتر طول':
        return val * M_IN_CM;
      case 'میلیمتر طول':
        return val * M_IN_MM;
      default:
        return 0;
    }
  };

  if (isLength) {
    return finalize(fromMeter(toMeter(value, from), to));
  }

  if (isArea) {
    return finalize(fromFt2(toFt2(value, from), to));
  }

  const widthMm = resolveUnitConversionWidthMm(context);
  if (!widthMm || widthMm <= 0) return Number.NaN;

  if (AREA_UNITS.includes(from) && LENGTH_UNITS.includes(to)) {
    const areaMm2 = fromFt2(toFt2(value, from), 'میلیمتر مربع');
    const lengthMm = areaMm2 / widthMm;
    return finalize(fromMeter(lengthMm / M_IN_MM, to));
  }

  const lengthMm = toMeter(value, from) * M_IN_MM;
  const areaMm2 = lengthMm * widthMm;
  return finalize(fromFt2(areaMm2 / FT2_IN_MM2, to));
};

export const convertArea = (
  value: number,
  from: UnitValue,
  to: UnitValue,
  context?: UnitConversionContext | null,
) => convertAreaValue(value, from, to, context, true);

export const getUnitConversionFactor = (
  from?: string | null,
  to?: string | null,
  context?: UnitConversionContext | null,
) => {
  const source = normalizeUnitValue(from);
  const target = normalizeUnitValue(to);
  if (!source || !target) return Number.NaN;
  if (source === target) return 1;
  if (!canConvertUnits(source, target)) return Number.NaN;
  return convertAreaValue(1, source, target, context, false);
};
