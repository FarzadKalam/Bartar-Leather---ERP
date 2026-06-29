import { supabase } from '../supabaseClient';
import { formatRelationOptionLabel } from './relationOptionLabels';
import { applyRelationTargetFilters, filterRelationRows } from './relationFilters';

const RELATION_OPTIONS_DEFAULT_LIMIT = 120;

interface FetchRelationOptionsParams {
  targetModule: string;
  targetField?: string | null;
  relationKey: string;
  filter?: Record<string, any>;
  limit?: number;
  searchTerm?: string | null;
  ids?: Array<string | number>;
}

const resolveTargetField = (targetModule: string, targetField?: string | null) => (
  targetModule === 'product_bundles' && (!targetField || targetField === 'name')
    ? 'bundle_number'
    : (targetField || 'name')
);

const buildSelectFields = (
  targetModule: string,
  targetField: string,
  includeSystemCode: boolean,
) => {
  const fields = ['id', targetField];
  if (targetModule === 'shelves') fields.push('shelf_number');
  if (includeSystemCode) fields.push('system_code');
  if (targetModule === 'products') fields.push('catalog_role');
  return Array.from(new Set(fields)).join(', ');
};

const applyStaticFilter = (query: any, filter?: Record<string, any>) => {
  if (!filter) return query;

  return Object.entries(filter).reduce((currentQuery, [field, value]) => (
    currentQuery.eq(field, value)
  ), query);
};

const normalizeSearchPattern = (value: string) => (
  value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
);

const applySearchFilter = (
  query: any,
  targetModule: string,
  targetField: string,
  rawSearchTerm?: string | null,
) => {
  const normalizedSearchTerm = String(rawSearchTerm || '').trim();
  if (!normalizedSearchTerm) return query;

  const searchFields = [targetField];
  if (targetField !== 'system_code') searchFields.push('system_code');
  if (targetModule === 'shelves' && targetField !== 'shelf_number') searchFields.push('shelf_number');

  const pattern = `%${normalizeSearchPattern(normalizedSearchTerm)}%`;
  const orQuery = Array.from(new Set(searchFields))
    .map((field) => `${field}.ilike."${pattern}"`)
    .join(',');

  return orQuery ? query.or(orQuery) : query;
};

const dedupeRelationOptions = (options: Array<{ label: string; value: any }>) => {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = String(option?.value || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const mapRowsToOptions = (
  rows: any[],
  targetModule: string,
  targetField: string,
  includeSystemCode: boolean,
) => dedupeRelationOptions(
  rows.map((item: any) => ({
    label: includeSystemCode
      ? formatRelationOptionLabel(
          targetModule,
          item?.[targetField] || item?.shelf_number || item?.bundle_number || item?.system_code || item?.id,
          item?.system_code,
        )
      : String(item?.[targetField] || item?.shelf_number || item?.bundle_number || item?.id || ''),
    value: item?.id,
  })),
);

export const fetchRelationOptions = async ({
  targetModule,
  targetField,
  relationKey,
  filter,
  limit = RELATION_OPTIONS_DEFAULT_LIMIT,
  searchTerm,
  ids,
}: FetchRelationOptionsParams): Promise<Array<{ label: string; value: any }>> => {
  if (!targetModule || !relationKey) return [];

  const resolvedTargetField = resolveTargetField(targetModule, targetField);
  const normalizedIds = Array.from(new Set(
    (ids || []).map((item) => String(item || '').trim()).filter(Boolean)
  ));

  const fetchRows = async (includeSystemCode: boolean) => {
    let query = supabase
      .from(targetModule)
      .select(buildSelectFields(targetModule, resolvedTargetField, includeSystemCode));

    query = applyStaticFilter(query, filter);
    query = applyRelationTargetFilters(query, targetModule, relationKey);

    if (normalizedIds.length > 0) {
      query = query.in('id', normalizedIds);
    } else {
      query = applySearchFilter(query, targetModule, resolvedTargetField, searchTerm);
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) throw error;

    return filterRelationRows((data || []) as any[], targetModule, relationKey);
  };

  try {
    const rows = await fetchRows(true);
    return mapRowsToOptions(rows, targetModule, resolvedTargetField, true);
  } catch {
    const rows = await fetchRows(false);
    return mapRowsToOptions(rows, targetModule, resolvedTargetField, false);
  }
};
