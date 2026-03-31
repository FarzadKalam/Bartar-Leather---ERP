import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import { FieldType } from '../types';

type DynamicOptionFieldReference = {
  moduleId: string;
  table: string;
  fieldKey: string;
  fieldType: string;
  blockId?: string;
};

type DynamicOptionMigrationParams = {
  category: string;
  fromValue: string;
  toValue: string | null;
};

type DynamicOptionMigrationResult = {
  affectedModules: number;
  updatedRecords: number;
  updatedFields: number;
};

const SUPPORTED_DYNAMIC_FIELD_TYPES = new Set<string>([
  FieldType.SELECT,
  FieldType.MULTI_SELECT,
  FieldType.STATUS,
]);

const PAGE_SIZE = 500;

const normalizeComparableValue = (value: any) => String(value ?? '').trim();

const valuesMatch = (left: any, right: any) =>
  normalizeComparableValue(left) === normalizeComparableValue(right);

const toComparableKey = (value: any) => normalizeComparableValue(value).toLowerCase();

const dedupeArrayValues = (values: any[]) => {
  const seen = new Set<string>();
  const next: any[] = [];
  values.forEach((item) => {
    const key = toComparableKey(item);
    if (!key || seen.has(key)) return;
    seen.add(key);
    next.push(item);
  });
  return next;
};

const tryParseArrayValue = (value: any) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const remapStoredValue = (
  input: any,
  fieldType: string,
  fromValue: string,
  toValue: string | null
): { changed: boolean; nextValue: any } => {
  const normalizedFromValue = normalizeComparableValue(fromValue);
  if (!normalizedFromValue) {
    return { changed: false, nextValue: input };
  }

  if (fieldType === FieldType.MULTI_SELECT) {
    const sourceArray = Array.isArray(input) ? input : (tryParseArrayValue(input) || null);
    if (!sourceArray) {
      return { changed: false, nextValue: input };
    }

    let changed = false;
    const nextArray = sourceArray.flatMap((item) => {
      if (!valuesMatch(item, normalizedFromValue)) return [item];
      changed = true;
      return toValue === null ? [] : [toValue];
    });

    if (!changed) {
      return { changed: false, nextValue: input };
    }

    return {
      changed: true,
      nextValue: dedupeArrayValues(nextArray),
    };
  }

  if (!valuesMatch(input, normalizedFromValue)) {
    return { changed: false, nextValue: input };
  }

  return {
    changed: true,
    nextValue: toValue,
  };
};

const collectDynamicOptionReferences = (category: string): DynamicOptionFieldReference[] => {
  const normalizedCategory = normalizeComparableValue(category);
  if (!normalizedCategory) return [];

  const references: DynamicOptionFieldReference[] = [];

  Object.entries(MODULES).forEach(([moduleId, moduleDef]) => {
    moduleDef.fields.forEach((field) => {
      if (normalizeComparableValue(field.dynamicOptionsCategory) !== normalizedCategory) return;
      if (!SUPPORTED_DYNAMIC_FIELD_TYPES.has(String(field.type))) return;
      references.push({
        moduleId,
        table: moduleDef.table,
        fieldKey: field.key,
        fieldType: String(field.type),
      });
    });

    moduleDef.blocks.forEach((block) => {
      (block.tableColumns || []).forEach((column) => {
        if (normalizeComparableValue(column.dynamicOptionsCategory) !== normalizedCategory) return;
        if (!SUPPORTED_DYNAMIC_FIELD_TYPES.has(String(column.type))) return;
        references.push({
          moduleId,
          table: moduleDef.table,
          fieldKey: String(column.key),
          fieldType: String(column.type),
          blockId: String(block.id),
        });
      });
    });
  });

  return references;
};

const fetchAllRows = async (table: string, selectClause: string) => {
  const rows: any[] = [];
  let pageIndex = 0;

  while (true) {
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select(selectClause)
      .range(from, to);

    if (error) throw error;

    const pageRows = Array.isArray(data) ? data : [];
    rows.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) break;
    pageIndex += 1;
  }

  return rows;
};

export const migrateDynamicOptionUsage = async ({
  category,
  fromValue,
  toValue,
}: DynamicOptionMigrationParams): Promise<DynamicOptionMigrationResult> => {
  const references = collectDynamicOptionReferences(category);
  if (references.length === 0) {
    return { affectedModules: 0, updatedRecords: 0, updatedFields: 0 };
  }

  const referencesByTable = new Map<string, DynamicOptionFieldReference[]>();
  references.forEach((reference) => {
    const current = referencesByTable.get(reference.table) || [];
    current.push(reference);
    referencesByTable.set(reference.table, current);
  });

  let updatedRecords = 0;
  let updatedFields = 0;

  for (const [table, tableReferences] of referencesByTable.entries()) {
    const selectColumns = Array.from(new Set([
      'id',
      ...tableReferences
        .map((reference) => reference.blockId || reference.fieldKey)
        .filter(Boolean),
    ]));

    const rows = await fetchAllRows(table, selectColumns.join(', '));

    for (const row of rows) {
      if (!row?.id) continue;

      const patch: Record<string, any> = {};
      let recordChanged = false;

      tableReferences
        .filter((reference) => !reference.blockId)
        .forEach((reference) => {
          const remapped = remapStoredValue(row?.[reference.fieldKey], reference.fieldType, fromValue, toValue);
          if (!remapped.changed) return;
          patch[reference.fieldKey] = remapped.nextValue;
          updatedFields += 1;
          recordChanged = true;
        });

      const blockIds = Array.from(new Set(
        tableReferences
          .map((reference) => reference.blockId)
          .filter(Boolean)
      )) as string[];

      blockIds.forEach((blockId) => {
        const blockReferences = tableReferences.filter((reference) => reference.blockId === blockId);
        const currentRows = Array.isArray(row?.[blockId]) ? row[blockId] : null;
        if (!currentRows) return;

        let blockChanged = false;
        const nextRows = currentRows.map((item: any) => {
          if (!item || typeof item !== 'object') return item;
          let nextItem = item;

          blockReferences.forEach((reference) => {
            const remapped = remapStoredValue(item?.[reference.fieldKey], reference.fieldType, fromValue, toValue);
            if (!remapped.changed) return;
            if (nextItem === item) {
              nextItem = { ...item };
            }
            nextItem[reference.fieldKey] = remapped.nextValue;
            updatedFields += 1;
            blockChanged = true;
          });

          return nextItem;
        });

        if (!blockChanged) return;
        patch[blockId] = nextRows;
        recordChanged = true;
      });

      if (!recordChanged) continue;

      const { error } = await supabase
        .from(table)
        .update(patch)
        .eq('id', row.id);

      if (error) throw error;
      updatedRecords += 1;
    }
  }

  return {
    affectedModules: referencesByTable.size,
    updatedRecords,
    updatedFields,
  };
};
