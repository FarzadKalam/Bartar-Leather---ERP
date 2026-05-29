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
const normalizeUnitValue = (raw?: string | null): UnitValue | '' => {
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

export const canConvertUnits = (from?: string | null, to?: string | null) => {
  const source = normalizeUnitValue(from);
  const target = normalizeUnitValue(to);
  if (!source || !target || source === target) return false;
  if (DISCRETE_UNITS.has(source) || DISCRETE_UNITS.has(target)) return false;
  const isArea = AREA_UNITS.includes(source) && AREA_UNITS.includes(target);
  const isLength = LENGTH_UNITS.includes(source) && LENGTH_UNITS.includes(target);
  return isArea || isLength;
};

export const convertBetweenUnits = (value: number, from?: string | null, to?: string | null) => {
  if (!Number.isFinite(value)) return 0;
  const source = normalizeUnitValue(from);
  const target = normalizeUnitValue(to);
  if (!source || !target) return 0;
  if (source === target) return roundToThree(value);
  if (!canConvertUnits(source, target)) return 0;
  return convertArea(value, source, target);
};

export const convertArea = (value: number, from: UnitValue, to: UnitValue) => {
  if (!Number.isFinite(value)) return 0;
  if (from === to) return roundToThree(value);
  if (['عدد', 'بسته'].includes(from) || ['عدد', 'بسته'].includes(to)) return 0;

  const isArea = AREA_UNITS.includes(from) && AREA_UNITS.includes(to);
  const isLength = LENGTH_UNITS.includes(from) && LENGTH_UNITS.includes(to);
  if (!isArea && !isLength) return 0;

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
    return roundToThree(fromMeter(toMeter(value, from), to));
  }

  return roundToThree(fromFt2(toFt2(value, from), to));
};
