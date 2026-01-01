import { 
  ModuleDefinition, 
  ModuleNature, 
  ViewMode, 
  FieldType, 
  FieldNature, 
  FieldLocation,
  RelatedDisplayMode,
  UserRole,
  LogicOperator,
  BlockType
} from './types';

// --- SHARED BLOCKS ---
const BLOCKS = {
  general: { id: 'general', titles: { fa: 'اطلاعات عمومی', en: 'General Info' }, icon: 'InfoCircleOutlined', order: 1, type: BlockType.FIELD_GROUP },
  specs: { id: 'specs', titles: { fa: 'مشخصات فنی', en: 'Technical Specs' }, icon: 'TagOutlined', order: 2, type: BlockType.FIELD_GROUP },
  contact: { id: 'contact', titles: { fa: 'اطلاعات تماس', en: 'Contact Info' }, icon: 'PhoneOutlined', order: 2, type: BlockType.FIELD_GROUP },
  inventory: { id: 'inventory', titles: { fa: 'موجودی و انبار', en: 'Inventory' }, icon: 'GoldOutlined', order: 3, type: BlockType.FIELD_GROUP },
  pricing: { id: 'pricing', titles: { fa: 'قیمت‌گذاری', en: 'Pricing' }, icon: 'DollarOutlined', order: 4, type: BlockType.FIELD_GROUP },
  items: { id: 'items', titles: { fa: 'اقلام', en: 'Items' }, icon: 'UnorderedListOutlined', order: 5, type: BlockType.FIELD_GROUP },
  finance: { id: 'finance', titles: { fa: 'اطلاعات مالی', en: 'Financial' }, icon: 'BankOutlined', order: 6, type: BlockType.FIELD_GROUP },
  
  // New Table Block for BOMs
  bomItems: { 
    id: 'bomItems', 
    titles: { fa: 'لیست مواد اولیه و قطعات', en: 'Materials List' }, 
    icon: 'UnorderedListOutlined', 
    order: 10, 
    type: BlockType.TABLE,
    tableColumns: [
        { key: 'product_name', title: 'نام کالا / ماده', type: FieldType.RELATION, width: 200, relationConfig: { targetModule: 'products', targetField: 'name' } },
        { key: 'length', title: 'طول (cm)', type: FieldType.NUMBER, width: 80 },
        { key: 'width', title: 'عرض (cm)', type: FieldType.NUMBER, width: 80 },
        { key: 'count', title: 'تعداد', type: FieldType.NUMBER, width: 80 },
        { key: 'consumption', title: 'مصرف کل', type: FieldType.NUMBER, width: 100 },
        { key: 'waste', title: 'نرخ پرت', type: FieldType.PERCENTAGE, width: 80 },
    ]
  },
  
  // Table Block for Production Order Consumables
  productionItems: {
    id: 'productionItems',
    titles: { fa: 'لیست مواد و قطعات تولید', en: 'Production Items' },
    icon: 'ExperimentOutlined',
    order: 10,
    type: BlockType.TABLE,
    tableColumns: [
        { key: 'product_name', title: 'نام محصول/ماده', type: FieldType.RELATION, width: 200, relationConfig: { targetModule: 'products', targetField: 'name' } },
        { key: 'qty', title: 'تعداد', type: FieldType.NUMBER, width: 80 },
        { key: 'category', title: 'دسته‌بندی', type: FieldType.TEXT, width: 120 },
        { key: 'length', title: 'طول (cm)', type: FieldType.NUMBER, width: 90 },
        { key: 'width', title: 'عرض (cm)', type: FieldType.NUMBER, width: 90 },
        { key: 'area', title: 'مساحت (dm²)', type: FieldType.NUMBER, width: 100 },
        { key: 'consumption', title: 'میزان استفاده', type: FieldType.NUMBER, width: 110 },
        { key: 'waste', title: 'نرخ پرت (%)', type: FieldType.PERCENTAGE, width: 90 },
    ]
  }
};

