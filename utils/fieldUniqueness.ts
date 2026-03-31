import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import { FieldUniqueness, ModuleField } from '../types';

type DuplicateCheckParams = {
  moduleId?: string | null;
  field: ModuleField;
  value: any;
  recordId?: string | null;
  allValues?: Record<string, any>;
};

type DuplicateCheckResult = {
  isDuplicate: boolean;
  matchingId?: string | null;
};

const DEFAULT_NORMALIZATION: NonNullable<FieldUniqueness['normalization']> = 'trim_lower_spaces';

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();
const escapeLikeValue = (value: string) => value.replace(/[%_]/g, (token) => `\\${token}`);

export const normalizeUniqueValue = (
  raw: any,
  normalization: FieldUniqueness['normalization'] = DEFAULT_NORMALIZATION
): string => {
  if (raw === null || raw === undefined) return '';
  let next = String(raw);

  if (normalization === 'trim' || normalization === 'trim_lower' || normalization === 'trim_lower_spaces') {
    next = next.trim();
  }
  if (normalization === 'trim_lower_spaces') {
    next = normalizeWhitespace(next);
  }
  if (normalization === 'trim_lower' || normalization === 'trim_lower_spaces') {
    next = next.toLocaleLowerCase('fa-IR');
  }

  return next;
};

export const isUniqueField = (field?: ModuleField | null): boolean => field?.uniqueness?.enabled === true;

export const getUniqueFieldMessage = (field: ModuleField): string =>
  field.uniqueness?.message || `مقدار «${field.labels?.fa || field.key}» تکراری است.`;

export const checkFieldDuplicate = async ({
  moduleId,
  field,
  value,
  recordId,
  allValues,
}: DuplicateCheckParams): Promise<DuplicateCheckResult> => {
  if (!moduleId || !isUniqueField(field)) {
    return { isDuplicate: false };
  }

  const uniqueness = field.uniqueness || {};
  const normalizedValue = normalizeUniqueValue(value, uniqueness.normalization);
  if (!normalizedValue) {
    return { isDuplicate: false };
  }

  const moduleConfig = MODULES[moduleId];
  const tableName = moduleConfig?.table || moduleId;
  const scopeKeys = (uniqueness.scopeKeys || []).filter(Boolean);
  const selectFields = Array.from(new Set(['id', field.key, ...scopeKeys])).join(', ');
  let query = supabase
    .from(tableName)
    .select(selectFields)
    .limit(50);

  const rawSearchValue = typeof value === 'string' ? String(value).trim() : '';
  if (rawSearchValue) {
    query = query.ilike(field.key, escapeLikeValue(rawSearchValue));
  }

  if (recordId) {
    query = query.neq('id', recordId);
  }

  for (const scopeKey of scopeKeys) {
    const scopeValue = allValues?.[scopeKey];
    if (scopeValue === null || scopeValue === undefined || scopeValue === '') {
      query = query.is(scopeKey, null);
    } else {
      query = query.eq(scopeKey, scopeValue);
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  const matchedRow = (data || []).find((row: any) => {
    const candidateValue = normalizeUniqueValue(row?.[field.key], uniqueness.normalization);
    return candidateValue === normalizedValue;
  }) as any;

  return {
    isDuplicate: !!matchedRow,
    matchingId: matchedRow?.id ? String(matchedRow.id) : null,
  };
};

export const findDuplicateUniqueFields = async ({
  moduleId,
  fields,
  values,
  recordId,
}: {
  moduleId?: string | null;
  fields: ModuleField[];
  values: Record<string, any>;
  recordId?: string | null;
}): Promise<Array<{ fieldKey: string; message: string }>> => {
  const uniqueFields = (fields || []).filter((field) => isUniqueField(field));
  const violations: Array<{ fieldKey: string; message: string }> = [];

  for (const field of uniqueFields) {
    const result = await checkFieldDuplicate({
      moduleId,
      field,
      value: values?.[field.key],
      recordId,
      allValues: values,
    });
    if (result.isDuplicate) {
      violations.push({
        fieldKey: field.key,
        message: getUniqueFieldMessage(field),
      });
    }
  }

  return violations;
};
