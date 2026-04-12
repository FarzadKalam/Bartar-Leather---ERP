export const shouldUseParentOnlyProductOptions = (fieldKey?: string | null) => {
  const normalized = String(fieldKey || '').trim();
  return normalized === 'parent_product_id';
};

export const applyRelationTargetFilters = (
  query: any,
  targetModule?: string | null,
  fieldKey?: string | null,
) => {
  if (!query || String(targetModule || '').trim() !== 'products') return query;
  if (shouldUseParentOnlyProductOptions(fieldKey)) {
    return query.neq('catalog_role', 'variant');
  }
  return query.neq('catalog_role', 'parent');
};

export const filterRelationRows = <T extends Record<string, any>>(
  rows: T[],
  targetModule?: string | null,
  fieldKey?: string | null,
) => {
  if (String(targetModule || '').trim() !== 'products') return rows;
  const parentOnly = shouldUseParentOnlyProductOptions(fieldKey);
  return rows.filter((row) => {
    const role = String(row?.catalog_role || 'standalone').trim();
    if (parentOnly) return role !== 'variant';
    return role !== 'parent';
  });
};
