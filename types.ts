import { LogicalFilter } from "@refinedev/core";

// --- ENUMS ---

export enum ModuleNature {
  STANDARD = 'standard',       
  PRODUCT = 'product',         
  INVOICE = 'invoice',         
  MARKETING = 'marketing',     
  PRODUCTION = 'production',   
  WAREHOUSE = 'warehouse',
  CRM = 'crm',
  TASK = 'task',
  FINANCE = 'finance'
}

export enum ViewMode {
  LIST = 'list',
  GRID = 'grid',
  KANBAN = 'kanban',
  TIMELINE = 'timeline',
  GANTT = 'gantt'
}

export enum RelatedDisplayMode {
  CARD = 'card',      
  LIST = 'list',      
  KANBAN = 'kanban',  
  TIMELINE = 'timeline',
  GRID = 'grid'
}

export enum FieldType {
  TEXT = 'text',
  LONG_TEXT = 'long_text',
  NUMBER = 'number',
  PRICE = 'price',     
  PERCENTAGE = 'percentage', 
  CHECKBOX = 'checkbox',
  STOCK = 'stock',     
  IMAGE = 'image',
  SELECT = 'select',
  MULTI_SELECT = 'multi_select',
  CHECKLIST = 'checklist', 
  DATE = 'date',
  TIME = 'time',
  DATETIME = 'datetime',
  LINK = 'link',
  LOCATION = 'location', 
  RELATION = 'relation', 
  USER = 'user',         
  STATUS = 'status',  
  PHONE = 'phone',
  JSON = 'json',
  TAGS = 'tags',
  READONLY_LOOKUP = 'readonly_lookup'
}

export enum FieldNature {
  PREDEFINED = 'predefined', 
  SYSTEM = 'system',         
  STANDARD = 'standard',     
}

export enum FieldLocation {
  HEADER = 'header',       
  BLOCK = 'block',         
  SYSTEM_FOOTER = 'footer' 
}

export enum BlockType {
  DEFAULT = 'default', // برای سازگاری با کدهای قبلی
  FIELD_GROUP = 'field_group',
  TABLE = 'table'
}

export enum UserRole {
  ADMIN = 'admin',
  SALES = 'sales',
  WAREHOUSE = 'warehouse',
  PRODUCTION = 'production',
  VIEWER = 'viewer'
}

export enum LogicOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'gt',
  LESS_THAN = 'lt',
  CONTAINS = 'contains',
  IS_TRUE = 'is_true',
  IS_FALSE = 'is_false'
}

export enum FilterOperator {
  EQUALS = 'eq',
  NOT_EQUALS = 'neq',
  CONTAINS = 'ilike',
  GREATER_THAN = 'gt',
  LESS_THAN = 'lt',
  GREATER_THAN_OR_EQUAL = 'gte',
  LESS_THAN_OR_EQUAL = 'lte',
  IN = 'in', 
  IS_NULL = 'is',
}

// --- INTERFACES ---

export interface SelectOption {
  label: string;
  value: string | number;
  color?: string; 
}

export interface FieldValidation {
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  regex?: string; 
  customMessage?: string;
}

export interface FieldAccess {
  viewRoles: UserRole[]; 
  editRoles: UserRole[]; 
}

export interface FieldLogic {
  defaultValue?: any;
  visibleIf?: {
    field: string;
    operator: LogicOperator;
    value?: any;
  };
  formula?: string; 
}

export interface ModuleField {
  key: string;
  type: FieldType;
  labels: { fa: string; en?: string };
  isTableColumn?: boolean;
  options?: SelectOption[];
  validation?: FieldValidation;
  location?: FieldLocation | 'header' | 'block'; // پشتیبانی از هر دو حالت رشته و enum
  nature?: FieldNature;
  blockId?: string;
  order?: number;
  icon?: string;
  isKey?: boolean;
  access?: FieldAccess;
  logic?: any; // برای انعطاف‌پذیری بیشتر
  relationConfig?: { targetModule: string; targetField?: string; filter?: Record<string, any>; };
}

export interface BlockDefinition {
  id: string;
  type: BlockType;
  titles: { fa: string; en?: string };
  order: number;
  icon?: string;
  visibleIf?: any;
  tableColumns?: any[];
}

export interface ModuleDefinition {
  id: string;
  titles: { fa: string; en?: string };
  nature?: ModuleNature;
  table: string;
  fields: ModuleField[];
  blocks: BlockDefinition[];
  supportedViewModes?: ViewMode[];
  defaultViewMode?: ViewMode;
  relatedTabs?: any[];
}

// --- VIEW & FILTER INTERFACES ---

export interface FilterItem {
  id: string;
  field: string;
  operator: string;
  value: any;
}

export interface ViewConfig {
  columns: string[];
  filters: FilterItem[];
  sort?: { field: string; order: 'asc' | 'desc' }[];
}

export interface SavedView {
  id: string;
  name: string;
  module_id: string;
  config: ViewConfig;
  is_default: boolean;
  created_at?: string;
}