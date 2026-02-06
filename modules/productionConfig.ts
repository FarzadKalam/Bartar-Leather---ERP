import { ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldLocation, BlockType, FieldNature, RowCalculationType } from '../types';
import { BOM_TABLE_BLOCKS } from './productsConfig';

// تعریف بلاک‌های جدول BOM با قابلیت محاسباتی
const BOM_BLOCKS = {
  leather: {
    ...BOM_TABLE_BLOCKS.items_leather,
    titles: { fa: 'بخش چرم', en: 'Leather Section' },
    order: 1,
    rowCalculationType: RowCalculationType.SIMPLE_MULTIPLY,
  },
  lining: {
    ...BOM_TABLE_BLOCKS.items_lining,
    titles: { fa: 'بخش آستر', en: 'Lining Section' },
    order: 2,
    rowCalculationType: RowCalculationType.SIMPLE_MULTIPLY,
  },
  fitting: {
    ...BOM_TABLE_BLOCKS.items_fitting,
    titles: { fa: 'بخش یراق', en: 'Fittings Section' },
    order: 3,
    rowCalculationType: RowCalculationType.SIMPLE_MULTIPLY,
  },
  accessory: {
    ...BOM_TABLE_BLOCKS.items_accessory,
    titles: { fa: 'بخش خرجکار', en: 'Accessories Section' },
    order: 4,
    rowCalculationType: RowCalculationType.SIMPLE_MULTIPLY,
  },
  labor: {
    id: 'items_labor',
    titles: { fa: 'هزینه‌های دستمزد', en: 'Labor Costs' },
    type: BlockType.TABLE,
    order: 5,
    rowCalculationType: RowCalculationType.SIMPLE_MULTIPLY,
    tableColumns: [
      { key: 'title', title: 'عنوان عملیات', type: FieldType.TEXT },
      { key: 'time', title: 'زمان (دقیقه)', type: FieldType.NUMBER },
      { key: 'usage', title: 'تعداد/ضریب', type: FieldType.NUMBER, defaultValue: 1 },
      { key: 'unit', title: 'واحد', type: FieldType.TEXT, defaultValue: '' },
      { key: 'buy_price', title: 'نرخ دستمزد', type: FieldType.PRICE },
      { key: 'total_price', title: 'جمع هزینه', type: FieldType.PRICE, readonly: true }
    ]
  }
};

export const productionBomModule: ModuleDefinition = {
  id: 'production_boms',
  titles: { fa: 'شناسنامه‌های تولید (BOM)', en: 'Production BOMs' },
  nature: ModuleNature.PRODUCTION,
  supportedViewModes: [ViewMode.LIST],
  defaultViewMode: ViewMode.LIST,
  fields: [
    { key: 'name', labels: { fa: 'عنوان مدل', en: 'Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, isKey: true, validation: { required: true } },
    { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Sys Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true },
    { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 4, options: [{ label: 'فعال', value: 'active', color: 'green' }, { label: 'بایگانی', value: 'archived', color: 'gray' }], defaultValue: 'active' },
  ],
  blocks: [
    BOM_BLOCKS.leather,
    BOM_BLOCKS.lining,
    BOM_BLOCKS.fitting,
    BOM_BLOCKS.accessory,
    BOM_BLOCKS.labor
  ],
  relatedTabs: [],
  table: ''
};

export const productionOrderModule: ModuleDefinition = {
  id: 'production_orders',
  titles: { fa: 'سفارشات تولید', en: 'Production Orders' },
  nature: ModuleNature.PRODUCTION,
  supportedViewModes: [ViewMode.LIST],
  defaultViewMode: ViewMode.LIST,
  fields: [
    { key: 'name', labels: { fa: 'عنوان سفارش', en: 'Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 0, isKey: true, validation: { required: true }, isTableColumn: true },
    { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },
    { key: 'bom_id', labels: { fa: 'انتخاب شناسنامه (BOM)', en: 'Select BOM' }, type: FieldType.RELATION, location: FieldLocation.HEADER, order: 2, relationConfig: { targetModule: 'production_boms', targetField: 'name' } },
    { key: 'quantity', labels: { fa: 'تعداد تولید', en: 'Production Qty' }, type: FieldType.NUMBER, location: FieldLocation.HEADER, order: 3, validation: { required: true }, readonly: true, nature: FieldNature.SYSTEM },
    { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 4, options: [{ label: 'در انتظار', value: 'pending', color: 'orange' }, { label: 'در حال تولید', value: 'in_progress', color: 'blue' }, { label: 'تکمیل شده', value: 'completed', color: 'green' }], defaultValue: 'pending', isTableColumn: true },
    { 
      key: 'production_stages', 
      labels: { fa: 'مراحل تولید', en: 'Stages' }, 
      type: FieldType.PROGRESS_STAGES, // 👈 استفاده از تایپ جدید
      location: FieldLocation.BLOCK, 
      blockId: 'baseInfo', // یا هر بلاک دیگری
      order: 10, 
      isTableColumn: true, // نمایش در لیست
      nature: FieldNature.STANDARD 
    }
  ],
  blocks: [
    // نمایش اقلام BOM مرتبط
    BOM_BLOCKS.leather,
    BOM_BLOCKS.lining,
    BOM_BLOCKS.fitting,
    BOM_BLOCKS.accessory,
    BOM_BLOCKS.labor
  ],
  
  relatedTabs: [],
  table: ''
};