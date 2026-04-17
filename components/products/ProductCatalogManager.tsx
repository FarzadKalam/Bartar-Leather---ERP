import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Divider, Input, InputNumber, Modal, Select, Space, Switch, Tag } from 'antd';
import { DeleteOutlined, LinkOutlined, PlusOutlined, SyncOutlined } from '@ant-design/icons';
import type { ModuleField } from '../../types';
import { FieldType } from '../../types';
import SmartFieldRenderer from '../SmartFieldRenderer';
import DynamicSelectField from '../DynamicSelectField';
import { supabase } from '../../supabaseClient';
import {
  buildVariantName,
  buildSeedVariantValues,
  buildVariantCombinations,
  buildVariantSignature,
  buildVariantSummary,
  isEligibleProductAttributeField,
  mapFieldTypeToAttributeValueType,
  normalizeAttributeKey,
  resolveFieldAttributeOptions,
  type ProductAttributeRecord,
  type ProductVariationRecord,
} from '../../utils/productCatalog';
import { loadProductCatalogData } from '../../utils/productCatalogPersistence';

type GlobalTemplateDraft = ProductAttributeRecord;

interface ProductCatalogManagerProps {
  productId?: string | null;
  product: Record<string, any>;
  productFields: ModuleField[];
  dynamicOptions: Record<string, Array<{ label: string; value: any }>>;
  relationOptions?: Record<string, any[]>;
  mode: 'edit' | 'view';
  canEdit?: boolean;
  checkVisibility?: (logic: any, values?: any) => boolean;
  onProductPatch?: (patch: Record<string, any>) => void;
  onChange?: (payload: {
    attributes: ProductAttributeRecord[];
    globalAttributes: ProductAttributeRecord[];
    variations: ProductVariationRecord[];
  }) => void;
  onOpenEditor?: () => void;
  onOpenSync?: () => void;
}

type CustomAttributeDraft = {
  label: string;
  key: string;
  value_type: ProductAttributeRecord['value_type'];
  optionsText: string;
  is_variation: boolean;
  is_visible_on_site: boolean;
  persistAsGlobal: boolean;
};

const DEFAULT_ATTRIBUTE_DRAFT: CustomAttributeDraft = {
  label: '',
  key: '',
  value_type: 'select',
  optionsText: '',
  is_variation: true,
  is_visible_on_site: true,
  persistAsGlobal: false,
};

const VARIATION_COMMON_FIELDS: ModuleField[] = [
  { key: 'name', type: FieldType.TEXT, labels: { fa: 'نام محصول' } },
  { key: 'site_code', type: FieldType.TEXT, labels: { fa: 'کد سایت / SKU' } },
  { key: 'sell_price', type: FieldType.PRICE, labels: { fa: 'قیمت فروش' } },
  { key: 'opening_stock', type: FieldType.NUMBER, labels: { fa: 'موجودی اول دوره' } },
  {
    key: 'opening_shelf_id',
    type: FieldType.RELATION,
    labels: { fa: 'قفسه نگهداری' },
    relationConfig: { targetModule: 'shelves', targetField: 'name' },
  },
  {
    key: 'status',
    type: FieldType.STATUS,
    labels: { fa: 'وضعیت' },
    options: [
      { label: 'فعال', value: 'active', color: 'green' },
      { label: 'پیش‌نویس', value: 'draft', color: 'orange' },
    ],
  },
  { key: 'image_url', type: FieldType.IMAGE, labels: { fa: 'تصویر' } },
  { key: 'site_product_link', type: FieldType.LINK, labels: { fa: 'لینک سایت' } },
  { key: 'site_sync_enabled', type: FieldType.CHECKBOX, labels: { fa: 'همگام‌سازی خودکار' } },
];

const MATERIAL_CATEGORY_LABELS: Record<string, string> = {
  leather: 'چرم',
  lining: 'آستر',
  accessory: 'خرجکار',
  fitting: 'یراق',
};

const DEFAULT_GLOBAL_ATTRIBUTE_DEFINITIONS = [
  { key: 'global_color', label: 'رنگ', dynamicCategory: 'general_color', valueType: 'select' as const },
  { key: 'global_leather_color', label: 'رنگ چرم', dynamicCategory: 'general_color', valueType: 'multi_select' as const },
  { key: 'global_lining_color', label: 'رنگ آستر', dynamicCategory: 'general_color', valueType: 'select' as const },
  { key: 'global_fitting_color', label: 'رنگ یراق', dynamicCategory: 'general_color', valueType: 'multi_select' as const },
  { key: 'global_size', label: 'سایز', dynamicCategory: 'fitting_size', valueType: 'select' as const },
];

const SMART_GLOBAL_FIELD_MAPPINGS: Record<string, { key: string; label: string }> = {
  leather_type: { key: 'global_leather_type', label: 'نوع چرم' },
  leather_colors: { key: 'global_leather_color', label: 'رنگ چرم' },
  leather_finish_1: { key: 'global_leather_finish', label: 'صفحه چرم' },
  leather_effect: { key: 'global_leather_effect', label: 'افکت چرم' },
  leather_sort: { key: 'global_leather_sort', label: 'سورت چرم' },
  lining_material: { key: 'global_lining_material', label: 'جنس آستر' },
  lining_color: { key: 'global_lining_color', label: 'رنگ آستر' },
  lining_width: { key: 'global_lining_width', label: 'عرض آستر' },
  acc_material: { key: 'global_accessory_material', label: 'جنس خرجکار' },
  fitting_type: { key: 'global_fitting_type', label: 'نوع یراق' },
  fitting_material: { key: 'global_fitting_material', label: 'جنس یراق' },
  fitting_colors: { key: 'global_fitting_color', label: 'رنگ یراق' },
  fitting_size: { key: 'global_size', label: 'سایز' },
};

const MAX_GENERATED_VARIATIONS = 200;