// --- PRODUCT FIELDS ---
// اصلاح ترتیب (Order) برای نمایش درست در جدول راست‌چین
const PRODUCT_FIELDS: any[] = [
  // Header
  { key: 'image_url', labels: { fa: 'تصویر محصول', en: 'Image' }, type: FieldType.IMAGE, nature: FieldNature.PREDEFINED, location: FieldLocation.HEADER, order: 0, isKey: false },
  // Order 1: نام محصول (سمت راست‌ترین)
  { key: 'name', labels: { fa: 'نام محصول', en: 'Name' }, type: FieldType.TEXT, nature: FieldNature.PREDEFINED, location: FieldLocation.HEADER, order: 1, isKey: true, validation: { required: true } },
  // Order 2: کد کالا
  { key: 'custom_code', labels: { fa: 'کد دستی (اختیاری)', en: 'Custom Code' }, type: FieldType.TEXT, nature: FieldNature.STANDARD, location: FieldLocation.HEADER, order: 3, isKey: true },  { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'System Code' }, type: FieldType.TEXT, nature: FieldNature.STANDARD, location: FieldLocation.HEADER, order: 2, isKey: true, readonly: true },
  // Order 3, 4: قیمت و موجودی
  { key: 'sell_price', labels: { fa: 'قیمت فروش', en: 'Sell Price' }, type: FieldType.PRICE, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'pricing', order: 3, isKey: true },
  { key: 'stock', labels: { fa: 'موجودی', en: 'Stock' }, type: FieldType.STOCK, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'inventory', order: 4, isKey: true },

  // Order 5, 6: وضعیت و دسته‌بندی
  { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, nature: FieldNature.PREDEFINED, location: FieldLocation.HEADER, order: 5, isKey: true, options: [{label: 'فعال', value: 'active', color: 'green'}, {label: 'پیش‌نویس', value: 'draft', color: 'orange'}] },
  { key: 'category', labels: { fa: 'دسته‌بندی', en: 'Category' }, type: FieldType.SELECT, nature: FieldNature.PREDEFINED, location: FieldLocation.HEADER, order: 6, isKey: true, options: [{ label: 'کیف اداری', value: 'کیف اداری' }, { label: 'کیف پول', value: 'کیف پول' }, { label: 'کفش', value: 'کفش' }, { label: 'چرم', value: 'leather' }] },
  
  // سایر فیلدها که در جدول اصلی نیستند (Order مهم نیست)
  { key: 'product_type', labels: { fa: 'نوع محصول', en: 'Type' }, type: FieldType.SELECT, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'specs', order: 10, isKey: false, options: [{label: 'مواد اولیه', value: 'raw'}, {label: 'محصول نهایی', value: 'final'}] },
  { key: 'supplier_id', labels: { fa: 'تامین کننده', en: 'Supplier' }, type: FieldType.RELATION, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'specs', order: 11, isKey: false, relationConfig: { targetModule: 'suppliers', targetField: 'business_name' } },
  { key: 'main_unit', labels: { fa: 'واحد اصلی', en: 'Unit' }, type: FieldType.SELECT, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'specs', order: 12, isKey: false, options: [{label: 'عدد', value: 'pcs'}, {label: 'متر', value: 'meter'}, {label: 'فوت', value: 'ft'}] },
  { key: 'reorder_point', labels: { fa: 'نقطه سفارش', en: 'Reorder Point' }, type: FieldType.NUMBER, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'inventory', order: 13, isKey: false },
  { key: 'buy_price', labels: { fa: 'قیمت خرید', en: 'Buy Price' }, type: FieldType.PRICE, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'pricing', order: 14, isKey: false },
];

// --- SUPPLIER FIELDS ---
const SUPPLIER_FIELDS: any[] = [
  { key: 'business_name', labels: { fa: 'نام کسب و کار', en: 'Business Name' }, type: FieldType.TEXT, nature: FieldNature.PREDEFINED, location: FieldLocation.HEADER, order: 1, isKey: true },
  { key: 'rating', labels: { fa: 'رتبه', en: 'Rating' }, type: FieldType.NUMBER, nature: FieldNature.STANDARD, location: FieldLocation.HEADER, order: 2, isKey: true },
  
  { key: 'first_name', labels: { fa: 'نام', en: 'First Name' }, type: FieldType.TEXT, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'contact', order: 1, isKey: false },
  { key: 'last_name', labels: { fa: 'نام خانوادگی', en: 'Last Name' }, type: FieldType.TEXT, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'contact', order: 2, isKey: false },
  { key: 'mobile_1', labels: { fa: 'موبایل ۱', en: 'Mobile 1' }, type: FieldType.PHONE, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'contact', order: 3, isKey: true },
  { key: 'city', labels: { fa: 'شهر', en: 'City' }, type: FieldType.TEXT, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'contact', order: 4, isKey: false },
];

