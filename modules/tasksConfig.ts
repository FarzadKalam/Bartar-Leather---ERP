import { ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldLocation, BlockType, FieldNature, LogicOperator } from '../types';

export const tasksModule: ModuleDefinition = {
  id: 'tasks',
  titles: { fa: 'وظایف', en: 'Tasks' },
  nature: ModuleNature.TASK,
  table: 'tasks',
  supportedViewModes: [ViewMode.KANBAN, ViewMode.LIST, ViewMode.GRID],
  defaultViewMode: ViewMode.KANBAN,
  
  fields: [
    // --- هدر (Header Fields) ---
    { key: 'name', labels: { fa: 'عنوان وظیفه', en: 'Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, validation: { required: true }, nature: FieldNature.PREDEFINED, isKey: true, isTableColumn: true },
    { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },
    { key: 'status', labels: { fa: 'وضعیت', en: 'Status' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 4, options: [{ label: 'انجام نشده', value: 'todo', color: 'red' }, { label: 'در حال انجام', value: 'in_progress', color: 'blue' }, { label: 'بازبینی', value: 'review', color: 'orange' }, { label: 'تکمیل شده', value: 'done', color: 'green' }, { label: 'لغو شده', value: 'canceled', color: 'gray' }], defaultValue: 'todo', nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'priority', labels: { fa: 'اولویت', en: 'Priority' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 5, options: [{ label: 'بسیار بالا', value: 'urgent', color: 'red' }, { label: 'بالا', value: 'high', color: 'orange' }, { label: 'متوسط', value: 'medium', color: 'blue' }, { label: 'پایین', value: 'low', color: 'gray' }], defaultValue: 'medium', nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'related_to_module', labels: { fa: 'مرتبط با بخش', en: 'Task Type' }, type: FieldType.SELECT, location: FieldLocation.HEADER, order: 6, options: [{ label: 'تولید', value: 'production_orders' }, { label: 'مشتریان', value: 'customers' }, { label: 'محصولات', value: 'products' }, { label: 'تامین کنندگان', value: 'suppliers' }, { label: 'فاکتورها', value: 'invoices' }], validation: { required: false }, nature: FieldNature.PREDEFINED, isTableColumn: true },
    { key: 'tags', labels: { fa: 'برچسب‌ها', en: 'Tags' }, type: FieldType.TAGS, location: FieldLocation.HEADER, order: 7, nature: FieldNature.STANDARD, isTableColumn: true },
    
    // --- اطلاعات عمومی ---
    { key: 'description', labels: { fa: 'توضیحات', en: 'Description' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'general', order: 1, nature: FieldNature.STANDARD },
    
    // --- زمان‌بندی ---
    { key: 'start_date', labels: { fa: 'تاریخ شروع', en: 'Start Date' }, type: FieldType.DATE, location: FieldLocation.BLOCK, blockId: 'scheduling', order: 4, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'due_date', labels: { fa: 'مهلت انجام', en: 'Due Date' }, type: FieldType.DATETIME, location: FieldLocation.BLOCK, blockId: 'scheduling', order: 2, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'estimated_hours', labels: { fa: 'ساعات تخمینی', en: 'Estimated Hours' }, type: FieldType.NUMBER, location: FieldLocation.BLOCK, blockId: 'scheduling', order: 3, nature: FieldNature.STANDARD },
    { key: 'spent_hours', labels: { fa: 'ساعات صرف شده', en: 'Spent Hours' }, type: FieldType.NUMBER, location: FieldLocation.BLOCK, blockId: 'scheduling', order: 4, readonly: true, nature: FieldNature.SYSTEM },
    { key: 'start_time', labels: { fa: 'زمان آغاز', en: 'Start Time' }, type: FieldType.TIME, location: FieldLocation.BLOCK, blockId: 'scheduling', order: 5, nature: FieldNature.STANDARD, isTableColumn: true },
    

    // --- ارتباطات ---
    { key: 'related_product', labels: { fa: 'محصول مرتبط', en: 'Related Product' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'general', order: 2, relationConfig: { targetModule: 'products', targetField: 'name' }, nature: FieldNature.STANDARD, logic: { visibleIf: { field: 'related_to_module', operator: LogicOperator.EQUALS, value: 'products' } } },
    { key: 'related_customer', labels: { fa: 'مشتری مرتبط', en: 'Related Customer' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'general', order: 3, relationConfig: { targetModule: 'customers', targetField: 'name' }, nature: FieldNature.STANDARD, logic: { visibleIf: { field: 'related_to_module', operator: LogicOperator.EQUALS, value: 'customers' } } },
    { key: 'related_supplier', labels: { fa: 'تامین‌کننده مرتبط', en: 'Related Supplier' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'general', order: 4, relationConfig: { targetModule: 'suppliers', targetField: 'name' }, nature: FieldNature.STANDARD, logic: { visibleIf: { field: 'related_to_module', operator: LogicOperator.EQUALS, value: 'suppliers' } } },
    { key: 'related_production_order', labels: { fa: 'سفارش تولید مرتبط', en: 'Related Production Order' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'general', order: 5, relationConfig: { targetModule: 'production_orders', targetField: 'order_number' }, nature: FieldNature.STANDARD, logic: { visibleIf: { field: 'related_to_module', operator: LogicOperator.EQUALS, value: 'production_orders' } } },
    { key: 'related_invoice', labels: { fa: 'فاکتور مرتبط', en: 'Related Invoice' }, type: FieldType.RELATION, location: FieldLocation.BLOCK, blockId: 'general', order: 6, relationConfig: { targetModule: 'invoices', targetField: 'name' }, nature: FieldNature.STANDARD, logic: { visibleIf: { field: 'related_to_module', operator: LogicOperator.EQUALS, value: 'invoices' } } },
    { 
      key: 'sort_order', 
      labels: { fa: 'ترتیب نمایش', en: 'Sort Order' }, 
      type: FieldType.NUMBER, 
      location: FieldLocation.BLOCK, 
      blockId: 'general', // یا هر بلاک مرتبط
      order: 10, 
      nature: FieldNature.STANDARD,
      logic: { visibleIf: { field: 'related_to_module', operator: LogicOperator.EQUALS, value: 'production_orders' } },
      isTableColumn: false // اگر میخواهید در جدول تسک ها هم دیده شود
    },
  ],
  
  blocks: [
    { id: 'general', titles: { fa: 'اطلاعات عمومی', en: 'General Info' }, type: BlockType.FIELD_GROUP, order: 1 },
    { id: 'scheduling', titles: { fa: 'زمان‌بندی', en: 'Scheduling' }, type: BlockType.FIELD_GROUP, order: 2 },
  ],
  
  relatedTabs: []
};