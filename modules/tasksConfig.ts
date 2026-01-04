import { ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldLocation, BlockType, LogicOperator, FieldNature } from '../types';

// تعریف بلاک‌ها
const BLOCKS = {
  general: { 
    id: 'general', 
    titles: { fa: 'اطلاعات عمومی', en: 'General Info' }, 
    icon: 'ContainerOutlined', 
    order: 1, 
    type: BlockType.FIELD_GROUP 
  },
  scheduling: { 
    id: 'scheduling', 
    titles: { fa: 'زمان‌بندی', en: 'Scheduling' }, 
    icon: 'CalendarOutlined', 
    order: 2, 
    type: BlockType.FIELD_GROUP 
  },
  relations: {
    id: 'relations',
    titles: { fa: 'ارتباطات', en: 'Relations' },
    icon: 'LinkOutlined',
    order: 3,
    type: BlockType.FIELD_GROUP
  }
};

export const tasksModule: ModuleDefinition = {
  id: 'tasks',
  titles: { fa: 'وظایف', en: 'Tasks' },
  nature: ModuleNature.TASK, // این مقدار باید به enum در types.ts اضافه شود
  supportedViewModes: [ViewMode.KANBAN, ViewMode.LIST, ViewMode.CALENDAR, ViewMode.GANTT],
  defaultViewMode: ViewMode.KANBAN,
  fields: [
    // --- هدر ---
    {
      key: 'name',
      labels: { fa: 'عنوان وظیفه', en: 'Subject' },
      type: FieldType.TEXT,
      location: FieldLocation.HEADER,
      order: 1,
      validation: { required: true },
      nature: FieldNature.STANDARD,
      isKey: true
    },
    {
      key: 'status',
      labels: { fa: 'وضعیت', en: 'Status' },
      type: FieldType.STATUS,
      location: FieldLocation.HEADER,
      order: 2,
      options: [
        { label: 'انجام نشده', value: 'todo', color: 'red' },
        { label: 'در حال انجام', value: 'in_progress', color: 'blue' },
        { label: 'بازبینی', value: 'review', color: 'orange' },
        { label: 'تکمیل شده', value: 'done', color: 'green' },
        { label: 'لغو شده', value: 'canceled', color: 'gray' }
      ],
      defaultValue: 'todo',
      nature: FieldNature.STANDARD,
      isKey: false
    },
    {
      key: 'responsible_id',
      labels: { fa: 'مسئول انجام', en: 'Assignee' },
      type: FieldType.USER, // یا Relation به پروفایل‌ها
      location: FieldLocation.HEADER,
      order: 3,
      relationConfig: { targetModule: 'profiles', targetField: 'full_name' },
      nature: FieldNature.STANDARD,
      isKey: false
    },

    // --- اطلاعات عمومی ---
    {
      key: 'task_type',
      labels: { fa: 'نوع وظیفه', en: 'Task Type' },
      type: FieldType.SELECT,
      location: FieldLocation.BLOCK,
      blockId: 'general',
      order: 1,
      options: [
        { label: 'تولید', value: 'production', color: 'gold' },
        { label: 'سازمانی', value: 'org', color: 'purple' },
        { label: 'بازاریابی', value: 'marketing', color: 'cyan' },
        { label: 'سایر', value: 'other', color: 'default' }
      ],
      validation: { required: true },
      nature: FieldNature.STANDARD,
      isKey: false
    },
    {
        key: 'priority',
        labels: { fa: 'اولویت', en: 'Priority' },
        type: FieldType.SELECT,
        location: FieldLocation.BLOCK,
        blockId: 'general',
        order: 2,
        options: [
            { label: 'بالا', value: 'high', color: 'red' },
            { label: 'متوسط', value: 'medium', color: 'blue' },
            { label: 'پایین', value: 'low', color: 'gray' }
        ],
        defaultValue: 'medium',
        nature: FieldNature.STANDARD,
        isKey: false
    },

    // --- زمان‌بندی (شمسی) ---
    {
      key: 'due_at',
      labels: { fa: 'مهلت انجام', en: 'Due Date' },
      type: FieldType.DATETIME,
      location: FieldLocation.BLOCK,
      blockId: 'scheduling',
      order: 1,
      nature: FieldNature.STANDARD,
      isKey: false
    },
    {
      key: 'assigned_at',
      labels: { fa: 'تاریخ واگذاری', en: 'Assigned Date' },
      type: FieldType.DATETIME,
      location: FieldLocation.BLOCK,
      blockId: 'scheduling',
      order: 2,
      nature: FieldNature.STANDARD,
      isKey: false
    },

    // --- ارتباطات (Polymorphic Relation) ---
    {
        key: 'related_to_module',
        labels: { fa: 'مرتبط با بخش', en: 'Related Module' },
        type: FieldType.SELECT,
        location: FieldLocation.BLOCK,
        blockId: 'relations',
        order: 1,
        options: [
            { label: 'سفارش تولید', value: 'production_orders' },
            { label: 'مشتری', value: 'customers' },
            { label: 'فاکتور', value: 'invoices' },
            { label: 'محصول', value: 'products' }
        ],
        nature: FieldNature.STANDARD,
        isKey: false
    },
    {
        key: 'related_to_id',
        labels: { fa: 'رکورد مرتبط', en: 'Related Record' },
        type: FieldType.RELATION,
        location: FieldLocation.BLOCK,
        blockId: 'relations',
        order: 2,
        // نکته: این کانفیگ باید به صورت داینامیک در کامپوننت فرم هندل شود
        // فعلا یک مقدار پیش‌فرض می‌گذاریم، اما در اجرا باید بر اساس فیلد بالا تغییر کند
        relationConfig: { targetModule: 'products', targetField: 'name' }, 
        logic: { 
            visibleIf: { field: 'related_to_module', operator: LogicOperator.NOT_EQUALS, value: null } 
        },
        nature: FieldNature.STANDARD,
        isKey: false
    }
  ],
  blocks: [BLOCKS.general, BLOCKS.scheduling, BLOCKS.relations]
};