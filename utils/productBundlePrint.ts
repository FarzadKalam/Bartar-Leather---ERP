import { toPersianNumber } from './persianNumberFormatter';
import { convertBetweenUnits } from './unitConversions';

export interface ProductBundlePrintItem {
  productId: string;
  name: string;
  systemCode: string;
  stock: number;
  mainUnit: string;
  subStock: number;
  subUnit: string;
}

const toNumber = (value: any) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const mapBundleInventoryRowsToPrintItems = (rows: any[]): ProductBundlePrintItem[] => {
  const items = new Map<string, ProductBundlePrintItem>();

  (rows || []).forEach((row: any) => {
    const productId = String(row?.product_id || '').trim();
    if (!productId) return;

    const existing = items.get(productId);
    const stock = toNumber(row?.stock);
    const mainUnit = String(row?.products?.main_unit || '');
    const subUnit = String(row?.products?.sub_unit || '');
    const storedSubStock = toNumber(row?.sub_stock);
    const computedSubStock = convertBetweenUnits(stock, mainUnit, subUnit);
    const subStock = (storedSubStock === 0 && stock !== 0 && computedSubStock !== 0)
      ? computedSubStock
      : storedSubStock;
    if (existing) {
      existing.stock += stock;
      existing.subStock += subStock;
      return;
    }

    items.set(productId, {
      productId,
      name: String(row?.products?.name || productId),
      systemCode: String(row?.products?.system_code || ''),
      stock,
      mainUnit,
      subStock,
      subUnit,
    });
  });

  return Array.from(items.values()).sort((left, right) => {
    const leftCode = left.systemCode || left.name;
    const rightCode = right.systemCode || right.name;
    return leftCode.localeCompare(rightCode, 'fa');
  });
};

export const formatBundlePrintItems = (items: ProductBundlePrintItem[]) => (
  (items || []).map((item, index) => {
    const code = item.systemCode || '-';
    const mainStock = `${toPersianNumber(item.stock)} ${item.mainUnit}`.trim();
    const hasSecondaryUnit = item.subUnit && item.subUnit !== item.mainUnit;
    const subStock = hasSecondaryUnit
      ? ` (${toPersianNumber(item.subStock)} ${item.subUnit})`
      : '';
    const stock = `${mainStock}${subStock}`.trim();
    return `${toPersianNumber(index + 1)}. ${code} | ${item.name} | موجودی: ${stock}`;
  }).join('\n')
);

export const BUNDLE_PRODUCTS_PRINT_FIELD = {
  key: 'bundle_products_summary',
  type: 'text',
  labels: { fa: 'محصولات داخل بسته', en: 'Bundle Products' },
  order: 1000,
};

export const upsertBundleProductsPrintField = (fields: any[], summary: string) => {
  const safeFields = Array.isArray(fields) ? fields.filter(Boolean) : [];
  const fieldIndex = safeFields.findIndex(
    (field: any) => String(field?.key || '') === BUNDLE_PRODUCTS_PRINT_FIELD.key
  );

  if (!summary) {
    return fieldIndex >= 0
      ? safeFields.filter((field: any) => String(field?.key || '') !== BUNDLE_PRODUCTS_PRINT_FIELD.key)
      : safeFields;
  }

  const nextField = {
    ...BUNDLE_PRODUCTS_PRINT_FIELD,
    ...(fieldIndex >= 0 ? safeFields[fieldIndex] : {}),
    value: summary,
  };

  if (fieldIndex >= 0) {
    const nextFields = [...safeFields];
    nextFields[fieldIndex] = nextField;
    return nextFields;
  }

  return [...safeFields, nextField];
};
