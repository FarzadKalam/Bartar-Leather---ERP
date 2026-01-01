import { ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldLocation, BlockType } from '../types';

// تعریف بلاک‌های جدول BOM با قابلیت محاسباتی
const BOM_BLOCKS = {
  leather: { 
    id: 'items_leather', 
    titles: { fa: 'بخش چرم', en: 'Leather Section' }, 
    type: BlockType.TABLE,
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
    { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 4, options: [{label:'فعال', value:'active', color:'green'}, {label:'بایگانی', value:'archived', color:'gray'}], defaultValue: 'active' },
  ],
  blocks: [
    BOM_BLOCKS.leather,
    BOM_BLOCKS.lining,
    BOM_BLOCKS.fitting,
    BOM_BLOCKS.accessory,
    BOM_BLOCKS.labor
  ],
  relatedTabs: []
};

export const productionOrderModule: ModuleDefinition = {
    id: 'production_orders',
    titles: { fa: 'سفارشات تولید', en: 'Production Orders' },
    nature: ModuleNature.PRODUCTION,
    supportedViewModes: [ViewMode.LIST],
    defaultViewMode: ViewMode.LIST,
    fields: [
        { key: 'order_number', labels: { fa: 'شماره سفارش', en: 'Order No' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, isKey: true },
        { key: 'bom_id', labels: { fa: 'انتخاب محصول (BOM)', en: 'BOM' }, type: FieldType.RELATION, location: FieldLocation.HEADER, order: 2, relationConfig: { targetModule: 'production_boms', targetField: 'name' } },
        { key: 'quantity', labels: { fa: 'تعداد تولید', en: 'Qty' }, type: FieldType.NUMBER, location: FieldLocation.HEADER, order: 3 },
        { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 4, options: [{label:'در انتظار', value:'pending', color:'orange'}, {label:'در حال تولید', value:'in_progress', color:'blue'}, {label:'تکمیل شده', value:'completed', color:'green'}], defaultValue: 'pending' },
    ],
    blocks: [],
    relatedTabs: []
};