// --- INVOICE FIELDS ---
const INVOICE_FIELDS: any[] = [
  { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, nature: FieldNature.PREDEFINED, location: FieldLocation.HEADER, order: 1, isKey: true, options: [{label: 'پرداخت شده', value: 'paid', color: 'green'}, {label: 'انتظار پرداخت', value: 'pending', color: 'orange'}] },
  { key: 'invoice_type', labels: { fa: 'نوع فاکتور', en: 'Type' }, type: FieldType.SELECT, nature: FieldNature.PREDEFINED, location: FieldLocation.HEADER, order: 2, isKey: true, options: [{label: 'فاکتور فروش', value: 'final'}, {label: 'پیش فاکتور', value: 'proforma'}] },
  { key: 'customer_id', labels: { fa: 'مشتری', en: 'Customer' }, type: FieldType.RELATION, nature: FieldNature.STANDARD, location: FieldLocation.HEADER, order: 3, isKey: true, relationConfig: {targetModule: 'customers', targetField: 'business_name'} },
  
  { key: 'total_amount', labels: { fa: 'مبلغ کل', en: 'Total' }, type: FieldType.PRICE, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'finance', order: 1, isKey: true },
  { key: 'final_payable', labels: { fa: 'قابل پرداخت', en: 'Payable' }, type: FieldType.PRICE, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'finance', order: 2, isKey: true },
  { key: 'financial_approval', labels: { fa: 'تایید مالی', en: 'Approved' }, type: FieldType.CHECKBOX, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'finance', order: 3, isKey: false },
];

// --- BOM FIELDS ---
const BOM_FIELDS: any[] = [
    { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, nature: FieldNature.PREDEFINED, location: FieldLocation.HEADER, order: 1, isKey: true, options: [{label: 'تایید شده', value: 'approved', color: 'green'}, {label: 'پیش‌نویس', value: 'draft', color: 'orange'}] },
    { key: 'name', labels: { fa: 'نام شناسنامه', en: 'BOM Name' }, type: FieldType.TEXT, nature: FieldNature.PREDEFINED, location: FieldLocation.HEADER, order: 2, isKey: true },
    { key: 'custom_code', labels: { fa: 'کد BOM', en: 'Code' }, type: FieldType.TEXT, nature: FieldNature.STANDARD, location: FieldLocation.HEADER, order: 3, isKey: true },
    { key: 'product_id', labels: { fa: 'محصول نهایی', en: 'Final Product' }, type: FieldType.RELATION, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'general', order: 1, isKey: false, relationConfig: { targetModule: 'products', targetField: 'name' } },
];

// --- PRODUCTION ORDER FIELDS ---
const PRODUCTION_FIELDS: any[] = [
  { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, nature: FieldNature.PREDEFINED, location: FieldLocation.HEADER, order: 1, isKey: true, options: [{label: 'برنامه‌ریزی شده', value: 'planned', color: 'blue'}, {label: 'در حال تولید', value: 'in_progress', color: 'orange'}, {label: 'تکمیل شده', value: 'completed', color: 'green'}] },
  { key: 'name', labels: { fa: 'عنوان سفارش', en: 'Order Title' }, type: FieldType.TEXT, nature: FieldNature.PREDEFINED, location: FieldLocation.HEADER, order: 2, isKey: true },
  { key: 'order_code', labels: { fa: 'شماره سفارش', en: 'Order No' }, type: FieldType.TEXT, nature: FieldNature.STANDARD, location: FieldLocation.HEADER, order: 3, isKey: true },
  
  { key: 'product_id', labels: { fa: 'محصول تولیدی', en: 'Product' }, type: FieldType.RELATION, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'general', order: 1, isKey: true, relationConfig: { targetModule: 'products', targetField: 'name' } },
  { key: 'qty', labels: { fa: 'تعداد تولید', en: 'Quantity' }, type: FieldType.NUMBER, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'general', order: 2, isKey: true },
  { key: 'start_date', labels: { fa: 'تاریخ شروع', en: 'Start Date' }, type: FieldType.DATE, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'general', order: 3, isKey: false },
  { key: 'due_date', labels: { fa: 'تاریخ تحویل', en: 'Due Date' }, type: FieldType.DATE, nature: FieldNature.STANDARD, location: FieldLocation.BLOCK, blockId: 'general', order: 4, isKey: false },
];

