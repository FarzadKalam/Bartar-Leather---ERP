import { FieldType } from '../../types';
import { normalizeFilterValue } from './tableUtils';
import type { SupabaseClient } from '@supabase/supabase-js';

export const buildProductFilters = (
  tableColumns: any[],
  rowData: any,
  dynamicOptions: Record<string, any[]>,
  localDynamicOptions: Record<string, any[]>
) => {
  return (tableColumns || [])
    .filter((col: any) => col.filterable)
    .map((col: any) => {
      const rawValue = rowData?.[col.key];
      const value = normalizeFilterValue(col, rawValue, dynamicOptions, localDynamicOptions);
      if (value === undefined || value === null || value === '') return null;
      if (Array.isArray(value) && value.length === 0) return null;
      return { filterKey: col.filterKey || col.key, value, colType: col.type };
    })
    .filter(Boolean) as Array<{ filterKey: string; value: any; colType: FieldType }>;
};

export const runProductsQuery = async (
  supabase: SupabaseClient,
  activeFilters: Array<{ filterKey: string; value: any; colType: FieldType }>
) => {
  let query: any = supabase
    .from('products')
    .select('*');

  activeFilters.forEach((f) => {
    const values = Array.isArray(f.value) ? f.value : [f.value];
    const needsContains = f.colType === FieldType.MULTI_SELECT || f.colType === FieldType.TAGS;
    if (needsContains) {
      if (values.length === 1) {
        query = query.contains(f.filterKey, values);
        return;
      }
      const orFilters = values
        .map((val) => `${f.filterKey}.cs.${JSON.stringify([val])}`)
        .join(',');
      query = query.or(orFilters);
      return;
    }
    if (values.length > 1) {
      query = query.in(f.filterKey, values);
      return;
    }
    query = query.eq(f.filterKey, values[0]);
  });

  return query.limit(200);
};
