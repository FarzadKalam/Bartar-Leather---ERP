import { ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldLocation, BlockType, LogicOperator, FieldNature } from '../types';

// تعریف بلاک‌های محصولات
const BLOCKS = {
  baseInfo: { id: 'baseInfo', titles: { fa: 'اطلاعات پایه', en: 'Basic Info' }, icon: 'InfoCircleOutlined', order: 1, type: BlockType.FIELD_GROUP },
  leatherSpec: { 
    id: 'leatherSpec', titles: { fa: 'مشخصات چرم', en: 'Leather Specs' }, icon: 'SkinOutlined', order: 2, type: BlockType.FIELD_GROUP,
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
  bundleItems: { id: 'bundleItems', titles: { fa: 'اقلام بسته', en: 'Bundle Items' }, icon: 'DropboxOutlined', order: 6, type: BlockType.TABLE },
  finalProductBOM: { id: 'finalProductBOM', titles: { fa: 'فرمول ساخت (BOM)', en: 'Production Recipe' }, icon: 'ExperimentOutlined', order: 7, type: BlockType.TABLE },
};

// اکسپورت ماژول محصولات
export const productsModule: ModuleDefinition = {
    id: 'products',
    titles: { fa: 'محصولات', en: 'Products' },
    nature: ModuleNature.PRODUCT,
    supportedViewModes: [ViewMode.LIST, ViewMode.GRID],
    defaultViewMode: ViewMode.GRID,
    fields: [
      {
        key: 'image_url', labels: { fa: 'تصویر', en: 'Image' }, type: FieldType.IMAGE, location: FieldLocation.HEADER, order: 0,
        nature: FieldNature.PREDEFINED,
        isKey: false
      },
      {
        key: 'name', labels: { fa: 'نام محصول', en: 'Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, validation: { required: true },
        nature: FieldNature.PREDEFINED,
        isKey: false
      },
      { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true },
      { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 3, options: [{label:'فعال', value:'active', color:'green'}, {label:'پیش‌نویس', value:'draft', color:'orange'}], defaultValue: 'active' },
      {
        key: 'production_bom_id',
        labels: { fa: 'شناسنامه تولید (BOM)', en: 'Production BOM' },
        type: FieldType.RELATION,
        location: FieldLocation.BLOCK,
        blockId: 'baseInfo',
        order: 0,
        relationConfig: { targetModule: 'production_boms', targetField: 'name' },
        nature: FieldNature.PREDEFINED,
        isKey: false,
        logic: { visibleIf: { field: 'product_type', operator: LogicOperator.EQUALS, value: 'semi' } }
      },
      
      {
        key: 'product_type', labels: { fa: 'نوع محصول', en: 'Product Type' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 1, options: [{ label: 'مواد اولیه', value: 'raw' }, { label: 'بسته نیمه آماده', value: 'semi' }, { label: 'محصول نهایی', value: 'final' }], validation: { required: true },
        nature: FieldNature.PREDEFINED,
        isKey: false
      },
      {
        key: 'category', labels: { fa: 'دسته بندی', en: 'Category' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 2, options: [{ label: 'چرم', value: 'leather' }, { label: 'آستر', value: 'lining' }, { label: 'فوم', value: 'foam' }, { label: 'خرجکار', value: 'accessory' }, { label: 'یراق', value: 'fitting' }, { label: 'کیف پول', value: 'wallet' }, { label: 'کیف اداری', value: 'office_bag' }],
        nature: FieldNature.PREDEFINED,
        isKey: false
      },
      {
        key: 'calculation_method', labels: { fa: 'روش محاسبه', en: 'Calc Method' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 3, options: [{ label: 'متراژ', value: 'area' }, { label: 'تعدادی', value: 'count' }],
        nature: FieldNature.PREDEFINED,
        isKey: false
      },
      {
        key: 'waste_rate', labels: { fa: 'نرخ پرت (%)', en: 'Waste Rate' }, type: FieldType.PERCENTAGE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 4,
        nature: FieldNature.PREDEFINED,
        isKey: false
      },
      {
        key: 'stock', labels: { fa: 'موجودی فعلی', en: 'Stock' }, type: FieldType.STOCK, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 5,
        nature: FieldNature.PREDEFINED,
        isKey: false
      },
      {
        key: 'buy_price', labels: { fa: 'قیمت خرید', en: 'Buy Price' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 6,
        nature: FieldNature.PREDEFINED,
        isKey: false
      },
      {
        key: 'sell_price', labels: { fa: 'قیمت فروش', en: 'Sell Price' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 7,
        nature: FieldNature.PREDEFINED,
        isKey: false
      },

      // فیلدهای اختصاصی
      {
        key: 'leather_type', labels: { fa: 'نوع چرم', en: 'Leather Type' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 1, options: [{ label: 'گاوی', value: 'cow' }, { label: 'بزی', value: 'goat' }, { label: 'گوسفندی', value: 'sheep' }, { label: 'شتری', value: 'camel' }, { label: 'اشپالت', value: 'split' }], logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } },
        nature: FieldNature.PREDEFINED,
        isKey: false
      },
      { key: 'leather_color_1', labels: { fa: 'رنگ چرم ۱', en: 'Color 1' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 2, dynamicOptionsCategory: 'leather_color', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } } },
      { key: 'leather_color_2', labels: { fa: 'رنگ چرم ۲', en: 'Color 2' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 3, dynamicOptionsCategory: 'leather_color', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } } },
      { key: 'leather_finish_1', labels: { fa: 'صفحه چرم  ۱', en: 'Finish 1' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 4, dynamicOptionsCategory: 'leather_finish', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } } },
      { key: 'leather_finish_2', labels: { fa: 'صفحه چرم ۲', en: 'Finish 2' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 5, dynamicOptionsCategory: 'leather_finish', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } } },

      { key: 'leather_sort', labels: { fa: 'سورت چرم', en: 'Sort' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'leatherSpec', order: 6, dynamicOptionsCategory: 'leather_sort', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'leather' } } },
      
      { key: 'lining_material', labels: { fa: 'جنس آستر', en: 'Material' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'liningSpec', order: 1, dynamicOptionsCategory: 'lining_material', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'lining' } } },
      { key: 'lining_color', labels: { fa: 'رنگ آستر', en: 'Color' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'liningSpec', order: 2, dynamicOptionsCategory: 'general_color', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'lining' } } },
      
      { key: 'acc_material', labels: { fa: 'جنس خرجکار', en: 'Material' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'kharjkarSpec', order: 1, dynamicOptionsCategory: 'acc_material', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'accessory' } } },
      
      { key: 'fitting_type', labels: { fa: 'جنس/نوع یراق', en: 'Type' }, type: FieldType.SELECT, location: FieldLocation.BLOCK, blockId: 'yaraghSpec', order: 1, dynamicOptionsCategory: 'fitting_type', logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'fitting' } } },
      {
        key: 'fitting_size', labels: { fa: 'سایز یراق', en: 'Size' }, type: FieldType.TEXT, location: FieldLocation.BLOCK, blockId: 'yaraghSpec', order: 2, logic: { visibleIf: { field: 'category', operator: LogicOperator.EQUALS, value: 'fitting' } },
        nature: FieldNature.PREDEFINED,
        isKey: false
      },
    ],
    blocks: [
      BLOCKS.baseInfo, BLOCKS.leatherSpec, BLOCKS.liningSpec, BLOCKS.kharjkarSpec, BLOCKS.yaraghSpec,
      { ...BLOCKS.bundleItems, visibleIf: { field: 'product_type', operator: LogicOperator.EQUALS, value: 'semi' }, tableColumns: [{ key: 'item_id', title: 'نام کالا', type: FieldType.RELATION, relationConfig: { targetModule: 'products', targetField: 'name' } }, { key: 'qty', title: 'تعداد', type: FieldType.NUMBER }] },
      { ...BLOCKS.finalProductBOM, visibleIf: { field: 'product_type', operator: LogicOperator.EQUALS, value: 'final' }, tableColumns: [{ key: 'raw_material_id', title: 'ماده اولیه / قطعه', type: FieldType.RELATION, relationConfig: { targetModule: 'products', targetField: 'name' } }, { key: 'consumption', title: 'مقدار مصرف', type: FieldType.NUMBER }, { key: 'unit', title: 'واحد', type: FieldType.TEXT }] }
    ], 
    relatedTabs: []
};