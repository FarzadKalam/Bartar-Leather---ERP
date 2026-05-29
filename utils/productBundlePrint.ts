import { toPersianNumber } from './persianNumberFormatter';

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
    const subStock = toNumber(row?.sub_stock);
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
      mainUnit: String(row?.products?.main_unit || ''),
      subStock,
      subUnit: String(row?.products?.sub_unit || ''),
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
