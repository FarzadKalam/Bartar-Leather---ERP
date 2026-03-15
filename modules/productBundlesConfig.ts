import { ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldLocation, BlockType, FieldNature } from '../types';
import { HARD_CODED_UNIT_OPTIONS } from '../utils/unitConversions';

/**
 * Product Bundles Module Configuration
 * 
 * برای بسته‌های محصول نیمه‌آماده (semi_finished_bundle)
 * 
 * هر بسته شامل:
 * - شماره بسته (bundle_number)
 * - قفسه انبار (shelf_id)
 * - اقلام داخل بسته (bundle_items)
 */

const BLOCKS = {
  bundleContents: {
    id: 'bundleContents',
    titles: { fa: 'اقلام بسته', en: 'Bundle Contents' },
    icon: 'BgColorsOutlined',
    order: 2,
    type: BlockType.TABLE,
    readonly: true,
  },
  bundleStockMovements: {
    id: 'bundle_stock_movements',
    titles: { fa: 'ورود و خروج کالا', en: 'Inventory Movements' },
    icon: 'SwapOutlined',
    order: 3,
    type: BlockType.TABLE
  }
};

export const productBundlesConfig: ModuleDefinition = {
  id: 'product_bundles',
  titles: { fa: 'بسته‌های محصول', en: 'Product Bundles' },
  nature: ModuleNature.PRODUCT,
  table: 'product_bundles',
  supportedViewModes: [ViewMode.LIST, ViewMode.GRID],
  defaultViewMode: ViewMode.LIST,
  
  fields: [
    // --- هدر ---
    {
      key: 'bundle_number',
      labels: { fa: 'کد دستی', en: 'Bundle Number' },
      type: FieldType.TEXT,
      location: FieldLocation.HEADER,
      order: 1,
      validation: { required: false },
      nature: FieldNature.PREDEFINED,
      isKey: true,
      isTableColumn: true,
    },
    { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },


    // --- اطلاعات پایه ---
    {
      key: 'shelf_id',
      labels: { fa: 'قفسه انبار', en: 'Storage Shelf' },
      type: FieldType.RELATION,
      location: FieldLocation.HEADER,
      //blockId: 'baseInfo',
      order: 2,
      relationConfig: {
        targetModule: 'shelves', // TODO: در صورت نیاز تصحیح شود
        targetField: 'name'
      },
      nature: FieldNature.PREDEFINED
    },

    
  ],

  blocks: [
    // بلوک جدول اقلام بسته
    {
      ...BLOCKS.bundleContents,
      tableColumns: [
        {
          key: 'product_id',
          title: 'محصول (مواد اولیه)',
          type: FieldType.RELATION,
          relationConfig: {
            targetModule: 'products',
            targetField: 'name'
          }
        },
        {
          key: 'product_name',
          title: 'نام محصول',
          type: FieldType.TEXT,
          readonly: true
        },
        {
          key: 'system_code',
          title: 'کد سیستمی',
          type: FieldType.TEXT,
          readonly: true
        },
        {
          key: 'quantity',
          title: 'مقدار واحد اصلی',
          type: FieldType.NUMBER
        },
        {
          key: 'main_unit',
          title: 'واحد اصلی',
          type: FieldType.TEXT,
          readonly: true
        },
        {
          key: 'sub_quantity',
          title: 'مقدار واحد فرعی',
          type: FieldType.NUMBER,
          readonly: true
        },
        {
          key: 'sub_unit',
          title: 'واحد فرعی',
          type: FieldType.TEXT,
          readonly: true
        }
      ]
    },
    {
      ...BLOCKS.bundleStockMovements,
      tableColumns: [
        {
          key: 'product_id',
          title: 'محصول',
          type: FieldType.RELATION,
          relationConfig: { targetModule: 'products', targetField: 'name' }
        },
        {
          key: 'voucher_type',
          title: 'نوع حواله',
          type: FieldType.SELECT,
          options: [
            { label: 'ورود', value: 'incoming' },
            { label: 'خروج', value: 'outgoing' },
            { label: 'جابجایی', value: 'transfer' }
          ]
        },
        {
          key: 'source',
          title: 'منبع',
          type: FieldType.SELECT,
          options: [
            { label: 'موجودی اول دوره', value: 'opening_balance' },
            { label: 'انبارگردانی', value: 'inventory_count' },
            { label: 'ضایعات', value: 'waste' },
            { label: 'فاکتور فروش', value: 'sales_invoice' },
            { label: 'فاکتور خرید', value: 'purchase_invoice' },
            { label: 'تولید', value: 'production' }
          ]
        },
        {
          key: 'main_unit',
          title: 'واحد اصلی',
          type: FieldType.SELECT,
          options: HARD_CODED_UNIT_OPTIONS,
          readonly: true
        },
        { key: 'main_quantity', title: 'مقدار واحد اصلی', type: FieldType.NUMBER, showTotal: true },
        {
          key: 'sub_unit',
          title: 'واحد فرعی',
          type: FieldType.SELECT,
          options: HARD_CODED_UNIT_OPTIONS,
          readonly: true
        },
        { key: 'sub_quantity', title: 'مقدار واحد فرعی', type: FieldType.NUMBER, showTotal: true },
        {
          key: 'bundle_id',
          title: 'بسته محصول',
          type: FieldType.RELATION,
          relationConfig: { targetModule: 'product_bundles', targetField: 'bundle_number' }
        },
        {
          key: 'from_shelf_id',
          title: 'قفسه برداشت',
          type: FieldType.RELATION,
          relationConfig: { targetModule: 'shelves', targetField: 'name' }
        },
        {
          key: 'to_shelf_id',
          title: 'قفسه ورود',
          type: FieldType.RELATION,
          relationConfig: { targetModule: 'shelves', targetField: 'name' }
        },
        {
          key: 'invoice_id',
          title: 'فاکتور مرتبط',
          type: FieldType.RELATION,
          relationConfig: { targetModule: 'invoices', targetField: 'name' },
          readonly: true
        },
        {
          key: 'purchase_invoice_id',
          title: 'فاکتور خرید مرتبط',
          type: FieldType.RELATION,
          relationConfig: { targetModule: 'purchase_invoices', targetField: 'name' },
          readonly: true
        },
        {
          key: 'production_order_id',
          title: 'سفارش تولید مرتبط',
          type: FieldType.RELATION,
          relationConfig: { targetModule: 'production_orders', targetField: 'name' },
          readonly: true
        },
        { key: 'created_by_name', title: 'ایجادکننده', type: FieldType.TEXT, readonly: true },
        { key: 'created_at', title: 'زمان ایجاد', type: FieldType.DATETIME, readonly: true }
      ]
    }
  ],

  relatedTabs: [
    {
      id: 'products',
      title: 'محصولات استفاده‌کننده',
      icon: 'ShoppingCart',
      targetModule: 'products',
      foreignKey: 'bundle_id',
      relationType: 'fk'
    }
  ]
};
