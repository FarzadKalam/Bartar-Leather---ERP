import { FieldType } from '../../types';

export const dedupeOptionsByLabel = (options: any[]) => {
  const map = new Map<string, any>();
  options.forEach((opt) => {
    const label = opt?.label ?? String(opt?.value ?? '');
    if (!map.has(label)) map.set(label, opt);
  });
  return Array.from(map.values());
};

export const normalizeFilterValue = (
  col: any,
  rawValue: any,
  dynamicOptions: Record<string, any[]>,
  localDynamicOptions: Record<string, any[]>
) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') return null;

  let normalizedRaw = rawValue;
  if ((col?.type === FieldType.MULTI_SELECT || col?.type === FieldType.TAGS) && typeof normalizedRaw === 'string') {
    const trimmed = normalizedRaw.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) normalizedRaw = parsed;
      } catch {
        // ignore parsing errors
      }
    }
  }

  const normalizeSingle = (val: any) => {
    if (val && typeof val === 'object') {
      if ('value' in val) return (val as any).value;
      if ('label' in val) return (val as any).label;
    }
    return val;
  };

  const resolveDynamicValues = (val: any) => {
    const opts = col?.dynamicOptionsCategory
      ? (dynamicOptions[col.dynamicOptionsCategory] || localDynamicOptions[col.dynamicOptionsCategory] || [])
      : [];
    if (!opts.length || typeof val !== 'string') return [val];

    const byValue = opts.find((o: any) => o.value === val);
    const label = byValue?.label || val;
    const valuesByLabel = opts.filter((o: any) => o.label === label).map((o: any) => o.value);
    const combined = [val, ...valuesByLabel];
    if (byValue?.label) combined.push(byValue.label);
    return combined.filter((v) => v !== undefined && v !== null && v !== '').filter((v, i, arr) => arr.indexOf(v) === i);
  };

  if (Array.isArray(normalizedRaw)) {
    const mapped = normalizedRaw
      .flatMap((v) => {
        const single = normalizeSingle(v);
        if (col?.dynamicOptionsCategory && typeof single === 'string') {
          return resolveDynamicValues(single);
        }
        return [single];
      })
      .filter((v) => v !== undefined && v !== null && v !== '');
    return mapped.length > 0 ? Array.from(new Set(mapped)) : null;
  }

  const single = normalizeSingle(normalizedRaw);
  if (col?.dynamicOptionsCategory && typeof single === 'string') {
    const values = resolveDynamicValues(single);
    return values.length > 0 ? values : null;
  }

  return single;
};
