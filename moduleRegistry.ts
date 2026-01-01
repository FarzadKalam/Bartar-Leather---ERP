import { 
  ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldNature, FieldLocation, BlockType, LogicOperator
} from './types';

// --- BLOCKS DEFINITION ---
const BLOCKS = {
  baseInfo: { id: 'baseInfo', titles: { fa: 'اطلاعات پایه', en: 'Basic Info' }, icon: 'InfoCircleOutlined', order: 1, type: BlockType.FIELD_GROUP },
  
  // بلاک‌های شرطی مواد اولیه
  leatherSpec: { 
    id: 'leatherSpec', titles: { fa: 'مشخصات چرم', en: 'Leather Specs' }, icon: 'SkinOutlined', order: 2, type: BlockType.FIELD_GROUP,
    // شرط نمایش بلاک: فقط وقتی دسته بندی چرم است
    visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' }
  },
  liningSpec: { 
    id: 'liningSpec', titles: { fa: 'مشخصات آستر', en: 'Lining Specs' }, icon: 'BgColorsOutlined', order: 3, type: BlockType.FIELD_GROUP,
    visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'lining' }
  },
  kharjkarSpec: { 
    id: 'kharjkarSpec', titles: { fa: 'مشخصات خرجکار', en: 'Accessory Specs' }, icon: 'ScissorOutlined', order: 4, type: BlockType.FIELD_GROUP,
    visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'accessory' }
  },
  yaraghSpec: { 
    id: 'yaraghSpec', titles: { fa: 'مشخصات یراق', en: 'Fittings Specs' }, icon: 'ToolOutlined', order: 5, type: BlockType.FIELD_GROUP,
    visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'fitting' }
  },
  
  // بلاک‌های لیستی (BOM)
  bundleItems: { id: 'bundleItems', titles: { fa: 'اقلام بسته', en: 'Bundle Items' }, icon: 'DropboxOutlined', order: 6, type: BlockType.TABLE },
  finalProductBOM: { id: 'finalProductBOM', titles: { fa: 'فرمول ساخت (BOM)', en: 'Production Recipe' }, icon: 'ExperimentOutlined', order: 7, type: BlockType.TABLE },
};