const mapAttributeValueTypeToFieldType = (valueType?: ProductAttributeRecord['value_type']) => {
  switch (valueType) {
    case 'number':
      return FieldType.NUMBER;
    case 'multi_select':
      return FieldType.MULTI_SELECT;
    case 'text':
      return FieldType.TEXT;
    case 'color':
    case 'select':
    default:
      return FieldType.SELECT;
  }
};

const matchOptionByValue = (options: Array<{ label: string; value: string }>, rawValue: string) =>
  options.find((option) => String(option.value) === rawValue || String(option.label) === rawValue);

const mapSelectedOptions = (
  rawValues: string[],
  availableOptions: Array<{ label: string; value: string }>,
) => rawValues.map((rawValue, index) => {
  const matched = matchOptionByValue(availableOptions, String(rawValue));
  return {
    label: String(matched?.label || rawValue),
    value: String(matched?.value || rawValue),
    sort_order: index,
    is_active: true,
  };
});

const normalizeAttributeOptionValue = (
  rawValue: any,
  options: Array<{ label: string; value: string }>,
  valueType?: ProductAttributeRecord['value_type'],
) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') return rawValue;

  const resolveSingleValue = (input: any) => {
    const normalizedInput = String(input ?? '').trim();
    if (!normalizedInput) return input;
    const matched = options.find((option) =>
      String(option.value) === normalizedInput || String(option.label) === normalizedInput
    );
    return matched ? matched.value : input;
  };

  const flattenValues = (input: any): any[] => {
    if (Array.isArray(input)) {
      return input.flatMap((item) => flattenValues(item));
    }
    return input === undefined || input === null || String(input).trim() === '' ? [] : [input];
  };

  if (valueType === 'multi_select') {
    const values = flattenValues(rawValue);
    return values
      .map((item) => resolveSingleValue(item))
      .filter((item) => item !== undefined && item !== null && String(item).trim() !== '');
  }

  if (Array.isArray(rawValue)) {
    const normalizedValues = flattenValues(rawValue)
      .map((item) => resolveSingleValue(item))
      .filter((item) => item !== undefined && item !== null && String(item).trim() !== '');
    return normalizedValues[0] ?? undefined;
  }

  return resolveSingleValue(rawValue);
};

const flattenVariationInputValue = (rawValue: any): any[] => {
  if (Array.isArray(rawValue)) {
    return rawValue.flatMap((item) => flattenVariationInputValue(item));
  }
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') return [];
  return [rawValue];
};

const resolveVariationOptionValue = (
  rawValue: any,
  options: Array<{ label: string; value: string }>,
) => {
  const normalizedRawValue = String(rawValue ?? '').trim();
  if (!normalizedRawValue) return undefined;
  const matched = options.find((option) =>
    String(option.value) === normalizedRawValue || String(option.label) === normalizedRawValue
  );
  return matched ? matched.value : normalizedRawValue;
};

