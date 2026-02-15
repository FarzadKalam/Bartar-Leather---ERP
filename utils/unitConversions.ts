export type UnitValue = 'عدد' | 'بسته' | 'فوت مربع' | 'سانتیمتر مربع' | 'میلیمتر مربع' | 'متر مربع';

export const HARD_CODED_UNIT_OPTIONS: Array<{ label: UnitValue; value: UnitValue }> = [
  { label: 'عدد', value: 'عدد' },
  { label: 'بسته', value: 'بسته' },
  { label: 'فوت مربع', value: 'فوت مربع' },
  { label: 'سانتیمتر مربع', value: 'سانتیمتر مربع' },
  { label: 'میلیمتر مربع', value: 'میلیمتر مربع' },
  { label: 'متر مربع', value: 'متر مربع' },
];

const FT2_IN_CM2 = 930.25;
const FT2_IN_MM2 = 93025;
const FT2_IN_M2 = 0.0929025;

export const convertArea = (value: number, from: UnitValue, to: UnitValue) => {
  if (!Number.isFinite(value)) return 0;
  if (from === to) return value;
  if (['عدد', 'بسته'].includes(from) || ['عدد', 'بسته'].includes(to)) return 0;

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

  return fromFt2(toFt2(value, from), to);
};
