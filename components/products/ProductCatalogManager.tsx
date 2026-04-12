import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Divider, Input, Modal, Select, Space, Switch, Tag } from 'antd';
import { DeleteOutlined, LinkOutlined, PlusOutlined, SyncOutlined } from '@ant-design/icons';
import type { ModuleField } from '../../types';
import { FieldType } from '../../types';
import SmartFieldRenderer from '../SmartFieldRenderer';
import DynamicSelectField from '../DynamicSelectField';
import { supabase } from '../../supabaseClient';
import {
  buildVariantName,
  buildVariantSignature,
  buildVariantSummary,
  cartesianProduct,
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
  { key: 'name', type: FieldType.TEXT, labels: { fa: 'نام متغیر' } },
  { key: 'site_code', type: FieldType.TEXT, labels: { fa: 'کد سایت / SKU' } },
  { key: 'sell_price', type: FieldType.PRICE, labels: { fa: 'قیمت فروش' } },
  {
    key: 'related_bom',
    type: FieldType.RELATION,
    labels: { fa: 'شناسنامه تولید مرجع' },
    relationConfig: { targetModule: 'production_boms', targetField: 'name' },
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
  { key: 'global_size', label: 'سایز', dynamicCategory: 'fitting_size', valueType: 'select' as const },
];

const MAX_GENERATED_VARIATIONS = 200;

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

const ProductCatalogManager: React.FC<ProductCatalogManagerProps> = ({
  productId,
  product,
  productFields,
  dynamicOptions,
  relationOptions = {},
  mode,
  canEdit = true,
  checkVisibility,
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
  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null);
  const [selectedGlobalKey, setSelectedGlobalKey] = useState<string | null>(null);
  const [selectedFieldOptionValues, setSelectedFieldOptionValues] = useState<string[]>([]);
  const [selectedGlobalOptionValues, setSelectedGlobalOptionValues] = useState<string[]>([]);
  const [customAttributeOpen, setCustomAttributeOpen] = useState(false);
  const [customAttributeDraft, setCustomAttributeDraft] = useState<CustomAttributeDraft>(DEFAULT_ATTRIBUTE_DRAFT);

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

  const visibleFieldCandidates = useMemo(() => (
    productFields
      .filter((field) => isEligibleProductAttributeField(field))
      .filter((field) => (checkVisibility ? checkVisibility(field.logic, product) : true))
      .sort((left, right) => (left.order || 0) - (right.order || 0))
  ), [checkVisibility, product, productFields]);

  const materialCategory = String(product?.category || '').trim();
  const isRawMaterialProduct = String(product?.product_type || '').trim() === 'raw';
  const materialCategoryOptions = useMemo(
    () => Object.entries(MATERIAL_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
    [],
  );

  const categorySpecificFieldCandidates = useMemo(() => {
    if (!isRawMaterialProduct || !materialCategory) return [];
    return productFields
      .filter((field) => isEligibleProductAttributeField(field))
      .filter((field) => {
        const rule = (field.logic as any)?.visibleIf || field.logic;
        return String(rule?.field || '') === 'category'
          && String(rule?.value || '') === materialCategory;
      })
      .sort((left, right) => (left.order || 0) - (right.order || 0));
  }, [isRawMaterialProduct, materialCategory, productFields]);

  const availableFieldCandidates = useMemo(() => {
    const source = isRawMaterialProduct
      ? categorySpecificFieldCandidates
      : (
          visibleFieldCandidates.length > 0
            ? visibleFieldCandidates
            : productFields
                .filter((field) => isEligibleProductAttributeField(field))
                .sort((left, right) => (left.order || 0) - (right.order || 0))
        );

    return source.filter((field) => {
      const normalizedKey = normalizeAttributeKey(field.key);
      return !attributes.some((attribute) => attribute.key === normalizedKey);
    });
  }, [attributes, categorySpecificFieldCandidates, isRawMaterialProduct, productFields, visibleFieldCandidates]);

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

  const allGlobalTemplates = useMemo(() => {
    const templateMap = new Map<string, ProductAttributeRecord>();
    [...defaultGlobalTemplates, ...globalLibrary, ...pendingGlobalAttributes].forEach((attribute) => {
      if (!attribute?.key) return;
      if (attributes.some((item) => item.key === attribute.key)) return;
      templateMap.set(attribute.key, attribute);
    });
    return Array.from(templateMap.values());
  }, [attributes, defaultGlobalTemplates, globalLibrary, pendingGlobalAttributes]);

  const availableGlobalTemplates = allGlobalTemplates;

  const selectedField = useMemo(
    () => (selectedFieldKey ? fieldMap.get(selectedFieldKey) || null : null),
    [fieldMap, selectedFieldKey],
  );

  const selectedFieldAvailableOptions = useMemo(
    () => (selectedField ? resolveFieldAttributeOptions(selectedField, dynamicOptions).map((option) => ({
      label: option.label,
      value: option.value,
    })) : []),
    [dynamicOptions, selectedField],
  );

  const selectedGlobalTemplate = useMemo(
    () => (selectedGlobalKey ? allGlobalTemplates.find((attribute) => attribute.key === selectedGlobalKey) || null : null),
    [allGlobalTemplates, selectedGlobalKey],
  );

  const selectedGlobalAvailableOptions = useMemo(
    () => ((selectedGlobalTemplate?.options || []).map((option) => ({
      label: option.label,
      value: option.value,
    }))),
    [selectedGlobalTemplate],
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

  const addFieldAttribute = () => {
    if (!selectedFieldKey) return;
    const field = fieldMap.get(selectedFieldKey);
    if (!field) return;
    const key = normalizeAttributeKey(field.key);
    if (attributes.some((attribute) => attribute.key === key)) {
      message.warning('این ویژگی قبلاً اضافه شده است.');
      return;
    }
    const sourceOptions = resolveFieldAttributeOptions(field, dynamicOptions);
    const selectedOptions = selectedFieldOptionValues.length > 0
      ? selectedFieldOptionValues.map((rawValue, index) => {
          const matched = matchOptionByValue(sourceOptions, String(rawValue));
          return {
            label: String(matched?.label || rawValue),
            value: String(matched?.value || rawValue),
            sort_order: index,
            is_active: true,
          };
        })
      : sourceOptions;
    setAttributes((prev) => [
      ...prev,
      {
        key,
        label: field.labels?.fa || field.key,
        scope_type: 'parent',
        parent_product_id: String(productId || '').trim() || null,
        value_type: mapFieldTypeToAttributeValueType(field.type),
        option_source_type: 'field',
        source_field_key: field.key,
        is_variation: true,
        is_visible_on_site: true,
        sort_order: prev.length,
        is_active: true,
        options: selectedOptions,
      },
    ]);
    setSelectedFieldKey(null);
    setSelectedFieldOptionValues([]);
  };

  const addGlobalTemplate = () => {
    if (!selectedGlobalKey) return;
    const template = allGlobalTemplates.find((item) => item.key === selectedGlobalKey);
    if (!template) return;
    if (attributes.some((attribute) => attribute.key === template.key)) {
      message.warning('این ویژگی قبلاً روی محصول فعال شده است.');
      return;
    }
    const selectedOptions = selectedGlobalOptionValues.length > 0
      ? selectedGlobalOptionValues.map((rawValue, index) => {
          const matched = (template.options || []).find((option) =>
            String(option.value) === String(rawValue) || String(option.label) === String(rawValue)
          );
          return {
            ...(matched || { label: String(rawValue), value: String(rawValue) }),
            sort_order: index,
            is_active: true,
          };
        })
      : (template.options || []);
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
    setVariations((prev) => [
      ...prev,
      {
        name: product?.auto_name_enabled ? getAutoVariationName({}) : '',
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
        variant_values: {},
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
      const optionGroups = variationAttributes.map((attribute) => {
        const options = attributeOptionsMap.get(attribute.key) || [];
        if (!options.length) {
          throw new Error(`ویژگی "${attribute.label}" گزینه قابل ترکیب ندارد.`);
        }
        return options.map((option) => ({ key: attribute.key, value: option.value }));
      });

      const combinationsCount = optionGroups.reduce((total, group) => total * group.length, 1);
      if (combinationsCount > MAX_GENERATED_VARIATIONS) {
        throw new Error(`تعداد ترکیب‌ها (${combinationsCount}) زیاد است. لطفاً مقادیر کمتری برای ویژگی‌ها انتخاب کنید.`);
      }

      const combos = cartesianProduct(optionGroups);
      setVariations((prev) => {
        const existingSignatures = new Set(prev.map((variation) => buildVariantSignature(variation.variant_values || {})));
        const nextRows = combos
          .map((combo) => combo.reduce<Record<string, any>>((acc, item) => {
            acc[item.key] = item.value;
            return acc;
          }, {}))
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
                <div className="text-xs font-bold text-gray-500">افزودن از ویژگی‌های اختصاصی</div>
                <Select
                  value={selectedFieldKey}
                  onChange={(value) => {
                    setSelectedFieldKey(value);
                    setSelectedFieldOptionValues([]);
                  }}
                  placeholder={isRawMaterialProduct && !materialCategory ? 'ابتدا گروه کالای مواد اولیه را انتخاب کنید' : 'یک فیلد انتخاب کنید'}
                  options={availableFieldCandidates.map((field) => ({
                    label: field.labels?.fa || field.key,
                    value: field.key,
                  }))}
                  className="w-full"
                  showSearch
                  optionFilterProp="label"
                  disabled={isRawMaterialProduct && !materialCategory}
                  getPopupContainer={(trigger) => trigger.parentElement || document.body}
                  notFoundContent="فیلد قابل‌استفاده‌ای پیدا نشد"
                />
                {selectedFieldAvailableOptions.length > 0 && (
                  <DynamicSelectField
                    value={selectedFieldOptionValues}
                    onChange={(value) => setSelectedFieldOptionValues(Array.isArray(value) ? value.map(String) : (value ? [String(value)] : []))}
                    options={selectedFieldAvailableOptions}
                    category={selectedField?.dynamicOptionsCategory}
                    placeholder="مقادیر موردنظر برای ساخت ترکیب را انتخاب کنید"
                    className="w-full"
                    allowClear
                    mode="multiple"
                    manageMode={selectedField?.dynamicOptionsCategory ? 'remote' : 'local'}
                    localOptions={selectedFieldAvailableOptions}
                    getPopupContainer={(trigger) => trigger.parentElement || document.body}
                  />
                )}
                <div className="text-xs text-gray-400">
                  {isRawMaterialProduct && !materialCategory
                    ? 'برای استخراج ویژگی‌های اختصاصی، ابتدا دسته‌بندی مواد اولیه را انتخاب کنید'
                    : availableFieldCandidates.length > 0
                      ? `${availableFieldCandidates.length} فیلد قابل استفاده${materialCategory ? ` برای گروه ${MATERIAL_CATEGORY_LABELS[materialCategory] || materialCategory}` : ''} پیدا شد`
                      : 'فعلاً فیلد قابل استفاده‌ای در وضعیت فعلی فرم دیده نمی‌شود'}
                </div>
                <Button block onClick={addFieldAttribute} disabled={!selectedFieldKey}>
                  افزودن ویژگی اختصاصی
                </Button>
              </div>

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
                    category={
                      DEFAULT_GLOBAL_ATTRIBUTE_DEFINITIONS.find((item) => item.key === selectedGlobalKey)?.dynamicCategory
                    }
                    placeholder="مقادیر موردنظر برای ساخت ترکیب را انتخاب کنید"
                    className="w-full"
                    allowClear
                    mode="multiple"
                    manageMode={
                      DEFAULT_GLOBAL_ATTRIBUTE_DEFINITIONS.some((item) => item.key === selectedGlobalKey)
                        ? 'remote'
                        : 'local'
                    }
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
                      const field: ModuleField = sourceField
                        ? {
                            ...sourceField,
                            key: attribute.key,
                            labels: { fa: attribute.label },
                            type: attribute.value_type === 'number'
                              ? FieldType.NUMBER
                              : attribute.value_type === 'multi_select'
                                ? FieldType.MULTI_SELECT
                                : FieldType.SELECT,
                            options: attribute.option_source_type === 'field'
                              ? sourceField.options
                              : (attribute.options || []).map((option) => ({ label: option.label, value: option.value })),
                            dynamicOptionsCategory: attribute.option_source_type === 'field' ? sourceField.dynamicOptionsCategory : undefined,
                          }
                        : {
                            key: attribute.key,
                            labels: { fa: attribute.label },
                            type: attribute.value_type === 'number'
                              ? FieldType.NUMBER
                              : attribute.value_type === 'multi_select'
                                ? FieldType.MULTI_SELECT
                                : FieldType.SELECT,
                            options: (attribute.options || []).map((option) => ({ label: option.label, value: option.value })),
                          };

                      const customOptions = attribute.option_source_type === 'custom'
                        ? (attribute.options || []).map((option) => ({ label: option.label, value: option.value }))
                        : undefined;

                      return (
                        <div key={`${variation.id || variationIndex}_${attribute.key}`}>
                          <SmartFieldRenderer
                            field={field}
                            value={variation.variant_values?.[attribute.key]}
                            onChange={(nextValue) => {
                              const nextValues = { ...(variation.variant_values || {}), [attribute.key]: nextValue };
                              updateVariation(variationIndex, { variant_values: nextValues });
                            }}
                            options={customOptions}
                            forceEditMode={mode === 'edit'}
                            moduleId="products"
                            recordId={variation.id}
                            allValues={variation.variant_values || {}}
                          />
                        </div>
                      );
                    })}

                  {VARIATION_COMMON_FIELDS.map((field) => (
                    <div key={`${variation.id || variationIndex}_${field.key}`}>
                      <SmartFieldRenderer
                        field={field.key === 'status' && statusField ? { ...statusField, key: 'status' } : field}
                        value={(variation as any)[field.key]}
                        onChange={(nextValue) => updateVariation(variationIndex, { [field.key]: nextValue } as Partial<ProductVariationRecord>)}
                        options={field.key === 'related_bom' ? relationOptions.related_bom : undefined}
                        forceEditMode={mode === 'edit'}
                        moduleId="products"
                        recordId={variation.id}
                        allValues={variation as any}
                      />
                    </div>
                  ))}

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
