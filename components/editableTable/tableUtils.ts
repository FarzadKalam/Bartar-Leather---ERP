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
    return valuesByLabel.length > 0 ? Array.from(new Set(valuesByLabel)) : [val];
  };

  if (Array.isArray(rawValue)) {
    const mapped = rawValue
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

  const single = normalizeSingle(rawValue);
  if (col?.dynamicOptionsCategory && typeof single === 'string') {
    const values = resolveDynamicValues(single);
    return values.length > 0 ? values : null;
  }

  return single;
};
