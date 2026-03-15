// optionHelpers.ts - نسخه اصلاح‌شده با 6 پارامتر

/**
 * دریافت label برای یک مقدار (تک یا چندتایی)
 */
export const getOptionLabel = (
  field: any,
  value: any,
  dynamicOptions: Record<string, any[]> = {},
  relationOptions: Record<string, any[]> = {},
  record?: any,
  relationConfig?: any
): string => {
  if (!value) return '-';

  // برای MULTI_SELECT (آرایه)
  if (Array.isArray(value)) {
    return value
      .map(v => getSingleOptionLabel(field, v, dynamicOptions, relationOptions, record, relationConfig))
      .join(', ');
  }

  // برای SELECT و RELATION (تک مقدار)
  return getSingleOptionLabel(field, value, dynamicOptions, relationOptions, record, relationConfig);
};

/**
 * دریافت label برای یک مقدار تکی
 * با fallback chain کامل برای relation fields
 */
export const getSingleOptionLabel = (
  field: any,
  value: any,
  dynamicOptions: Record<string, any[]> = {},
  relationOptions: Record<string, any[]> = {},
  record?: any,
  relationConfig?: any
): string => {
  if (!value) return '-';

  // مرحله ۱: جستجو در field.options (static options)
  if (field.options) {
    const opt = field.options.find((o: any) => String(o.value) === String(value));
    if (opt) return opt.label || String(value);
  }

  // مرحله ۲: جستجو در dynamicOptions
  if ((field as any).dynamicOptionsCategory) {
    const category = (field as any).dynamicOptionsCategory;
    const dynopts = dynamicOptions[category] || [];
    const opt = dynopts.find((o: any) => String(o.value) === String(value));
    if (opt) return opt.label || String(value);
  }

  // مرحله ۳: برای RELATION fields - با fallback chain کامل
  if (field.type === 'relation' || field.type === 'RELATION') {
    const targetModule = relationConfig?.targetModule || (field as any)?.relationConfig?.targetModule;
    const targetField = relationConfig?.targetField || (field as any)?.relationConfig?.targetField || 'name';
    
    // Fallback chain برای relationOptions
    const rellopts = 
      relationOptions[field.key] || 
      relationOptions[targetModule] || 
      [];
    
    // جستجو با مقایسه type-safe
    const opt = rellopts.find((o: any) => String(o.value) === String(value));
    if (opt) return opt.label || String(value);

    // مرحله ۴: Fallback به داده‌های join شده در record
    if (record && targetModule && targetField) {
      // الگوی ۱: record[targetModule]?.targetField (مثل record.products?.name)
      const nestedData = record[targetModule];
      if (nestedData && nestedData[targetField]) {
        return String(nestedData[targetField]);
      }

      // الگوی ۲: record[field.key + '_' + targetField] (مثل record.product_id_name)
      const flatKey = `${field.key}_${targetField}`;
      if (record[flatKey]) {
        return String(record[flatKey]);
      }

      // الگوی ۳: record[singularTargetModule] (مثل record.product?.name)
      const singularModule = targetModule.replace(/s$/, ''); // products -> product
      const singularData = record[singularModule];
      if (singularData && singularData[targetField]) {
        return String(singularData[targetField]);
      }
    }
  }

  // مرحله ۵: برگرداندن خود value
  return String(value);
};

/**
 * دریافت لیست options برای یک فیلد
 */
export const getFieldOptions = (
  field: any,
  dynamicOptions: Record<string, any[]> = {},
  relationOptions: Record<string, any[]> = {}
): any[] => {
  // اگر field.options موجود است (static options)
  if (field.options) {
    return field.options;
  }

  // اگر dynamicOptionsCategory موجود است
  if ((field as any).dynamicOptionsCategory) {
    const category = (field as any).dynamicOptionsCategory;
    return dynamicOptions[category] || [];
  }

  // اگر RELATION است - با fallback به targetModule
  if (field.type === 'relation' || field.type === 'RELATION') {
    const targetModule = (field as any)?.relationConfig?.targetModule;
    return relationOptions[field.key] || relationOptions[targetModule] || [];
  }

  return [];
};
