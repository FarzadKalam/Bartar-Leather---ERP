import { ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldLocation, BlockType, FieldNature } from '../types';

// تعریف بلاک‌های جدول BOM با قابلیت محاسباتی
const BOM_BLOCKS = {
  leather: { 
    id: 'items_leather', 
    titles: { fa: 'بخش چرم', en: 'Leather Section' }, 
    type: BlockType.TABLE,
    order: 1,
    tableColumns: [
      { 
        key: 'item_id', title: 'انتخاب چرم', type: FieldType.RELATION, 
        relationConfig: { targetModule: 'products', targetField: 'name', filter: { category: 'leather' } } 
      },
      // فیلدهای قابل ویرایش (اما با قابلیت پر شدن اولیه)
      { key: 'leather_type', title: 'نوع', type: FieldType.SELECT, options: [{label:'گاوی', value:'cow'}, {label:'بزی', value:'goat'}, {label:'گوسفندی', value:'sheep'}] },
      { key: 'leather_color', title: 'رنگ', type: FieldType.SELECT, dynamicOptionsCategory: 'leather_color' },
      { key: 'buy_price', title: 'نرخ خرید (واحد)', type: FieldType.PRICE },
      
      { key: 'usage', title: 'مقدار مصرف', type: FieldType.NUMBER },
      { key: 'unit', title: 'واحد', type: FieldType.TEXT, defaultValue: 'فوت' },
      
      // ستون محاسباتی
      { key: 'total_price', title: 'بهای تمام شده', type: FieldType.PRICE, readonly: true, isCalculated: true }
    ]
  },
  lining: { 
    id: 'items_lining', 
    titles: { fa: 'بخش آستر', en: 'Lining Section' }, 
    type: BlockType.TABLE,
    order: 2,
    tableColumns: [
      { 
        key: 'item_id', title: 'انتخاب آستر', type: FieldType.RELATION, 
        relationConfig: { targetModule: 'products', targetField: 'name', filter: { category: 'lining' } } 
      },
      { key: 'lining_material', title: 'جنس', type: FieldType.SELECT, dynamicOptionsCategory: 'lining_material' },
      { key: 'lining_color', title: 'رنگ', type: FieldType.SELECT, dynamicOptionsCategory: 'general_color' },
      { key: 'buy_price', title: 'نرخ خرید', type: FieldType.PRICE },
      { key: 'usage', title: 'مقدار مصرف', type: FieldType.NUMBER },
      { key: 'total_price', title: 'بهای تمام شده', type: FieldType.PRICE, readonly: true, isCalculated: true }
    ]
  },
  fitting: {
      id: 'items_fitting',
      titles: { fa: 'بخش یراق', en: 'Fittings Section' },
      type: BlockType.TABLE,
      order: 3,
      tableColumns: [
          { key: 'item_id', title: 'انتخاب یراق', type: FieldType.RELATION, relationConfig: { targetModule: 'products', targetField: 'name', filter: { category: 'fitting' } } },
          { key: 'fitting_type', title: 'نوع', type: FieldType.SELECT, dynamicOptionsCategory: 'fitting_type' },
          { key: 'buy_price', title: 'نرخ خرید', type: FieldType.PRICE },
          { key: 'usage', title: 'تعداد', type: FieldType.NUMBER },
          { key: 'total_price', title: 'بهای تمام شده', type: FieldType.PRICE, readonly: true, isCalculated: true }
      ]
  },
  accessory: {
      id: 'items_accessory',
      titles: { fa: 'بخش خرجکار', en: 'Accessories Section' },
      type: BlockType.TABLE,
      order: 4,
      tableColumns: [
          { key: 'item_id', title: 'انتخاب خرجکار', type: FieldType.RELATION, relationConfig: { targetModule: 'products', targetField: 'name', filter: { category: 'accessory' } } },
          { key: 'acc_material', title: 'جنس', type: FieldType.SELECT, dynamicOptionsCategory: 'acc_material' },
          { key: 'buy_price', title: 'نرخ خرید', type: FieldType.PRICE },
          { key: 'usage', title: 'تعداد', type: FieldType.NUMBER },
          { key: 'total_price', title: 'بهای تمام شده', type: FieldType.PRICE, readonly: true, isCalculated: true }
      ]
  },
  labor: {
      id: 'items_labor',
      titles: { fa: 'هزینه‌های دستمزد', en: 'Labor Costs' },
      type: BlockType.TABLE,
      order: 5,
      tableColumns: [
          { key: 'title', title: 'عنوان عملیات', type: FieldType.TEXT },
          { key: 'time', title: 'زمان (دقیقه)', type: FieldType.NUMBER },
          { key: 'buy_price', title: 'نرخ دستمزد', type: FieldType.PRICE }, // اینجا buy_price نقش هزینه واحد رو داره
          { key: 'usage', title: 'تعداد/ضریب', type: FieldType.NUMBER, defaultValue: 1 },
          { key: 'total_price', title: 'جمع هزینه', type: FieldType.PRICE, readonly: true, isCalculated: true }
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
    { key: 'quantity', labels: { fa: 'تعداد تولید', en: 'Production Qty' }, type: FieldType.NUMBER, location: FieldLocation.HEADER, order: 3, validation: { required: true } },
    { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 4, options: [{ label: 'در انتظار', value: 'pending', color: 'orange' }, { label: 'در حال تولید', value: 'in_progress', color: 'blue' }, { label: 'تکمیل شده', value: 'completed', color: 'green' }], defaultValue: 'pending', isTableColumn: true },
  ],
  blocks: [
    // نمایش اقلام BOM مرتبط
    {
      id: 'bomMaterials',
      titles: { fa: 'اقلام شناسنامه (مرجع)', en: 'BOM Materials (Reference)' },
      icon: 'ExperimentOutlined',
      order: 1,
      type: BlockType.TABLE,
      tableColumns: [
        {
          key: 'product_id',
          title: 'ماده اولیه',
          type: FieldType.RELATION,
          relationConfig: { targetModule: 'products', targetField: 'name' }
        },
        { key: 'usage', title: 'مقدار مصرف', type: FieldType.NUMBER },
        { key: 'unit', title: 'واحد', type: FieldType.TEXT },
        { key: 'buy_price', title: 'قیمت خرید', type: FieldType.PRICE },
        { key: 'total_price', title: 'جمع', type: FieldType.PRICE, readonly: true }
      ]
    }
  ],
  relatedTabs: [],
  table: ''
};