const PRODUCT_FIELDS: any[] = [
  // --- Header Fields ---
  { key: 'image_url', labels: { fa: 'تصویر', en: 'Image' }, type: FieldType.IMAGE, location: FieldLocation.HEADER, order: 0 },
  { key: 'name', labels: { fa: 'نام محصول', en: 'Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, validation: { required: true } },
  { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true },
  
  // *** فیلد فراموش شده وضعیت ***
  { 
    key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 3, 
    options: [{label:'فعال', value:'active', color:'green'}, {label:'پیش‌نویس', value:'draft', color:'orange'}],
    defaultValue: 'active'
  },

  // --- فیلدهای مهم ---
  { 
    key: 'product_type', 
    labels: { fa: 'نوع محصول', en: 'Product Type' }, 
    type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 1,
    options: [
      { label: 'مواد اولیه', value: 'raw' },
      { label: 'بسته نیمه آماده', value: 'semi' },
      { label: 'محصول نهایی', value: 'final' }
    ],
    validation: { required: true }
  },
  { 
    key: 'category', 
    labels: { fa: 'دسته بندی ', en: 'Category' }, 
    type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 2,
    options: [
       { label: 'چرم', value: 'leather' },
       { label: 'آستر', value: 'lining' },
       { label: 'فوم', value: 'foam' },
       { label: 'خرجکار', value: 'accessory' },
       { label: 'یراق', value: 'fitting' },
       { label: 'کیف پول', value: 'wallet' },
       { label: 'کیف اداری', value: 'office_bag' },
    ],
    // نکته: این فیلد همیشه هست، اما مقادیرش بسته به نوع محصول معنا پیدا میکنه
    // فعلا شرط نمایش نمیذاریم تا کاربر بتونه انتخاب کنه
  },
  { key: 'calculation_method', labels: { fa: 'روش محاسبه', en: 'Calc Method' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 3, options: [{label:'متراژ', value:'area'}, {label:'تعدادی', value:'count'}] },
  { key: 'waste_rate', labels: { fa: 'نرخ پرت (%)', en: 'Waste Rate' }, type: FieldType.PERCENTAGE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 4 },
  { key: 'stock', labels: { fa: 'موجودی فعلی', en: 'Stock' }, type: FieldType.STOCK, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 5 },
  { key: 'sell_price', labels: { fa: 'قیمت فروش', en: 'Sell Price' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 6 },


  // --- فیلدهای اختصاصی چرم ---
  { 
    key: 'leather_type', labels: { fa: 'نوع چرم', en: 'Leather Type' }, type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 1,
    options: [{label:'گاوی', value:'cow'}, {label:'بزی', value:'goat'}, {label:'گوسفندی', value:'sheep'}, {label:'شتری', value:'camel'}, {label:'اشپالت', value:'split'}],
    logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } }
  },
  { 
    key: 'leather_color_1', labels: { fa: 'رنگ چرم ۱', en: 'Color 1' }, type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 2,
    dynamicOptionsCategory: 'leather_color', 
    logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } }
  },
  { 
    key: 'leather_color_2', labels: { fa: 'رنگ چرم ۲', en: 'Color 2' }, type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 2,
    dynamicOptionsCategory: 'leather_color', 
    logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } }
  },
  { 
    key: 'leather_finish_1', labels: { fa: 'صفحه چرم ۱ ', en: 'Finish 1' }, type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 3,
    dynamicOptionsCategory: 'leather_finish',
    logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } }
  },
  { 
    key: 'leather_finish_2', labels: { fa: 'صفحه چرم ۲ ', en: 'Finish 2' }, type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 3,
    dynamicOptionsCategory: 'leather_finish',
    logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } }
  },
  { 
    key: 'leather_sort', labels: { fa: 'سورت چرم', en: 'Sort' }, type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 4,
    dynamicOptionsCategory: 'leather_sort',
    logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } }
  },

  // --- فیلدهای آستر ---
  { 
    key: 'lining_material', labels: { fa: 'جنس آستر', en: 'Material' }, type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, blockId: 'liningSpec', order: 1,
    dynamicOptionsCategory: 'lining_material',
    logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'lining' } }
  },
  { 
    key: 'lining_color', labels: { fa: 'رنگ آستر', en: 'Color' }, type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, blockId: 'liningSpec', order: 2,
    dynamicOptionsCategory: 'general_color',
    logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'lining' } }
  },
  { 
    key: 'lining_width', labels: { fa: 'عرض آستر', en: 'Width' }, type: FieldType.NUMBER, 
    location: FieldLocation.BLOCK, blockId: 'liningSpec', order: 3,
    logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'lining' } }
  },
 { 
    key: 'lining_length', labels: { fa: 'طول آستر', en: 'Length' }, type: FieldType.NUMBER, 
    location: FieldLocation.BLOCK, blockId: 'liningSpec', order: 4,
    logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'lining' } }
  },

  // --- فیلدهای خرجکار ---
  { 
    key: 'acc_material', labels: { fa: 'جنس خرجکار', en: 'Material' }, type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, blockId: 'kharjkarSpec', order: 1,
    dynamicOptionsCategory: 'acc_material',
    logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'accessory' } }
  },
  { 
    key: 'acc_color', labels: { fa: 'رنگ خرجکار', en: 'Color' }, type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, blockId: 'kharjkarSpec', order: 2,
    dynamicOptionsCategory: 'general_color',
    logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'accessory' } }
  },
  { 
    key: 'acc_width', labels: { fa: 'عرض خرجکار', en: 'Width' }, type: FieldType.NUMBER, 
    location: FieldLocation.BLOCK, blockId: 'kharjkarSpec', order: 3,
    logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'accessory' } }
  },
 { 
    key: 'acc_length', labels: { fa: 'طول خرجکار', en: 'Length' }, type: FieldType.NUMBER, 
    location: FieldLocation.BLOCK, blockId: 'kharjkarSpec', order: 4,
    logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'accessory' } }
  },
  
  // --- فیلدهای یراق ---
  { 
    key: 'fitting_type', labels: { fa: 'جنس/نوع یراق', en: 'Type' }, type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, blockId: 'yaraghSpec', order: 1,
    dynamicOptionsCategory: 'fitting_type',
    logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'fitting' } }
  },
  { 
    key: 'fitting_color', labels: { fa: 'رنگ یراق', en: 'Color' }, type: FieldType.SELECT, 
    location: FieldLocation.BLOCK, blockId: 'yaraghSpec', order: 1,
    dynamicOptionsCategory: 'fitting_color',
    logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'fitting' } }
  },
  { 
    key: 'fitting_size', labels: { fa: 'سایز یراق', en: 'Size' }, type: FieldType.TEXT, 
    location: FieldLocation.BLOCK, blockId: 'yaraghSpec', order: 2,
    logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'fitting' } }
  },
];

export const MODULES: Record<string, ModuleDefinition> = {
  products: {
    id: 'products',
    titles: { fa: 'محصولات', en: 'Products' },
    nature: ModuleNature.PRODUCT,
    supportedViewModes: [ViewMode.LIST, ViewMode.GRID],
    defaultViewMode: ViewMode.GRID,
    fields: PRODUCT_FIELDS,
    blocks: [
      BLOCKS.baseInfo, 
      BLOCKS.leatherSpec, 
      BLOCKS.liningSpec, 
      BLOCKS.kharjkarSpec, 
      BLOCKS.yaraghSpec,
      { 
          ...BLOCKS.bundleItems, 
          visibleIf: { field: 'product_type', operator: LogicOperator.EQUALS, value: 'semi' },
          tableColumns: [
              { key: 'item_id', title: 'نام کالا', type: FieldType.RELATION, relationConfig: { targetModule: 'products', targetField: 'name' } },
              { key: 'qty', title: 'تعداد', type: FieldType.NUMBER },
          ]
      },
      { 
          ...BLOCKS.finalProductBOM, 
          visibleIf: { field: 'product_type', operator: LogicOperator.EQUALS, value: 'final' },
          tableColumns: [
              { key: 'raw_material_id', title: 'ماده اولیه / قطعه', type: FieldType.RELATION, relationConfig: { targetModule: 'products', targetField: 'name' } },
              { key: 'consumption', title: 'مقدار مصرف', type: FieldType.NUMBER },
              { key: 'unit', title: 'واحد', type: FieldType.TEXT },
          ]
      }
    ], 
    relatedTabs: []
  },
  // بقیه ماژول‌ها بدون تغییر...
  suppliers: { id: 'suppliers', titles: { fa: 'تامین کنندگان', en: 'Suppliers' }, nature: ModuleNature.CRM, supportedViewModes: [ViewMode.LIST], defaultViewMode: ViewMode.LIST, blocks: [], fields: [], relatedTabs: [] },
};