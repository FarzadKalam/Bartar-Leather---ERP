import { ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldLocation, BlockType, LogicOperator, FieldNature } from '../types';

// ====== 1. تعریف تمام فیلدها ======
const fieldsArray: any[] = [
  // --- هدر ---
  { key: 'image_url', labels: { fa: 'تصویر', en: 'Image' }, type: FieldType.IMAGE, location: FieldLocation.HEADER, order: 0, nature: FieldNature.PREDEFINED, isTableColumn: true },
  { key: 'name', labels: { fa: 'نام محصول', en: 'Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, validation: { required: true }, nature: FieldNature.PREDEFINED, isTableColumn: true },
  { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },
  { key: 'manual_code', labels: { fa: 'کد دستی', en: 'Manual Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 3, nature: FieldNature.STANDARD, isTableColumn: true },
  { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 4, options: [{label:'فعال', value:'active', color:'green'}, {label:'پیش‌نویس', value:'draft', color:'orange'}], isTableColumn: true },
  { key: 'tags', labels: { fa: 'برچسب‌ها', en: 'Tags' }, type: FieldType.TAGS, location: FieldLocation.HEADER, order: 5, nature: FieldNature.STANDARD, isTableColumn: true },
  //{ key: 'assignee_id', labels: { fa: 'مسئول', en: 'Assignee' }, type: FieldType.USER, location: FieldLocation.HEADER, order: 6, nature: FieldNature.STANDARD, isTableColumn: true },
  
  // --- اطلاعات پایه ---
  { key: 'product_type', labels: { fa: 'نوع محصول', en: 'Product Type' }, type: FieldType.STATUS, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 1, options: [{ label: 'مواد اولیه', value: 'raw', color: 'red' }, { label: 'بسته نیمه آماده', value: 'semi', color: 'blue' }, { label: 'محصول نهایی', value: 'final', color: 'green' }], validation: { required: true }, nature: FieldNature.PREDEFINED, isTableColumn: true },
  
  { 
    key: 'category', 
    labels: { fa: 'دسته بندی مواد اولیه', en: 'Material Category' }, 
    type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, 
    blockId: 'baseInfo', 
    order: 2, 
    options: [
      { label: 'چرم', value: 'leather' }, 
      { label: 'آستر', value: 'lining' }, 
      { label: 'خرجکار', value: 'accessory' }, 
      { label: 'یراق', value: 'fitting' }
    ], 
    nature: FieldNature.PREDEFINED, 
    validation: { required: false },
    logic: { visibleIf: { field: 'product_type', operator: LogicOperator.EQUALS, value: 'raw' } } 
  },

  { 
    key: 'product_category', 
    labels: { fa: 'دسته بندی محصول', en: 'Product Category' }, 
    type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, 
    blockId: 'baseInfo', 
    order: 2.5, 
    dynamicOptionsCategory: 'product_categories',
    nature: FieldNature.STANDARD, 
    validation: { required: false },
    logic: { visibleIf: { field: 'product_type', operator: LogicOperator.NOT_EQUALS, value: 'raw' } } 
  },

  // --- فیلد رابطه BOM برای محصول نهایی و نیمه آماده ---
  {
    key: 'related_bom',
    labels: { fa: 'انتخاب شناسنامه تولید مرجع', en: 'Reference BOM' },
    type: FieldType.RELATION,
    location: FieldLocation.BLOCK,
    blockId: 'baseInfo',
    order: 3, 
    relationConfig: { targetModule: 'production_boms', targetField: 'name' },
    nature: FieldNature.STANDARD,
    logic: { visibleIf: { field: 'product_type', operator: LogicOperator.NOT_EQUALS, value: 'raw' } }
  },

  // --- سایر فیلدها ---
  { key: 'stock', labels: { fa: 'موجودی', en: 'Stock' }, type: FieldType.STOCK, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 5, nature: FieldNature.PREDEFINED },
  { key: 'buy_price', labels: { fa: 'قیمت خرید', en: 'Buy Price' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 6, nature: FieldNature.PREDEFINED, isTableColumn: true },
  { key: 'sell_price', labels: { fa: 'قیمت فروش', en: 'Sell Price' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 7, nature: FieldNature.PREDEFINED, isTableColumn: true },
  { key: 'production_cost', labels: { fa: 'بهای تمام شده تولید', en: 'Production Cost' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 8, nature: FieldNature.SYSTEM, readonly: true, description: 'محاسبه خودکار از شناسنامه تولید' },

  // فیلدهای اختصاصی چرم
  {
    key: 'leather_type', labels: { fa: 'نوع چرم', en: 'Leather Type' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 1, dynamicOptionsCategory: 'leather_type', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } },
    nature: FieldNature.PREDEFINED,
    isKey: false
  },
  //{ key: 'leather_color_1', labels: { fa: 'رنگ چرم ۱', en: 'Color 1' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 2, dynamicOptionsCategory: 'leather_color', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } } },
  { key: 'leather_colors', labels: { fa: 'رنگ چرم', en: 'Leather Colors' }, type: FieldType.MULTI_SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 2.5, dynamicOptionsCategory: 'leather_color', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } } },
  //{ key: 'leather_color_2', labels: { fa: 'رنگ چرم ۲', en: 'Color 2' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 3, dynamicOptionsCategory: 'leather_color', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } } },
  { key: 'leather_finish_1', labels: { fa: 'صفحه چرم', en: 'Finish 1' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 4, dynamicOptionsCategory: 'leather_finish', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } } },
  //{ key: 'leather_finish_2', labels: { fa: 'صفحه چرم ۲', en: 'Finish 2' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 5, dynamicOptionsCategory: 'leather_finish', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } } },
  { key: 'leather_sort', labels: { fa: 'سورت چرم', en: 'Sort' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 6, dynamicOptionsCategory: 'leather_sort', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } } },
  
  // فیلدهای اختصاصی آستر
  { key: 'lining_material', labels: { fa: 'جنس آستر', en: 'Material' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'liningSpec', order: 1, dynamicOptionsCategory: 'lining_material', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'lining' } } },
  { key: 'lining_color', labels: { fa: 'رنگ آستر', en: 'Color' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'liningSpec', order: 2, dynamicOptionsCategory: 'general_color', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'lining' } } },
  
  // فیلدهای اختصاصی خرجکار
  { key: 'acc_material', labels: { fa: 'جنس خرجکار', en: 'Material' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'kharjkarSpec', order: 1, dynamicOptionsCategory: 'acc_material', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'accessory' } } },
  
  // فیلدهای اختصاصی یراق
  { key: 'fitting_type', labels: { fa: 'جنس/نوع یراق', en: 'Type' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'yaraghSpec', order: 1, dynamicOptionsCategory: 'fitting_type', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'fitting' } } },
  {
    key: 'fitting_size', labels: { fa: 'سایز یراق', en: 'Size' }, type: FieldType.TEXT, location: FieldLocation.BLOCK, blockId: 'yaraghSpec', order: 2, logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'fitting' } },
    nature: FieldNature.PREDEFINED,
    isKey: false
  },
];