const ProductCatalogManager: React.FC<ProductCatalogManagerProps> = ({
  productId,
  product,
  productFields,
  dynamicOptions,
  mode,
  canEdit = true,
  onProductPatch,
  onChange,
  onOpenEditor,
  onOpenSync,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [attributes, setAttributes] = useState<ProductAttributeRecord[]>([]);
  const [globalLibrary, setGlobalLibrary] = useState<ProductAttributeRecord[]>([]);
  const [pendingGlobalAttributes, setPendingGlobalAttributes] = useState<GlobalTemplateDraft[]>([]);
  const [variations, setVariations] = useState<ProductVariationRecord[]>([]);
  const [selectedGlobalKey, setSelectedGlobalKey] = useState<string | null>(null);
  const [selectedGlobalOptionValues, setSelectedGlobalOptionValues] = useState<string[]>([]);
  const [customAttributeOpen, setCustomAttributeOpen] = useState(false);
  const [customAttributeDraft, setCustomAttributeDraft] = useState<CustomAttributeDraft>(DEFAULT_ATTRIBUTE_DRAFT);
  const [openingShelfOptions, setOpeningShelfOptions] = useState<Array<{ label: string; value: string }>>([]);
  const debugVariationBinding = typeof window !== 'undefined'
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const lookupId = product?.catalog_role === 'variant'
        ? String(product?.parent_product_id || '').trim()
        : String(productId || '').trim();
      setLoading(true);
      try {
        const loaded = await loadProductCatalogData(supabase as any, lookupId || undefined);
        if (cancelled) return;
        if (debugVariationBinding) {
          console.debug('[ProductCatalogManager] loaded catalog data', {
            lookupId,
            productId,
            catalogRole: product?.catalog_role,
            parentAttributes: loaded.parentAttributes,
            variations: loaded.variations,
          });
        }
        setGlobalLibrary(loaded.globalAttributes);
        setPendingGlobalAttributes([]);
        setAttributes(loaded.parentAttributes);
        setVariations(product?.catalog_role === 'parent' ? loaded.variations : []);
      } catch (error) {
        console.warn('Could not load product catalog data', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, productId, product?.catalog_role, product?.parent_product_id]);

  useEffect(() => {
    onChange?.({
      attributes,
      globalAttributes: pendingGlobalAttributes,
      variations,
    });
  }, [attributes, onChange, pendingGlobalAttributes, variations]);

  useEffect(() => {
    let cancelled = false;
    const loadShelfOptions = async () => {
      try {
        const { data, error } = await supabase
          .from('shelves')
          .select('id, name, system_code, shelf_number')
          .limit(400);
        if (error) throw error;
        if (cancelled) return;
        setOpeningShelfOptions((data || []).map((row: any) => ({
          value: String(row.id),
          label: row.system_code
            ? `${row.name || row.shelf_number || row.id} (${row.system_code})`
            : String(row.name || row.shelf_number || row.id),
        })));
      } catch (error) {
        console.warn('Could not load shelf options for product variations', error);
      }
    };
    void loadShelfOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  const fieldMap = useMemo(() => {
    const map = new Map<string, ModuleField>();
    productFields.forEach((field) => {
      map.set(String(field.key), field);
    });
    return map;
  }, [productFields]);

  const statusField = useMemo(
    () => productFields.find((field) => field.key === 'status'),
    [productFields],
  );

  const materialCategory = String(product?.category || '').trim();
  const isRawMaterialProduct = String(product?.product_type || '').trim() === 'raw';
  const materialCategoryOptions = useMemo(
    () => Object.entries(MATERIAL_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
    [],
  );

  const defaultGlobalTemplates = useMemo<ProductAttributeRecord[]>(() => (
    DEFAULT_GLOBAL_ATTRIBUTE_DEFINITIONS
      .map((definition, index) => ({
        key: definition.key,
        label: definition.label,
        scope_type: 'global' as const,
        parent_product_id: null,
        value_type: definition.valueType,
        option_source_type: 'custom' as const,
        source_field_key: null,
        is_variation: true,
        is_visible_on_site: true,
        sort_order: index,
        is_active: true,
        options: (dynamicOptions[definition.dynamicCategory] || []).map((item, optionIndex) => ({
          label: String(item.label ?? item.value ?? ''),
          value: String(item.value ?? item.label ?? ''),
          sort_order: optionIndex,
          is_active: true,
        })),
      }))
      .filter((attribute) => (attribute.options || []).length > 0)
  ), [dynamicOptions]);

  const smartMappedGlobalTemplates = useMemo<ProductAttributeRecord[]>(() => {
    const templateMap = new Map<string, ProductAttributeRecord>();

    productFields
      .filter((field) => isEligibleProductAttributeField(field))
      .forEach((field) => {
        const mapping = SMART_GLOBAL_FIELD_MAPPINGS[String(field.key)];
        if (!mapping) return;

        const resolvedOptions = resolveFieldAttributeOptions(field, dynamicOptions);
        const existing = templateMap.get(mapping.key);
        const mergedOptions = existing?.options || resolvedOptions;

        templateMap.set(mapping.key, {
          id: existing?.id,
          key: mapping.key,
          label: mapping.label,
          scope_type: 'global',
          parent_product_id: null,
          value_type: mapFieldTypeToAttributeValueType(field.type),
          option_source_type: 'field',
          source_field_key: field.key,
          is_variation: existing?.is_variation ?? true,
          is_visible_on_site: existing?.is_visible_on_site ?? true,
          sort_order: existing?.sort_order ?? templateMap.size,
          is_active: existing?.is_active ?? true,
          options: mergedOptions,
        });
      });

    return Array.from(templateMap.values());
  }, [dynamicOptions, productFields]);

  const allGlobalTemplates = useMemo(() => {
    const templateMap = new Map<string, ProductAttributeRecord>();
    [...defaultGlobalTemplates, ...smartMappedGlobalTemplates, ...globalLibrary, ...pendingGlobalAttributes].forEach((attribute) => {
      if (!attribute?.key) return;
      if (attributes.some((item) => item.key === attribute.key)) return;
      templateMap.set(attribute.key, attribute);
    });
    return Array.from(templateMap.values());
  }, [attributes, defaultGlobalTemplates, globalLibrary, pendingGlobalAttributes, smartMappedGlobalTemplates]);

  const availableGlobalTemplates = allGlobalTemplates;

  const selectedGlobalTemplate = useMemo(
    () => (selectedGlobalKey ? allGlobalTemplates.find((attribute) => attribute.key === selectedGlobalKey) || null : null),
    [allGlobalTemplates, selectedGlobalKey],
  );

  const selectedGlobalAvailableOptions = useMemo(
    () => {
      if (!selectedGlobalTemplate) return [];
      if ((selectedGlobalTemplate.options || []).length > 0) {
        return (selectedGlobalTemplate.options || []).map((option) => ({
          label: option.label,
          value: option.value,
        }));
      }
      if (selectedGlobalTemplate.option_source_type === 'field' && selectedGlobalTemplate.source_field_key) {
        const sourceField = fieldMap.get(selectedGlobalTemplate.source_field_key);
        if (!sourceField) return [];
        return resolveFieldAttributeOptions(sourceField, dynamicOptions).map((option) => ({
          label: option.label,
          value: option.value,
        }));
      }
      return [];
    },
    [dynamicOptions, fieldMap, selectedGlobalTemplate],
  );

  const customAttributeDraftOptions = useMemo(
    () => customAttributeDraft.optionsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({ label: line, value: line })),
    [customAttributeDraft.optionsText],
  );

  const attributeOptionsMap = useMemo(() => {
    const nextMap = new Map<string, Array<{ label: string; value: string }>>();
    attributes.forEach((attribute) => {
      if ((attribute.options || []).length > 0) {
        nextMap.set(
          attribute.key,
          (attribute.options || []).map((option) => ({
            label: option.label,
            value: option.value,
          })),
        );
      } else if (attribute.option_source_type === 'field' && attribute.source_field_key) {
        const field = fieldMap.get(attribute.source_field_key);
        if (field) {
          nextMap.set(
            attribute.key,
            resolveFieldAttributeOptions(field, dynamicOptions).map((option) => ({
              label: option.label,
              value: option.value,
            })),
          );
        }
      } else {
        nextMap.set(
          attribute.key,
          (attribute.options || []).map((option) => ({
            label: option.label,
            value: option.value,
          })),
        );
      }
    });
    return nextMap;
  }, [attributes, dynamicOptions, fieldMap]);

  const renderAttributeValue = (attribute: ProductAttributeRecord, rawValue: any) => {
    const options = attributeOptionsMap.get(attribute.key) || [];
    if (Array.isArray(rawValue)) {
      return rawValue
        .map((item) => options.find((option) => option.value === item)?.label || String(item))
        .join(' / ');
    }
    return options.find((option) => option.value === rawValue)?.label || String(rawValue ?? '');
  };

  const getAutoVariationName = (variantValues: Record<string, any>) => (
    buildVariantName(String(product?.name || 'محصول'), variantValues, attributes, renderAttributeValue)
  );

  useEffect(() => {
    if (variations.length === 0) return;

    setVariations((prev) => {
      let hasChanges = false;

      const nextVariations = prev.map((variation) => {
        const currentValues = variation.variant_values || {};
        let nextValues = currentValues;

        attributes
          .filter((attribute) => attribute.is_active !== false)
          .forEach((attribute) => {
            const normalizedValue = normalizeAttributeOptionValue(
              currentValues[attribute.key],
              attributeOptionsMap.get(attribute.key) || [],
              attribute.value_type,
            );

            const previousValue = currentValues[attribute.key];
            const changed = Array.isArray(normalizedValue) || Array.isArray(previousValue)
              ? JSON.stringify(normalizedValue ?? []) !== JSON.stringify(previousValue ?? [])
              : normalizedValue !== previousValue;

            if (!changed) return;
            if (nextValues === currentValues) nextValues = { ...currentValues };
            nextValues[attribute.key] = normalizedValue;
            hasChanges = true;
          });

        const nextName = product?.auto_name_enabled
          ? buildVariantName(String(product?.name || 'محصول'), nextValues, attributes, renderAttributeValue)
          : variation.name;

        if (nextName !== variation.name) {
          hasChanges = true;
          return {
            ...variation,
            name: nextName,
            variant_values: nextValues,
          };
        }

        if (nextValues !== currentValues) {
          return {
            ...variation,
            variant_values: nextValues,
          };
        }

        return variation;
      });

      return hasChanges ? nextVariations : prev;
    });
  }, [attributeOptionsMap, attributes, product?.auto_name_enabled, product?.name, variations.length]);

  const addGlobalTemplate = () => {
    if (!selectedGlobalKey) return;
    const template = allGlobalTemplates.find((item) => item.key === selectedGlobalKey);
    if (!template) return;
    if (attributes.some((attribute) => attribute.key === template.key)) {
      message.warning('این ویژگی قبلاً روی محصول فعال شده است.');
      return;
    }
    const templateAvailableOptions = template.option_source_type === 'field' && template.source_field_key
      ? (() => {
          const sourceField = fieldMap.get(template.source_field_key);
          return sourceField ? resolveFieldAttributeOptions(sourceField, dynamicOptions) : [];
        })()
      : (template.options || []);

    const selectedOptions = selectedGlobalOptionValues.length > 0
      ? selectedGlobalOptionValues.map((rawValue, index) => {
          const matched = templateAvailableOptions.find((option) =>
            String(option.value) === String(rawValue) || String(option.label) === String(rawValue)
          );
          return {
            ...(matched || { label: String(rawValue), value: String(rawValue) }),
            sort_order: index,
            is_active: true,
          };
        })
      : templateAvailableOptions;
    setAttributes((prev) => [
      ...prev,
      {
        ...template,
        id: undefined,
        scope_type: 'parent',
        parent_product_id: String(productId || '').trim() || null,
        sort_order: prev.length,
        options: selectedOptions.map((option) => ({ ...option, id: undefined })),
      },
    ]);
    setSelectedGlobalKey(null);
    setSelectedGlobalOptionValues([]);
  };

  const handleCreateCustomAttribute = () => {
    const label = String(customAttributeDraft.label || '').trim();
    if (!label) {
      message.error('عنوان ویژگی را وارد کنید.');
      return;
    }
    const key = normalizeAttributeKey(customAttributeDraft.key || label);
    if (attributes.some((attribute) => attribute.key === key)) {
      message.error('ویژگی با این کلید قبلاً وجود دارد.');
      return;
    }
    const options = customAttributeDraft.optionsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => ({ label: line, value: normalizeAttributeKey(line), sort_order: index, is_active: true }));
    const nextAttribute: ProductAttributeRecord = {
      key,
      label,
      scope_type: 'parent',
      parent_product_id: String(productId || '').trim() || null,
      value_type: customAttributeDraft.value_type,
      option_source_type: 'custom',
      source_field_key: null,
      is_variation: customAttributeDraft.is_variation,
      is_visible_on_site: customAttributeDraft.is_visible_on_site,
      sort_order: attributes.length,
      is_active: true,
      options,
    };
    setAttributes((prev) => [...prev, nextAttribute]);
    if (customAttributeDraft.persistAsGlobal) {
      setPendingGlobalAttributes((prev) => [
        ...prev,
        {
          ...nextAttribute,
          scope_type: 'global',
          parent_product_id: null,
        },
      ]);
    }
    setCustomAttributeDraft(DEFAULT_ATTRIBUTE_DRAFT);
    setCustomAttributeOpen(false);
  };

  const updateAttribute = (index: number, patch: Partial<ProductAttributeRecord>) => {
    setAttributes((prev) => prev.map((attribute, attrIndex) => (attrIndex === index ? { ...attribute, ...patch } : attribute)));
  };

  const updateAttributeOptions = (
    index: number,
    rawValues: string[],
    availableOptions: Array<{ label: string; value: string }>,
  ) => {
    updateAttribute(index, { options: mapSelectedOptions(rawValues, availableOptions) });
  };

  const removeAttribute = (index: number) => {
    setAttributes((prev) => prev.filter((_, attrIndex) => attrIndex !== index));
    setVariations((prev) => prev.map((variation) => {
      const nextValues = { ...(variation.variant_values || {}) };
      const removed = attributes[index];
      if (removed?.key) delete nextValues[removed.key];
      return { ...variation, variant_values: nextValues };
    }));
  };

  const addVariation = () => {
    const activeAttributes = attributes.filter((attribute) => attribute.is_active !== false);
    const seededValues = buildSeedVariantValues(product, activeAttributes);
    setVariations((prev) => [
      ...prev,
      {
        name: product?.auto_name_enabled ? getAutoVariationName(seededValues) : '',
        site_code: '',
        sell_price: product?.sell_price ?? null,
        image_url: product?.image_url ?? null,
        site_product_link: null,
        status: 'active',
        related_bom: product?.related_bom ?? null,
        stock: null,
        system_code: null,
        site_sync_enabled: product?.site_sync_enabled === true,
        site_sync_status: 'idle',
        opening_stock: 0,
        opening_shelf_id: null,
        variant_values: seededValues,
      },
    ]);
  };

  const updateVariation = (index: number, patch: Partial<ProductVariationRecord>) => {
    setVariations((prev) => prev.map((variation, variationIndex) => {
      if (variationIndex !== index) return variation;
      const merged = { ...variation, ...patch };
      merged.variant_values = patch.variant_values ? patch.variant_values : variation.variant_values;
      if (product?.auto_name_enabled && patch.variant_values) {
        merged.name = getAutoVariationName(merged.variant_values || {});
      }
      return merged;
    }));
  };

  const removeVariation = (index: number) => {
    if (variations[index]?.id) {
      message.warning('حذف متغیر ثبت‌شده در این فاز پشتیبانی نمی‌شود. می‌توانید آن را غیرفعال کنید.');
      return;
    }
    setVariations((prev) => prev.filter((_, variationIndex) => variationIndex !== index));
  };

  const generateCombinations = () => {
    const variationAttributes = attributes.filter((attribute) => attribute.is_active !== false && attribute.is_variation !== false);
    if (!variationAttributes.length) {
      message.warning('ابتدا حداقل یک ویژگی متغیر فعال تعریف کنید.');
      return;
    }

    try {
      const defaultSeedValues = buildSeedVariantValues(product, variationAttributes);
      const { combinations } = buildVariantCombinations({
        attributes: variationAttributes,
        attributeOptionsMap,
        seedValues: defaultSeedValues,
        maxCombinations: MAX_GENERATED_VARIATIONS,
      });
      setVariations((prev) => {
        const existingSignatures = new Set(prev.map((variation) => buildVariantSignature(variation.variant_values || {})));
        const nextRows = combinations
          .filter((variantValues) => {
            const signature = buildVariantSignature(variantValues);
            if (existingSignatures.has(signature)) return false;
            existingSignatures.add(signature);
            return true;
          })
          .map((variantValues) => ({
            name: product?.auto_name_enabled ? getAutoVariationName(variantValues) : '',
            site_code: '',
            sell_price: product?.sell_price ?? null,
            image_url: product?.image_url ?? null,
            site_product_link: null,
            status: 'active',
            related_bom: product?.related_bom ?? null,
            stock: null,
            system_code: null,
            site_sync_enabled: product?.site_sync_enabled === true,
            site_sync_status: 'idle',
            opening_stock: 0,
            opening_shelf_id: null,
            variant_values: variantValues,
          } satisfies ProductVariationRecord));
        return [...prev, ...nextRows];
      });
    } catch (error: any) {
      message.error(error?.message || 'ساخت ترکیب‌ها ناموفق بود.');
    }
  };

  if (String(product?.catalog_role || '') !== 'parent') {
    return null;
  }

  return (
    <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-base font-black text-gray-800">ویژگی‌ها و متغیرها</div>
          <div className="text-xs text-gray-500">مدیریت ویژگی‌ها و متغیرهای محصول مادر از همین فرم.</div>
        </div>
        {mode === 'view' && (
          <Space wrap>
            {onOpenEditor && (
              <Button type="primary" icon={<PlusOutlined />} onClick={onOpenEditor}>
                افزودن متغیر
              </Button>
            )}
            {onOpenSync && (
              <Button icon={<SyncOutlined />} onClick={onOpenSync}>
                همگام‌سازی سایت
              </Button>
            )}
          </Space>
        )}
      </div>

      {loading ? (
        <Alert type="info" showIcon message="در حال بارگذاری اطلاعات متغیرها..." />
      ) : (
        <>
          <Divider orientation="left">ویژگی‌های فعال</Divider>

          {mode === 'edit' && canEdit && (
            <div className="mb-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
              {isRawMaterialProduct && (
                <div className="rounded-2xl border border-gray-200 p-3 space-y-3 lg:col-span-3">
                  <div className="text-xs font-bold text-gray-500">گروه ویژگی‌های اختصاصی</div>
                  <Select
                    value={materialCategory || undefined}
                    onChange={(value) => onProductPatch?.({ category: value })}
                    placeholder="گروه کالای مواد اولیه را انتخاب کنید"
                    options={materialCategoryOptions}
                    className="w-full md:max-w-sm"
                    getPopupContainer={(trigger) => trigger.parentElement || document.body}
                  />
                  <div className="text-xs text-gray-400">
                    انتخاب این گروه فقط برای مدیریت ویژگی‌های اختصاصی محصول مادر استفاده می‌شود.
                  </div>
                </div>
              )}
              <div className="rounded-2xl border border-gray-200 p-3 space-y-3">
                <div className="text-xs font-bold text-gray-500">افزودن از ویژگی‌های عمومی</div>
                <Select
                  value={selectedGlobalKey}
                  onChange={(value) => {
                    setSelectedGlobalKey(value);
                    setSelectedGlobalOptionValues([]);
                  }}
                  placeholder="یک ویژگی عمومی انتخاب کنید"
                  options={availableGlobalTemplates.map((attribute) => ({
                    label: attribute.label,
                    value: attribute.key,
                  }))}
                  className="w-full"
                  showSearch
                  optionFilterProp="label"
                  getPopupContainer={(trigger) => trigger.parentElement || document.body}
                  notFoundContent="هنوز ویژگی عمومی تعریف نشده است"
                />
                {selectedGlobalAvailableOptions.length > 0 && (
                  <DynamicSelectField
                    value={selectedGlobalOptionValues}
                    onChange={(value) => setSelectedGlobalOptionValues(Array.isArray(value) ? value.map(String) : (value ? [String(value)] : []))}
                    options={selectedGlobalAvailableOptions}
                    category={(
                      DEFAULT_GLOBAL_ATTRIBUTE_DEFINITIONS.find((item) => item.key === selectedGlobalKey)?.dynamicCategory
                      || (selectedGlobalTemplate?.source_field_key
                        ? fieldMap.get(selectedGlobalTemplate.source_field_key)?.dynamicOptionsCategory
                        : undefined)
                    )}
                    placeholder="مقادیر موردنظر برای ساخت ترکیب را انتخاب کنید"
                    className="w-full"
                    allowClear
                    mode="multiple"
                    manageMode={(
                      DEFAULT_GLOBAL_ATTRIBUTE_DEFINITIONS.some((item) => item.key === selectedGlobalKey)
                      || !!(selectedGlobalTemplate?.source_field_key
                        && fieldMap.get(selectedGlobalTemplate.source_field_key)?.dynamicOptionsCategory)
                    ) ? 'remote' : 'local'}
                    localOptions={selectedGlobalAvailableOptions}
                    getPopupContainer={(trigger) => trigger.parentElement || document.body}
                  />
                )}
                <div className="text-xs text-gray-400">
                  {availableGlobalTemplates.length > 0
                    ? `${availableGlobalTemplates.length} ویژگی عمومی قابل استفاده موجود است`
                    : 'هنوز ویژگی عمومی مشترکی برای استفاده وجود ندارد'}
                </div>
                <Button block onClick={addGlobalTemplate} disabled={!selectedGlobalKey}>
                  افزودن ویژگی عمومی
                </Button>
              </div>

              <div className="rounded-2xl border border-gray-200 p-3 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold text-gray-500 mb-2">ویژگی سفارشی</div>
                  <div className="text-xs text-gray-400">برای مواردی که فیلد فعلی وجود ندارد، attribute جدید تعریف کنید.</div>
                </div>
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => setCustomAttributeOpen(true)}>
                  افزودن ویژگی سفارشی
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {attributes.length === 0 ? (
              <Alert type="warning" showIcon message="هنوز ویژگی فعالی برای این محصول تعریف نشده است." />
            ) : attributes.map((attribute, index) => {
              const sourceField = attribute.source_field_key ? fieldMap.get(attribute.source_field_key) : null;
              const selectedOptions = (attribute.options || []).map((option) => ({
                label: option.label,
                value: option.value,
              }));
              const availableAttributeOptions = sourceField
                ? resolveFieldAttributeOptions(sourceField, dynamicOptions).map((option) => ({
                    label: option.label,
                    value: option.value,
                  }))
                : selectedOptions;
              const attributeManageMode = sourceField?.dynamicOptionsCategory ? 'remote' : 'local';
              return (
                <div key={`${attribute.key}_${index}`} className="rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-bold text-gray-800">{attribute.label}</div>
                      <Tag color={attribute.option_source_type === 'field' ? 'blue' : 'gold'}>
                        {attribute.option_source_type === 'field' ? 'از فیلد فعلی' : 'سفارشی'}
                      </Tag>
                      {sourceField && <Tag>{sourceField.labels?.fa || sourceField.key}</Tag>}
                    </div>
                    {mode === 'edit' && canEdit && (
                      <Button danger icon={<DeleteOutlined />} onClick={() => removeAttribute(index)} />
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                    <div className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2">
                      <span className="text-sm text-gray-600">متغیر</span>
                      <Switch
                        disabled={mode !== 'edit' || !canEdit}
                        checked={attribute.is_variation !== false}
                        onChange={(checked) => updateAttribute(index, { is_variation: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2">
                      <span className="text-sm text-gray-600">نمایش در سایت</span>
                      <Switch
                        disabled={mode !== 'edit' || !canEdit}
                        checked={attribute.is_visible_on_site !== false}
                        onChange={(checked) => updateAttribute(index, { is_visible_on_site: checked })}
                      />
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {mode === 'edit' && canEdit && (
                      <DynamicSelectField
                        value={selectedOptions.map((option) => option.value)}
                        onChange={(value) => {
                          const nextValues = Array.isArray(value) ? value.map(String) : (value ? [String(value)] : []);
                          updateAttributeOptions(index, nextValues, availableAttributeOptions);
                        }}
                        options={availableAttributeOptions}
                        category={sourceField?.dynamicOptionsCategory}
                        placeholder="افزودن یا مدیریت گزینه‌ها"
                        className="w-full"
                        mode="multiple"
                        manageMode={attributeManageMode}
                        localOptions={selectedOptions}
                        onLocalOptionsChange={(nextOptions) => {
                          updateAttribute(index, {
                            options: nextOptions.map((option, optionIndex) => ({
                              label: option.label,
                              value: option.value,
                              sort_order: optionIndex,
                              is_active: true,
                            })),
                          });
                        }}
                        getPopupContainer={(trigger) => trigger.parentElement || document.body}
                      />
                    )}
                    {(!(mode === 'edit' && canEdit) && selectedOptions.length === 0) && (
                      <span className="text-xs text-gray-400">هنوز گزینه‌ای انتخاب نشده است</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Divider orientation="left">متغیرها</Divider>

          {mode === 'edit' && canEdit && (
            <Space className="mb-4" wrap>
              <Button type="primary" icon={<PlusOutlined />} onClick={addVariation}>
                افزودن متغیر
              </Button>
              <Button icon={<LinkOutlined />} onClick={generateCombinations}>
                ساخت ترکیب‌ها
              </Button>
            </Space>
          )}

          <div className="space-y-4">
            {variations.length === 0 ? (
              <Alert type="info" showIcon message="هنوز متغیری تعریف نشده است." />
            ) : variations.map((variation, variationIndex) => (
              <div key={variation.id || `variation_${variationIndex}`} className="rounded-2xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                  <div>
                    <div className="font-bold text-gray-800">
                      {product?.auto_name_enabled
                        ? getAutoVariationName(variation.variant_values || {})
                        : (variation.name || `متغیر ${variationIndex + 1}`)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {buildVariantSummary(variation.variant_values || {}, attributes, renderAttributeValue) || 'بدون ویژگی'}
                    </div>
                  </div>
                  {mode === 'edit' && canEdit && (
                    <Button danger icon={<DeleteOutlined />} onClick={() => removeVariation(variationIndex)} />
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {attributes
                    .filter((attribute) => attribute.is_active !== false)
                    .map((attribute) => {
                      const sourceField = attribute.source_field_key ? fieldMap.get(attribute.source_field_key) : null;
                      const resolvedVariationOptions = sourceField
                        ? resolveFieldAttributeOptions(sourceField, dynamicOptions).map((option) => ({
                            label: option.label,
                            value: option.value,
                          }))
                        : (attribute.options || []).map((option) => ({ label: option.label, value: option.value }));
                      const field: ModuleField = sourceField
                        ? {
                            ...sourceField,
                            key: attribute.key,
                            labels: { fa: attribute.label },
                            type: mapAttributeValueTypeToFieldType(attribute.value_type),
                            options: resolvedVariationOptions,
                            dynamicOptionsCategory: undefined,
                          }
                        : {
                            key: attribute.key,
                            labels: { fa: attribute.label },
                            type: mapAttributeValueTypeToFieldType(attribute.value_type),
                            options: (attribute.options || []).map((option) => ({ label: option.label, value: option.value })),
                          };

                      return (
                        <div key={`${variation.id || variationIndex}_${attribute.key}`}>
                          <div className="text-sm font-bold text-gray-700 mb-2">{attribute.label}</div>
                          {(attribute.value_type === 'multi_select' || field.type === FieldType.MULTI_SELECT) ? (
                            <Select
                              key={`${variation.id || variationIndex}_${attribute.key}_multi`}
                              mode="multiple"
                              className="w-full"
                              value={flattenVariationInputValue(variation.variant_values?.[attribute.key]).map((item) =>
                                String(resolveVariationOptionValue(item, resolvedVariationOptions) ?? item)
                              )}
                              onChange={(nextValue) => {
                                const nextValues = { ...(variation.variant_values || {}), [attribute.key]: nextValue };
                                updateVariation(variationIndex, { variant_values: nextValues });
                              }}
                              options={resolvedVariationOptions}
                              allowClear
                              optionFilterProp="label"
                              placeholder={attribute.label}
                            />
                          ) : field.type === FieldType.SELECT ? (
                            <Select
                              key={`${variation.id || variationIndex}_${attribute.key}_single`}
                              className="w-full"
                              value={(() => {
                                const rawValue = flattenVariationInputValue(variation.variant_values?.[attribute.key])[0];
                                return rawValue === undefined
                                  ? undefined
                                  : resolveVariationOptionValue(rawValue, resolvedVariationOptions);
                              })()}
                              onChange={(nextValue) => {
                                const nextValues = { ...(variation.variant_values || {}), [attribute.key]: nextValue };
                                updateVariation(variationIndex, { variant_values: nextValues });
                              }}
                              options={resolvedVariationOptions}
                              allowClear
                              optionFilterProp="label"
                              placeholder={attribute.label}
                            />
                          ) : field.type === FieldType.NUMBER ? (
                            <InputNumber
                              key={`${variation.id || variationIndex}_${attribute.key}_number`}
                              className="w-full"
                              controls={false}
                              value={variation.variant_values?.[attribute.key]}
                              onChange={(nextValue) => {
                                const nextValues = { ...(variation.variant_values || {}), [attribute.key]: nextValue };
                                updateVariation(variationIndex, { variant_values: nextValues });
                              }}
                              placeholder={attribute.label}
                            />
                          ) : (
                            <Input
                              key={`${variation.id || variationIndex}_${attribute.key}_text`}
                              value={variation.variant_values?.[attribute.key] ?? ''}
                              onChange={(event) => {
                                const nextValues = { ...(variation.variant_values || {}), [attribute.key]: event.target.value };
                                updateVariation(variationIndex, { variant_values: nextValues });
                              }}
                              placeholder={attribute.label}
                            />
                          )}
                        </div>
                      );
                    })}

                  {VARIATION_COMMON_FIELDS.map((field) => {
                    const fieldKey = String(field.key);
                    if (fieldKey === 'name') {
                      const resolvedName = variation.name || getAutoVariationName(variation.variant_values || {});
                      return (
                        <div key={`${variation.id || variationIndex}_${field.key}`}>
                          <div className="text-sm font-bold text-gray-700 mb-2">{field.labels?.fa || 'نام محصول'}</div>
                          <Input value={resolvedName} readOnly={product?.auto_name_enabled === true} placeholder={field.labels?.fa || 'نام محصول'} />
                        </div>
                      );
                    }

                    if (fieldKey === 'site_code' || fieldKey === 'site_product_link') {
                      return (
                        <div key={`${variation.id || variationIndex}_${field.key}`}>
                          <div className="text-sm font-bold text-gray-700 mb-2">{field.labels?.fa || field.key}</div>
                          <Input
                            value={(variation as any)[field.key] ?? ''}
                            onChange={(event) => updateVariation(variationIndex, { [field.key]: event.target.value } as Partial<ProductVariationRecord>)}
                            placeholder={field.labels?.fa || field.key}
                          />
                        </div>
                      );
                    }

                    if (fieldKey === 'sell_price' || fieldKey === 'opening_stock') {
                      return (
                        <div key={`${variation.id || variationIndex}_${field.key}`}>
                          <div className="text-sm font-bold text-gray-700 mb-2">{field.labels?.fa || field.key}</div>
                          <InputNumber
                            className="w-full"
                            controls={false}
                            value={(variation as any)[field.key]}
                            onChange={(nextValue) => updateVariation(variationIndex, { [field.key]: nextValue } as Partial<ProductVariationRecord>)}
                            placeholder={field.labels?.fa || field.key}
                          />
                        </div>
                      );
                    }

                    if (fieldKey === 'status') {
                      const statusOptions = (statusField?.options || field.options || []).map((option: any) => ({
                        label: option.label,
                        value: option.value,
                      }));
                      return (
                        <div key={`${variation.id || variationIndex}_${field.key}`}>
                          <div className="text-sm font-bold text-gray-700 mb-2">{field.labels?.fa || 'وضعیت'}</div>
                          <Select
                            className="w-full"
                            value={(variation as any)[field.key] ?? 'active'}
                            onChange={(nextValue) => updateVariation(variationIndex, { [field.key]: nextValue } as Partial<ProductVariationRecord>)}
                            options={statusOptions}
                            placeholder={field.labels?.fa || 'وضعیت'}
                          />
                        </div>
                      );
                    }

                    if (fieldKey === 'site_sync_enabled') {
                      return (
                        <div key={`${variation.id || variationIndex}_${field.key}`}>
                          <div className="text-sm font-bold text-gray-700 mb-2">{field.labels?.fa || field.key}</div>
                          <Switch
                            checked={(variation as any)[field.key] === true}
                            onChange={(checked) => updateVariation(variationIndex, { [field.key]: checked } as Partial<ProductVariationRecord>)}
                          />
                        </div>
                      );
                    }

                    return (
                      <div key={`${variation.id || variationIndex}_${field.key}`}>
                        <SmartFieldRenderer
                          field={field}
                          value={(variation as any)[field.key]}
                          onChange={(nextValue) => updateVariation(variationIndex, { [field.key]: nextValue } as Partial<ProductVariationRecord>)}
                          options={field.key === 'opening_shelf_id' ? openingShelfOptions : undefined}
                          forceEditMode={mode === 'edit'}
                          moduleId="products"
                          recordId={variation.id}
                          allValues={variation as any}
                        />
                      </div>
                    );
                  })}

                  <div className="rounded-2xl border border-dashed border-gray-200 p-3 text-sm text-gray-600">
                    <div>کد سیستمی: <span className="font-bold text-gray-800">{variation.system_code || '-'}</span></div>
                    <div>موجودی: <span className="font-bold text-gray-800">{variation.stock ?? '-'}</span></div>
                    <div>وضعیت sync: <span className="font-bold text-gray-800">{variation.site_sync_status || '-'}</span></div>
                    <div className="text-xs mt-2 break-all">امضای متغیر: {buildVariantSignature(variation.variant_values || {})}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal
        open={customAttributeOpen}
        title="افزودن ویژگی سفارشی"
        onCancel={() => {
          setCustomAttributeOpen(false);
          setCustomAttributeDraft(DEFAULT_ATTRIBUTE_DRAFT);
        }}
        onOk={handleCreateCustomAttribute}
        destroyOnHidden
        zIndex={16000}
        getContainer={() => document.body}
      >
        <div className="space-y-3">
          <Input
            placeholder="عنوان ویژگی"
            value={customAttributeDraft.label}
            onChange={(event) => setCustomAttributeDraft((prev) => ({ ...prev, label: event.target.value }))}
          />
          <Input
            placeholder="کلید (اختیاری)"
            value={customAttributeDraft.key}
            onChange={(event) => setCustomAttributeDraft((prev) => ({ ...prev, key: event.target.value }))}
          />
          <Select
            value={customAttributeDraft.value_type}
            onChange={(value) => setCustomAttributeDraft((prev) => ({ ...prev, value_type: value }))}
            options={[
              { label: 'انتخابی', value: 'select' },
              { label: 'چندانتخابی', value: 'multi_select' },
              { label: 'متنی', value: 'text' },
              { label: 'عددی', value: 'number' },
              { label: 'رنگ', value: 'color' },
            ]}
            getPopupContainer={(trigger) => trigger.parentElement || document.body}
          />
          {(customAttributeDraft.value_type === 'select' || customAttributeDraft.value_type === 'multi_select' || customAttributeDraft.value_type === 'color') && (
            <DynamicSelectField
              value={customAttributeDraftOptions.map((option) => option.value)}
              onChange={(value) => {
                const selectedValues = Array.isArray(value) ? value.map(String) : (value ? [String(value)] : []);
                const nextOptions = customAttributeDraftOptions.filter((option) =>
                  selectedValues.includes(String(option.value)) || selectedValues.includes(String(option.label))
                );
                setCustomAttributeDraft((prev) => ({
                  ...prev,
                  optionsText: nextOptions.map((option) => option.label).join('\n'),
                }));
              }}
              options={customAttributeDraftOptions}
              placeholder="گزینه‌های ویژگی را اضافه یا مدیریت کنید"
              className="w-full"
              mode="multiple"
              manageMode="local"
              localOptions={customAttributeDraftOptions}
              onLocalOptionsChange={(nextOptions) => {
                setCustomAttributeDraft((prev) => ({
                  ...prev,
                  optionsText: nextOptions.map((option) => option.label).join('\n'),
                }));
              }}
              getPopupContainer={(trigger) => trigger.parentElement || document.body}
            />
          )}
          <div className="flex items-center justify-between">
            <span>به‌عنوان متغیر</span>
            <Switch checked={customAttributeDraft.is_variation} onChange={(checked) => setCustomAttributeDraft((prev) => ({ ...prev, is_variation: checked }))} />
          </div>
          <div className="flex items-center justify-between">
            <span>نمایش در سایت</span>
            <Switch checked={customAttributeDraft.is_visible_on_site} onChange={(checked) => setCustomAttributeDraft((prev) => ({ ...prev, is_visible_on_site: checked }))} />
          </div>
          <div className="flex items-center justify-between">
            <span>به library عمومی هم اضافه شود</span>
            <Switch checked={customAttributeDraft.persistAsGlobal} onChange={(checked) => setCustomAttributeDraft((prev) => ({ ...prev, persistAsGlobal: checked }))} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProductCatalogManager;
