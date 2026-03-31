import { FieldType } from '../../types';
import { normalizeFilterValue } from './tableUtils';
import type { SupabaseClient } from '@supabase/supabase-js';

type ProductFilter = {
  filterKey: string;
  value: any;
  colType: FieldType;
  dynamicOptionsCategory?: string;
  dynamicOptions?: any[];
};

type ProductQueryMeta = {
  matchMode: 'all' | 'exact' | 'partial';
  matchedFilterCount: number;
  totalFilterCount: number;
};

type ProductQueryResult<T = any> = {
  data: T[];
  error: any;
  meta: ProductQueryMeta;
};

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
      const options = col.dynamicOptionsCategory
        ? (dynamicOptions[col.dynamicOptionsCategory] || localDynamicOptions[col.dynamicOptionsCategory] || [])
        : [];
      return {
        filterKey: col.filterKey || col.key,
        value,
        colType: col.type,
        dynamicOptionsCategory: col.dynamicOptionsCategory,
        dynamicOptions: options,
      };
    })
    .filter(Boolean) as ProductFilter[];
};

const parsePotentialJsonArray = (value: any) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const resolveDynamicLabel = (val: any, options: any[] = []) => {
  if (val === undefined || val === null || val === '') return null;
  if (val && typeof val === 'object') {
    if ('label' in val && (val as any).label) return (val as any).label;
    if ('value' in val) {
      const byObjValue = options.find((o: any) => o.value === (val as any).value);
      if (byObjValue?.label) return byObjValue.label;
      return (val as any).value;
    }
  }
  if (typeof val === 'string') {
    const byValue = options.find((o: any) => o.value === val);
    if (byValue?.label) return byValue.label;
    const byLabel = options.find((o: any) => o.label === val);
    if (byLabel?.label) return byLabel.label;
  }
  return val;
};

const normalizeRecordValue = (rawValue: any, filter: ProductFilter) => {
  const parsed = parsePotentialJsonArray(rawValue);
  const isArrayType = filter.colType === FieldType.MULTI_SELECT || filter.colType === FieldType.TAGS;
  const isDynamic = !!filter.dynamicOptionsCategory;
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => (isDynamic ? resolveDynamicLabel(item, filter.dynamicOptions) : item))
      .filter((item) => item !== undefined && item !== null && item !== '');
  }
  if (isArrayType && typeof parsed === 'string') {
    return [isDynamic ? resolveDynamicLabel(parsed, filter.dynamicOptions) : parsed].filter(
      (item) => item !== undefined && item !== null && item !== ''
    );
  }
  if (isDynamic) return resolveDynamicLabel(parsed, filter.dynamicOptions);
  return parsed;
};

const normalizeFilterValueForCompare = (value: any) => {
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? v.trim() : v));
  return typeof value === 'string' ? value.trim() : value;
};

const expandCategoryValues = (values: any[]) => {
  const categoryMap: Record<string, string> = {
    leather: 'چرم',
    lining: 'آستر',
    accessory: 'خرجکار',
    fitting: 'یراق',
    'چرم': 'leather',
    'آستر': 'lining',
    'خرجکار': 'accessory',
    'یراق': 'fitting',
  };
  const expanded: any[] = [];
  values.forEach((value) => {
    expanded.push(value);
    if (typeof value === 'string') {
      const mapped = categoryMap[value.trim()];
      if (mapped) expanded.push(mapped);
    }
  });
  return Array.from(new Set(expanded.filter((v) => v !== undefined && v !== null && v !== '')));
};

const matchesFilter = (recordRawValue: any, filter: ProductFilter) => {
  const filterValue = normalizeFilterValueForCompare(filter.value);
  const recordValue = normalizeRecordValue(recordRawValue, filter);

  if (Array.isArray(filterValue)) {
    if (Array.isArray(recordValue)) {
      return filterValue.some((v) => recordValue.includes(v));
    }
    return filterValue.includes(recordValue);
  }

  if (Array.isArray(recordValue)) {
    return recordValue.includes(filterValue);
  }

  return recordValue === filterValue;
};

const countMatchedFilters = (row: any, filters: ProductFilter[]) =>
  filters.reduce((count, filter) => (
    matchesFilter(row?.[filter.filterKey], filter) ? count + 1 : count
  ), 0);

export const runProductsQuery = async (
  supabase: SupabaseClient,
  activeFilters: ProductFilter[],
  selectClause = '*'
): Promise<ProductQueryResult> => {
  const safeServerFilterKeys = new Set(['product_type', 'category']);
  const serverFilters = activeFilters.filter((f) => safeServerFilterKeys.has(f.filterKey));
  const clientFilters = activeFilters.filter((f) => !safeServerFilterKeys.has(f.filterKey));

  let query: any = supabase
    .from('products')
    .select(selectClause);

  serverFilters.forEach((f) => {
    let values = Array.isArray(f.value) ? f.value : [f.value];
    if (f.filterKey === 'category') {
      values = expandCategoryValues(values);
    }
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

  const { data, error } = await query.limit(2000);
  if (error) {
    return {
      data: [],
      error,
      meta: {
        matchMode: 'all',
        matchedFilterCount: 0,
        totalFilterCount: clientFilters.length,
      },
    };
  }

  if (clientFilters.length === 0) {
    return {
      data: data || [],
      error: null,
      meta: {
        matchMode: 'all',
        matchedFilterCount: 0,
        totalFilterCount: 0,
      },
    };
  }

  const ranked = (data || [])
    .map((row: any) => ({
      row,
      matchedFilterCount: countMatchedFilters(row, clientFilters),
    }))
    .sort((a: any, b: any) => {
      if (b.matchedFilterCount !== a.matchedFilterCount) {
        return b.matchedFilterCount - a.matchedFilterCount;
      }
      const aStock = Number(a.row?.stock ?? 0);
      const bStock = Number(b.row?.stock ?? 0);
      if (bStock !== aStock) return bStock - aStock;
      return String(a.row?.name || '').localeCompare(String(b.row?.name || ''), 'fa');
    });

  const exact = ranked.filter((item: any) => item.matchedFilterCount === clientFilters.length);
  if (exact.length > 0) {
    return {
      data: exact.map((item: any) => item.row),
      error: null,
      meta: {
        matchMode: 'exact',
        matchedFilterCount: clientFilters.length,
        totalFilterCount: clientFilters.length,
      },
    };
  }

  const partial = ranked.filter((item: any) => item.matchedFilterCount > 0);
  const bestMatchedCount = partial[0]?.matchedFilterCount ?? 0;

  return {
    data: (partial.length > 0 ? partial : ranked).map((item: any) => item.row),
    error: null,
    meta: {
      matchMode: 'partial',
      matchedFilterCount: bestMatchedCount,
      totalFilterCount: clientFilters.length,
    },
  };
};
