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
  opening_stock?: number | null;
  opening_shelf_id?: string | null;
  variant_values: Record<string, any>;
}

export type ProductAttributeOptionPair = { label: string; value: string };
export type CatalogBaseIdentity = {
  productType: string | null;
  category: string | null;
  productCategory: string | null;
  modelName: string | null;
  relatedBom: string | null;
};

export const LEGACY_VARIANT_FIELD_MAPPINGS: Record<string, string> = {
  leather_type: 'global_leather_type',
  leather_colors: 'global_color',
  leather_finish_1: 'global_leather_finish',
  leather_effect: 'global_leather_effect',
  leather_sort: 'global_leather_sort',
  lining_material: 'global_lining_material',
  lining_color: 'global_color',
  lining_width: 'global_lining_width',
  acc_material: 'global_accessory_material',
  fitting_type: 'global_fitting_type',
  fitting_material: 'global_fitting_material',
  fitting_colors: 'global_color',
  fitting_size: 'global_size',
};

export const PRODUCT_CATALOG_FIELD_KEYS = new Set<string>([
  '__product_attributes',
  '__product_global_attributes',
  '__product_variations',
]);

const PRODUCT_TRANSIENT_FORM_KEYS = new Set<string>([
  '__requireInventoryShelf',
  '__skipBomConfirm',
  'opening_stock',
  'opening_shelf_id',
  'bundle_id',
  'product_inventory',
  'product_stock_movements',
  'tags',
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
      return 'multi_select';
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

const isMeaningfulVariantValue = (value: any) => {
  if (Array.isArray(value)) return value.length > 0;
  return !(value === '' || value === null || value === undefined);
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

export const buildLegacyFieldVariantValues = (productValues: Record<string, any>) => {
  const nextValues: Record<string, any> = {};
  Object.entries(LEGACY_VARIANT_FIELD_MAPPINGS).forEach(([sourceFieldKey, attributeKey]) => {
    const rawValue = productValues?.[sourceFieldKey];
    const normalizedValue = normalizeVariantValue(rawValue);
    if (!isMeaningfulVariantValue(normalizedValue)) return;
    nextValues[attributeKey] = normalizedValue;
  });
  return nextValues;
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

export const buildSeedVariantValues = (
  productValues: Record<string, any>,
  attributes: ProductAttributeRecord[],
) => {
  const nextValues: Record<string, any> = {};
  attributes.forEach((attribute) => {
    if (attribute.option_source_type !== 'field' || !attribute.source_field_key) return;
    const sourceValue = productValues?.[attribute.source_field_key];
    if (sourceValue === undefined || sourceValue === null || sourceValue === '') return;
    nextValues[attribute.key] = sourceValue;
  });
  return nextValues;
};

export const buildCanonicalVariantValues = (
  productValues: Record<string, any>,
  attributes: ProductAttributeRecord[] = [],
) => {
  const baseValues = productValues?.variant_values && typeof productValues.variant_values === 'object'
    ? { ...productValues.variant_values }
    : {};
  const attributeSeedValues = buildSeedVariantValues(productValues, attributes);
  const legacyFieldValues = buildLegacyFieldVariantValues(productValues);
  const merged = {
    ...baseValues,
    ...attributeSeedValues,
    ...legacyFieldValues,
  } as Record<string, any>;

  return Object.entries(merged).reduce<Record<string, any>>((acc, [key, value]) => {
    const normalizedKey = normalizeAttributeKey(key);
    const normalizedValue = normalizeVariantValue(value);
    if (!normalizedKey || !isMeaningfulVariantValue(normalizedValue)) return acc;
    acc[normalizedKey] = normalizedValue;
    return acc;
  }, {});
};

export const buildCanonicalVariantIdentity = (
  productValues: Record<string, any>,
  attributes: ProductAttributeRecord[] = [],
) => {
  const variantValues = buildCanonicalVariantValues(productValues, attributes);
  const variantSignature = Object.keys(variantValues).length > 0
    ? buildVariantSignature(variantValues)
    : null;
  return {
    variantValues,
    variantSignature,
  };
};

const normalizeCatalogIdentityToken = (value: any) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

export const buildCatalogBaseIdentity = (
  productValues: Record<string, any>,
  options?: { productType?: string | null },
): CatalogBaseIdentity => {
  const productType = normalizeCatalogIdentityToken(options?.productType ?? productValues?.product_type);
  return {
    productType,
    category: normalizeCatalogIdentityToken(productValues?.category),
    productCategory: normalizeCatalogIdentityToken(productValues?.product_category),
    modelName: normalizeCatalogIdentityToken(productValues?.model_name),
    relatedBom: normalizeCatalogIdentityToken(productValues?.related_bom ?? productValues?.bom_id),
  };
};

export const matchesCatalogBaseIdentity = (
  row: Record<string, any>,
  identity: CatalogBaseIdentity,
) => {
  const rowIdentity = buildCatalogBaseIdentity(row);
  if (identity.productType && rowIdentity.productType !== identity.productType) return false;
  if (identity.productType === 'raw') {
    if (identity.category && rowIdentity.category !== identity.category) return false;
  } else if (identity.productCategory && rowIdentity.productCategory !== identity.productCategory) {
    return false;
  }
  if (identity.modelName && rowIdentity.modelName !== identity.modelName) return false;
  if (identity.relatedBom && rowIdentity.relatedBom !== identity.relatedBom) return false;
  return true;
};

export const buildVariantCombinations = ({
  attributes,
  attributeOptionsMap,
  seedValues = {},
  maxCombinations,
}: {
  attributes: ProductAttributeRecord[];
  attributeOptionsMap: Map<string, ProductAttributeOptionPair[]>;
  seedValues?: Record<string, any>;
  maxCombinations?: number;
}) => {
  const combinableAttributes = attributes.filter((attribute) => {
    const options = attributeOptionsMap.get(attribute.key) || [];
    return options.length > 0;
  });

  if (!combinableAttributes.length) {
    throw new Error('هیچ ویژگی انتخابیِ قابل ترکیبی پیدا نشد. برای ساخت ترکیب باید حداقل یک ویژگی گزینه‌دار داشته باشید.');
  }

  const combinationsCount = combinableAttributes.reduce((total, attribute) => {
    const options = attributeOptionsMap.get(attribute.key) || [];
    return total * options.length;
  }, 1);

  if (typeof maxCombinations === 'number' && combinationsCount > maxCombinations) {
    throw new Error(`تعداد ترکیب‌ها (${combinationsCount}) زیاد است. لطفاً مقادیر کمتری برای ویژگی‌ها انتخاب کنید.`);
  }

  let combinations: Record<string, any>[] = [{ ...seedValues }];
  combinableAttributes.forEach((attribute) => {
    const options = attributeOptionsMap.get(attribute.key) || [];
    const next: Record<string, any>[] = [];
    combinations.forEach((combination) => {
      options.forEach((option) => {
        next.push({
          ...combination,
          [attribute.key]: option.value,
        });
      });
    });
    combinations = next;
  });

  return {
    combinableAttributes,
    combinationsCount,
    combinations,
  };
};

export const stripProductCatalogFields = (values: Record<string, any>) => {
  const nextValues = { ...(values || {}) };
  PRODUCT_CATALOG_FIELD_KEYS.forEach((key) => {
    delete nextValues[key];
  });
  return nextValues;
};

export const stripInternalFormFields = (values: Record<string, any>) => {
  const nextValues = { ...(values || {}) };
  Object.keys(nextValues).forEach((key) => {
    const normalizedKey = String(key || '').trim();
    if (normalizedKey.startsWith('__') || PRODUCT_TRANSIENT_FORM_KEYS.has(normalizedKey)) {
      delete nextValues[key];
    }
  });
  return nextValues;
};

export const normalizeCatalogProductPayload = (values: Record<string, any>) => {
  const productPayload = stripInternalFormFields(stripProductCatalogFields(values));
  if (!Array.isArray(productPayload.grid_materials)) {
    productPayload.grid_materials = [];
  }
  if (!Array.isArray(productPayload.leather_colors)) {
    productPayload.leather_colors = [];
  }
  if (!Array.isArray(productPayload.leather_effect)) {
    productPayload.leather_effect = [];
  }
  if (!Array.isArray(productPayload.fitting_colors)) {
    productPayload.fitting_colors = [];
  }
  if (productPayload.sub_stock === null || productPayload.sub_stock === undefined || productPayload.sub_stock === '') {
    productPayload.sub_stock = 0;
  }
  if (!productPayload.catalog_role) {
    productPayload.catalog_role = 'standalone';
  }
  if (productPayload.site_sync_enabled === null || productPayload.site_sync_enabled === undefined) {
    productPayload.site_sync_enabled = false;
  }
  if (!productPayload.site_sync_status) {
    productPayload.site_sync_status = 'idle';
  }
  if (productPayload.catalog_role !== 'variant') {
    productPayload.parent_product_id = null;
    productPayload.variant_signature = null;
    productPayload.variant_values = {};
  } else if (!productPayload.variant_values || typeof productPayload.variant_values !== 'object') {
    productPayload.variant_values = {};
  }
  return productPayload;
};