export const MODULES: Record<string, ModuleDefinition> = {
  products: {
    id: 'products',
    titles: { fa: 'محصولات', en: 'Products' },
    nature: ModuleNature.PRODUCT,
    supportedViewModes: [ViewMode.LIST, ViewMode.GRID],
    defaultViewMode: ViewMode.GRID,
    blocks: [BLOCKS.specs, BLOCKS.inventory, BLOCKS.pricing],
    fields: PRODUCT_FIELDS,
    relatedTabs: []
  },
  suppliers: {
    id: 'suppliers',
    titles: { fa: 'تامین کنندگان', en: 'Suppliers' },
    nature: ModuleNature.CRM,
    supportedViewModes: [ViewMode.LIST],
    defaultViewMode: ViewMode.LIST,
    blocks: [BLOCKS.contact, BLOCKS.finance],
    fields: SUPPLIER_FIELDS,
    relatedTabs: [{sourceModule: 'products', displayMode: RelatedDisplayMode.GRID, label: 'محصولات'}]
  },
  invoices: {
    id: 'invoices',
    titles: { fa: 'فاکتورها', en: 'Invoices' },
    nature: ModuleNature.INVOICE,
    supportedViewModes: [ViewMode.LIST],
    defaultViewMode: ViewMode.LIST,
    blocks: [BLOCKS.finance],
    fields: INVOICE_FIELDS,
    relatedTabs: []
  },
  warehouses: {
    id: 'warehouses',
    titles: { fa: 'انبارها', en: 'Warehouses' },
    nature: ModuleNature.WAREHOUSE,
    supportedViewModes: [ViewMode.LIST],
    defaultViewMode: ViewMode.LIST,
    blocks: [BLOCKS.general],
    fields: [{key: 'name', labels: {fa:'نام انبار', en:'Name'}, type: FieldType.TEXT, nature: FieldNature.PREDEFINED, location: FieldLocation.HEADER, order: 1, isKey: true}],
    relatedTabs: []
  },
  tasks: {
      id: 'tasks',
      titles: { fa: 'وظایف', en: 'Tasks' },
      nature: ModuleNature.STANDARD,
      supportedViewModes: [ViewMode.LIST, ViewMode.KANBAN],
      defaultViewMode: ViewMode.LIST,
      blocks: [BLOCKS.general],
      fields: [{key: 'name', labels: {fa:'عنوان وظیفه', en:'Title'}, type: FieldType.TEXT, nature: FieldNature.PREDEFINED, location: FieldLocation.HEADER, order: 1, isKey: true}],
  },
  boms: {
      id: 'boms',
      titles: { fa: 'شناسنامه‌های تولید', en: 'BOMs' },
      nature: ModuleNature.PRODUCTION,
      supportedViewModes: [ViewMode.LIST],
      defaultViewMode: ViewMode.LIST,
      blocks: [BLOCKS.general, BLOCKS.bomItems],
      fields: BOM_FIELDS
  },
  production: {
    id: 'production',
    titles: { fa: 'سفارشات تولید', en: 'Production Orders' },
    nature: ModuleNature.PRODUCTION,
    supportedViewModes: [ViewMode.LIST],
    defaultViewMode: ViewMode.LIST,
    blocks: [BLOCKS.general, BLOCKS.productionItems],
    fields: PRODUCTION_FIELDS
  }
};