// ====== 2. Helper Functions ======
/** گرفتن فیلدهای یک blockId معین */
const getFieldsForBlock = (blockId: string) => {
  return fieldsArray
    .filter(f => f.blockId === blockId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
};

/** ساختن ستون‌های جدول BOM به صورت دینامیک */
const createBomTableColumns = (
  relationConfig: any,
  specBlockId: string,
  usageTitle: string = 'مقدار مصرف',
  unitDefault: string = 'فوت'
) => {
  const specFields = getFieldsForBlock(specBlockId);
  
  return [
    { 
      key: 'item_id', 
      title: 'انتخاب محصول', 
      type: FieldType.RELATION, 
      relationConfig 
    },
    // اضافه کردن فیلدهای مشخصات
    ...specFields.map(f => ({
      key: f.key,
      title: f.labels.fa,
      type: f.type,
      dynamicOptionsCategory: (f as any).dynamicOptionsCategory,
      readonly: false
    })),
    { key: 'usage', title: usageTitle, type: FieldType.NUMBER },
    { key: 'unit', title: 'واحد', type: FieldType.TEXT, defaultValue: unitDefault },
    { key: 'buy_price', title: 'قیمت خرید', type: FieldType.PRICE },
    { key: 'total_price', title: 'جمع', type: FieldType.PRICE, readonly: true }
  ];
};

// ====== 3. تعریف بلوک‌های پایه ======
const BLOCKS = {
  baseInfo: { id: 'baseInfo', titles: { fa: 'اطلاعات پایه', en: 'Basic Info' }, icon: 'InfoCircleOutlined', order: 1, type: BlockType.FIELD_GROUP },
  
  leatherSpec: { 
    id: 'leatherSpec', titles: { fa: 'ویژگی های چرم', en: 'Leather Specs' }, icon: 'SkinOutlined', order: 5, type: BlockType.FIELD_GROUP,
    visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' }
  },
  
  liningSpec: { 
    id: 'liningSpec', titles: { fa: 'ویژگی های آستر', en: 'Lining Specs' }, icon: 'BgColorsOutlined', order: 6, type: BlockType.FIELD_GROUP,
    visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'lining' }
  },
  
  kharjkarSpec: { 
    id: 'kharjkarSpec', titles: { fa: 'ویژگی های خرجکار', en: 'Accessory Specs' }, icon: 'ScissorOutlined', order: 7, type: BlockType.FIELD_GROUP,
    visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'accessory' }
  },
  
  yaraghSpec: { 
    id: 'yaraghSpec', titles: { fa: 'ویژگی های یراق', en: 'Fittings Specs' }, icon: 'ToolOutlined', order: 8, type: BlockType.FIELD_GROUP,
    visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'fitting' }
  },

  // بلوک‌های جدول (BOM-like) - با ستون‌های دینامیک
  items_leather: { 
    id: 'items_leather', 
    titles: { fa: 'مواد اولیه چرم', en: 'Leather Materials' }, 
    icon: 'SkinOutlined', 
    order: 10, 
    type: BlockType.TABLE,
    tableColumns: createBomTableColumns(
      { targetModule: 'products', targetField: 'name', filter: { category: 'leather' } },
      'leatherSpec',
      'مقدار مصرف',
      'فوت'
    )
  },

  items_lining: { 
    id: 'items_lining', 
    titles: { fa: 'مواد اولیه آستر', en: 'Lining Materials' }, 
    icon: 'BgColorsOutlined', 
    order: 11, 
    type: BlockType.TABLE,
    tableColumns: createBomTableColumns(
      { targetModule: 'products', targetField: 'name', filter: { category: 'lining' } },
      'liningSpec',
      'مقدار مصرف',
      'متر'
    )
  },

  items_fitting: { 
    id: 'items_fitting', 
    titles: { fa: 'مواد اولیه یراق', en: 'Fitting Materials' }, 
    icon: 'ToolOutlined', 
    order: 12, 
    type: BlockType.TABLE,
    tableColumns: createBomTableColumns(
      { targetModule: 'products', targetField: 'name', filter: { category: 'fitting' } },
      'yaraghSpec',
      'تعداد',
      ''
    )
  },

  items_accessory: { 
    id: 'items_accessory', 
    titles: { fa: 'مواد اولیه خرجکار', en: 'Accessory Materials' }, 
    icon: 'ScissorOutlined', 
    order: 13, 
    type: BlockType.TABLE,
    tableColumns: createBomTableColumns(
      { targetModule: 'products', targetField: 'name', filter: { category: 'accessory' } },
      'kharjkarSpec',
      'تعداد',
      ''
    )
  },
};

