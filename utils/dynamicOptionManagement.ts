import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import { BlockType, FieldType, ModuleNature } from '../types';

type DynamicOptionFieldReference = {
  moduleId: string;
  table: string;
  fieldKey: string;
  fieldType: string;
  storage: 'column' | 'block_row' | 'grid_spec';
  containerKey?: string;
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

const isSupportedDynamicField = (field: any, category: string) =>
  normalizeComparableValue(field?.dynamicOptionsCategory) === category
  && SUPPORTED_DYNAMIC_FIELD_TYPES.has(String(field?.type));

const collectDynamicOptionReferences = (category: string): DynamicOptionFieldReference[] => {
  const normalizedCategory = normalizeComparableValue(category);
  if (!normalizedCategory) return [];

  const references: DynamicOptionFieldReference[] = [];

  Object.entries(MODULES).forEach(([moduleId, moduleDef]) => {
    const gridBlocks = moduleDef.blocks.filter((block) => block.type === BlockType.GRID_TABLE);
    const gridSpecBlockIds = new Set(
      gridBlocks.flatMap((block: any) =>
        (block.gridConfig?.categories || [])
          .map((item: any) => String(item?.specBlockId || '').trim())
          .filter(Boolean)
      )
    );

    moduleDef.fields.forEach((field) => {
      if (!isSupportedDynamicField(field, normalizedCategory)) return;

      const isGridSpec = !!field.blockId && gridSpecBlockIds.has(String(field.blockId));

      // در ماژول‌های تولید، فیلدهای مشخصات فقط تعریف نمایشی برای GridTable هستند؛
      // مقدارشان در grid_materials[].specs ذخیره می‌شود و ستون مستقل ندارند.
      if (!isGridSpec || moduleDef.nature !== ModuleNature.PRODUCTION) {
        references.push({
          moduleId,
          table: moduleDef.table,
          fieldKey: field.key,
          fieldType: String(field.type),
          storage: 'column',
        });
      }
    });

    moduleDef.blocks.forEach((block) => {
      const isRowBasedBlock = block.type === BlockType.TABLE || block.type === BlockType.GRID_TABLE;
      if (!isRowBasedBlock) return;

      (block.tableColumns || []).forEach((column) => {
        if (normalizeComparableValue(column.dynamicOptionsCategory) !== normalizedCategory) return;
        if (!SUPPORTED_DYNAMIC_FIELD_TYPES.has(String(column.type))) return;
        references.push({
          moduleId,
          table: moduleDef.table,
          fieldKey: String(column.key),
          fieldType: String(column.type),
          storage: 'block_row',
          containerKey: String(block.id),
        });
      });
    });

    gridBlocks.forEach((block: any) => {
      const specBlockIds = new Set(
        (block.gridConfig?.categories || [])
          .map((item: any) => String(item?.specBlockId || '').trim())
          .filter(Boolean)
      );
      if (!specBlockIds.size) return;

      // BOMها فیلد مشخصات مستقل ندارند و GridTable مشخصات را از ماژول محصولات
      // می‌گیرد؛ برای این مورد از همان تعریف به‌عنوان منبع استفاده می‌کنیم.
      const ownSpecFields = moduleDef.fields.filter((field) =>
        field.blockId && specBlockIds.has(String(field.blockId))
      );
      const sourceFields = ownSpecFields.length > 0
        ? ownSpecFields
        : (MODULES.products?.fields || []).filter((field) =>
            field.blockId && specBlockIds.has(String(field.blockId))
          );

      sourceFields.forEach((field) => {
        if (!isSupportedDynamicField(field, normalizedCategory)) return;
        references.push({
          moduleId,
          table: moduleDef.table,
          fieldKey: String(field.key),
          fieldType: String(field.type),
          storage: 'grid_spec',
          containerKey: String(block.id),
        });
      });
    });
  });

  return Array.from(new Map(
    references.map((reference) => [
      [reference.table, reference.fieldKey, reference.storage, reference.containerKey || ''].join(':'),
      reference,
    ])
  ).values());
};

const findMissingColumn = (error: any) => {
  const text = [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ');
  const postgresMatch = text.match(/column\s+([^\s]+)\s+does not exist/i);
  if (postgresMatch?.[1]) {
    return postgresMatch[1].split('.').pop()?.replace(/"/g, '') || null;
  }
  const schemaCacheMatch = text.match(/(?:column|field)\s+['"]([\w]+)['"]/i);
  return schemaCacheMatch?.[1] || null;
};

const fetchAllRows = async (table: string, requestedColumns: string[]) => {
  const unavailableColumns = new Set<string>();
  let columns = Array.from(new Set(requestedColumns.filter(Boolean)));
  const rows: any[] = [];
  let pageIndex = 0;

  while (true) {
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select(columns.join(', '))
      .range(from, to);

    if (error) {
      const missingColumn = findMissingColumn(error);
      if (missingColumn && columns.includes(missingColumn)) {
        unavailableColumns.add(missingColumn);
        columns = columns.filter((column) => column !== missingColumn);
        pageIndex = 0;
        rows.length = 0;
        continue;
      }
      throw error;
    }

    const pageRows = Array.isArray(data) ? data : [];
    rows.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) break;
    pageIndex += 1;
  }

  return { rows, unavailableColumns };
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
      ...tableReferences.map((reference) =>
        reference.storage === 'column' ? reference.fieldKey : reference.containerKey
      ).filter(Boolean),
    ])) as string[];

    const { rows, unavailableColumns } = await fetchAllRows(table, selectColumns);
    const availableReferences = tableReferences.filter((reference) => {
      const column = reference.storage === 'column' ? reference.fieldKey : reference.containerKey;
      return !column || !unavailableColumns.has(column);
    });

    for (const row of rows) {
      if (!row?.id) continue;

      const patch: Record<string, any> = {};
      let recordChanged = false;

      availableReferences
        .filter((reference) => reference.storage === 'column')
        .forEach((reference) => {
          const remapped = remapStoredValue(row?.[reference.fieldKey], reference.fieldType, fromValue, toValue);
          if (!remapped.changed) return;
          patch[reference.fieldKey] = remapped.nextValue;
          updatedFields += 1;
          recordChanged = true;
        });

      const containerKeys = Array.from(new Set(
        availableReferences
          .filter((reference) => reference.storage !== 'column')
          .map((reference) => reference.containerKey)
          .filter(Boolean)
      )) as string[];

      containerKeys.forEach((containerKey) => {
        const containerReferences = availableReferences.filter(
          (reference) => reference.containerKey === containerKey
        );
        const currentRows = Array.isArray(row?.[containerKey])
          ? row[containerKey]
          : tryParseArrayValue(row?.[containerKey]);
        if (!currentRows) return;

        let containerChanged = false;
        const nextRows = currentRows.map((item: any) => {
          if (!item || typeof item !== 'object') return item;
          let nextItem = item;

          containerReferences.forEach((reference) => {
            const currentValue = reference.storage === 'grid_spec'
              ? item?.specs?.[reference.fieldKey]
              : item?.[reference.fieldKey];
            const remapped = remapStoredValue(currentValue, reference.fieldType, fromValue, toValue);
            if (!remapped.changed) return;
            if (nextItem === item) {
              nextItem = { ...item };
            }
            if (reference.storage === 'grid_spec') {
              nextItem.specs = { ...(item.specs || {}), [reference.fieldKey]: remapped.nextValue };
            } else {
              nextItem[reference.fieldKey] = remapped.nextValue;
            }
            updatedFields += 1;
            containerChanged = true;
          });

          return nextItem;
        });

        if (!containerChanged) return;
        patch[containerKey] = nextRows;
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
