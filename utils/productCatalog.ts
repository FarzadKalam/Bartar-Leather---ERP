import { FieldType, type ModuleField } from '../types';

export type ProductAttributeValueType = 'select' | 'multi_select' | 'text' | 'number' | 'color';
export type ProductAttributeOptionSourceType = 'field' | 'custom';
export type ProductAttributeScopeType = 'global' | 'parent';

export interface ProductAttributeOptionRecord {
  id?: string;
  attribute_id?: string | null;
  label: string;
  value: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface ProductAttributeRecord {
  id?: string;
  scope_type: ProductAttributeScopeType;
  parent_product_id?: string | null;
  key: string;
  label: string;
  value_type: ProductAttributeValueType;
  option_source_type: ProductAttributeOptionSourceType;
  source_field_key?: string | null;
  is_variation: boolean;
  is_visible_on_site: boolean;
  sort_order: number;
  is_active: boolean;
  options?: ProductAttributeOptionRecord[];
}

export interface ProductVariationRecord {
  id?: string;
  name?: string | null;
  site_code?: string | null;
  sell_price?: number | null;
  image_url?: string | null;
  site_product_link?: string | null;
  status?: string | null;
  related_bom?: string | null;
  stock?: number | null;
  system_code?: string | null;
  site_sync_enabled?: boolean;
  site_sync_status?: string | null;
  variant_values: Record<string, any>;
}

export const PRODUCT_CATALOG_FIELD_KEYS = new Set<string>([
  'catalog_role',
  'parent_product_id',
  'variant_signature',
  'variant_values',
  'site_remote_id',
  'site_sync_enabled',
  'site_sync_status',
  'site_last_synced_at',
  'site_sync_error',
  '__product_attributes',
  '__product_global_attributes',
  '__product_variations',
]);

const PRODUCT_ATTRIBUTE_EXCLUDED_SOURCE_KEYS = new Set<string>([
  'id',
  'name',
  'system_code',
  'manual_code',
  'image_url',
  'status',
  'stock',
  'sub_stock',
  'production_cost',
  'auto_name_enabled',
  'site_code',
  'site_product_link',
  'catalog_role',
  'parent_product_id',
]);

export const normalizeAttributeKey = (input: string) => {
  const normalized = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^\w\u0600-\u06FF]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || `attr_${Date.now()}`;
};

export const mapFieldTypeToAttributeValueType = (fieldType?: FieldType | string | null): ProductAttributeValueType => {
  switch (fieldType) {
    case FieldType.NUMBER:
      return 'number';
    case FieldType.MULTI_SELECT:
      return 'select';
    case FieldType.TEXT:
    case FieldType.LONG_TEXT:
    case FieldType.LINK:
      return 'text';
    default:
      return 'select';
  }
};

export const isEligibleProductAttributeField = (field: ModuleField) => {
  if (!field?.key) return false;
  if (PRODUCT_ATTRIBUTE_EXCLUDED_SOURCE_KEYS.has(String(field.key))) return false;
  if (field.readonly || field.nature === 'system') return false;
  return [
    FieldType.SELECT,
    FieldType.MULTI_SELECT,
    FieldType.TEXT,
    FieldType.LONG_TEXT,
    FieldType.NUMBER,
  ].includes(field.type);
};

export const resolveFieldAttributeOptions = (
  field: ModuleField,
  dynamicOptions: Record<string, Array<{ label: string; value: any }>>,
) => {
  if (field.dynamicOptionsCategory) {
    return (dynamicOptions[field.dynamicOptionsCategory] || []).map((item, index) => ({
      label: String(item.label ?? item.value ?? ''),
      value: String(item.value ?? item.label ?? ''),
      sort_order: index,
      is_active: true,
    }));
  }
  return (field.options || []).map((item, index) => ({
    label: String(item.label ?? item.value ?? ''),
    value: String(item.value ?? item.label ?? ''),
    sort_order: index,
    is_active: true,
  }));
};

export const normalizeProductAttributeRecord = (
  attribute: Partial<ProductAttributeRecord>,
  index = 0,
): ProductAttributeRecord => {
  const options = Array.isArray(attribute.options)
    ? attribute.options
        .map((option, optionIndex) => ({
          id: option.id,
          attribute_id: option.attribute_id ?? null,
          label: String(option.label || '').trim(),
          value: String(option.value || option.label || '').trim(),
          sort_order: typeof option.sort_order === 'number' ? option.sort_order : optionIndex,
          is_active: option.is_active !== false,
        }))
        .filter((option) => option.label && option.value)
    : [];

  return {
    id: attribute.id,
    scope_type: attribute.scope_type === 'global' ? 'global' : 'parent',
    parent_product_id: attribute.parent_product_id ?? null,
    key: normalizeAttributeKey(String(attribute.key || attribute.label || `attribute_${index + 1}`)),
    label: String(attribute.label || attribute.key || `ویژگی ${index + 1}`).trim(),
    value_type: attribute.value_type || 'select',
    option_source_type: attribute.option_source_type === 'field' ? 'field' : 'custom',
    source_field_key: attribute.source_field_key ?? null,
    is_variation: attribute.is_variation !== false,
    is_visible_on_site: attribute.is_visible_on_site !== false,
    sort_order: typeof attribute.sort_order === 'number' ? attribute.sort_order : index,
    is_active: attribute.is_active !== false,
    options,
  };
};

const normalizeVariantValue = (value: any): any => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (item === null || item === undefined ? '' : String(item).trim()))
      .filter(Boolean)
      .sort();
  }
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim();
};

export const buildVariantSignature = (variantValues: Record<string, any>) => {
  const entries = Object.entries(variantValues || {})
    .map(([key, value]) => [normalizeAttributeKey(key), normalizeVariantValue(value)] as const)
    .filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return !(value === '' || value === null || value === undefined);
    })
    .sort(([left], [right]) => left.localeCompare(right));

  return JSON.stringify(entries);
};

export const buildVariantSummary = (
  variantValues: Record<string, any>,
  attributes: ProductAttributeRecord[],
  labelResolver?: (attribute: ProductAttributeRecord, value: any) => string,
) => {
  const parts = attributes
    .filter((attribute) => attribute.is_active !== false)
    .map((attribute) => {
      const rawValue = variantValues?.[attribute.key];
      if (rawValue === undefined || rawValue === null || rawValue === '') return '';
      const rendered = labelResolver ? labelResolver(attribute, rawValue) : (
        Array.isArray(rawValue) ? rawValue.join(' / ') : String(rawValue)
      );
      return `${attribute.label}: ${rendered}`;
    })
    .filter(Boolean);
  return parts.join(' | ');
};

export const buildVariantName = (
  baseName: string,
  variantValues: Record<string, any>,
  attributes: ProductAttributeRecord[],
  labelResolver?: (attribute: ProductAttributeRecord, value: any) => string,
) => {
  const summary = buildVariantSummary(variantValues, attributes, labelResolver);
  if (!summary) return String(baseName || 'محصول').trim();
  return `${String(baseName || 'محصول').trim()} - ${summary}`;
};

export const cartesianProduct = <T,>(lists: T[][]): T[][] => {
  if (!lists.length) return [];
  return lists.reduce<T[][]>(
    (acc, list) => acc.flatMap((prefix) => list.map((item) => [...prefix, item])),
    [[]],
  );
};

export const stripProductCatalogFields = (values: Record<string, any>) => {
  const nextValues = { ...(values || {}) };
  PRODUCT_CATALOG_FIELD_KEYS.forEach((key) => {
    delete nextValues[key];
  });
  return nextValues;
};