// ====== 4. تعریف ماژول ======
export const productsConfig: ModuleDefinition = {
    id: 'products',
    titles: { fa: 'محصولات', en: 'Products' },
    nature: ModuleNature.PRODUCT,
    table: 'products',
    supportedViewModes: [ViewMode.LIST, ViewMode.GRID],
    defaultViewMode: ViewMode.LIST,
    fields: fieldsArray,
    blocks: [
      BLOCKS.baseInfo, 
      { 
        ...BLOCKS.leatherSpec, 
        visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } 
      }, 
      { 
        ...BLOCKS.liningSpec, 
        visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'lining' } 
      }, 
      { 
        ...BLOCKS.kharjkarSpec, 
        visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'accessory' } 
      }, 
      { 
        ...BLOCKS.yaraghSpec, 
        visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'fitting' } 
      },
      
      { 
        ...BLOCKS.items_leather,
        visibleIf: { field: 'product_type', operator: LogicOperator.NOT_EQUALS, value: 'raw' }
      },
      { 
        ...BLOCKS.items_lining,
        visibleIf: { field: 'product_type', operator: LogicOperator.NOT_EQUALS, value: 'raw' }
      },
      { 
        ...BLOCKS.items_fitting,
        visibleIf: { field: 'product_type', operator: LogicOperator.NOT_EQUALS, value: 'raw' }
      },
      { 
        ...BLOCKS.items_accessory,
        visibleIf: { field: 'product_type', operator: LogicOperator.NOT_EQUALS, value: 'raw' }
      }
    ], 
    relatedTabs: []
};
