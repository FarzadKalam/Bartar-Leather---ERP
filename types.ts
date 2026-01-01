
// --- ENUMS & CONSTANTS ---

export enum ModuleNature {
  STANDARD = 'standard',       
  PRODUCT = 'product',         
  INVOICE = 'invoice',         
  MARKETING = 'marketing',     
  PRODUCTION = 'production',   
  WAREHOUSE = 'warehouse',
  CRM = 'crm',
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
  JSON = 'json'
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
  FIELD_GROUP = 'field_group', // Default: A group of fields
  TABLE = 'table'              // New: A table of items (e.g. BOM Items, Invoice Items)
}

export enum UserRole {
  ADMIN = 'admin',
  SALES = 'sales',
  WAREHOUSE = 'warehouse',
  PRODUCTION = 'production',
  VIEWER = 'viewer'
}

export enum LogicOperator {
  EQUALS = 'eq',
  NOT_EQUALS = 'neq',
  GREATER_THAN = 'gt',
  LESS_THAN = 'lt',
  CONTAINS = 'contains',
  IS_TRUE = 'is_true',
  IS_FALSE = 'is_false'
}

// --- CORE INTERFACES ---

export interface SelectOption {
  label: string;
  value: string | number;
  color?: string; 
}

export interface SmartFieldProps {
  label?: string;
  value: any;
  type: FieldType;
  options?: SelectOption[];
  relationModule?: string;
  onSave: (value: any) => void;
  readonly?: boolean;
  className?: string;
  showLabel?: boolean;
  error?: string;
}

export interface FieldAccess {
  viewRoles: UserRole[]; 
  editRoles: UserRole[]; 
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

export interface FieldLogic {
  defaultValue?: any;
  visibleIf?: {
    field: string;
    operator: LogicOperator;
    value?: any;
  };
  formula?: string; 
}

export interface FieldDefinition {
  key: string;              
  labels: { fa: string; en: string };
  type: FieldType;
  nature: FieldNature;
  location: FieldLocation;
  blockId?: string;         
  order: number;
  icon?: string;            
  isKey: boolean;           
  access?: FieldAccess;
  validation?: FieldValidation;
  logic?: FieldLogic;
  options?: SelectOption[]; 
  relationConfig?: {
    targetModule: string;   
    targetField: string;    
  };
}

export interface TableColumnDefinition {
  key: string;
  title: string;
  type: FieldType;
  width?: string | number;
  relationConfig?: { targetModule: string; targetField: string; };
  options?: SelectOption[];
}

export interface BlockDefinition {
  id: string;
  titles: { fa: string; en: string };
  icon: string; 
  order: number;
  type: BlockType;
  tableColumns?: TableColumnDefinition[]; // Only used if type === TABLE
}

export interface ModuleDefinition {
  id: string;               
  titles: { fa: string; en: string };
  nature: ModuleNature;
  supportedViewModes: ViewMode[];
  defaultViewMode: ViewMode;
  fields: FieldDefinition[]; 
  blocks: BlockDefinition[]; 
  relatedTabs?: {
    sourceModule: string;
    displayMode: RelatedDisplayMode;
    label: string;
  }[];
}

// --- DB ENTITY INTERFACES (Matching Supabase Schema) ---

export interface BaseEntity {
  id: string;
  created_at?: string;
  created_by?: string;
  updated_at?: string;
  updated_by?: string;
  [key: string]: any;
}

export interface Profile extends BaseEntity {
  full_name: string;
  mobile_1?: string;
  role: UserRole;
  avatar_url?: string;
}

export interface Product extends BaseEntity {
  name: string;
  custom_code?: string;
  manual_code?: string;
  product_type: 'raw' | 'semi' | 'final';
  category: string;
  main_unit?: string;
  sub_unit?: string;
  colors?: string[]; // JSONB
  supplier_id?: string;
  brand?: string;
  waste_rate?: number;
  buy_price?: number;
  sell_price?: number;
  stock: number;
  reorder_point: number;
  specs?: any; // JSONB
  image?: string; // Add to DB later if needed
}

export interface Supplier extends BaseEntity {
  business_name: string;
  first_name?: string;
  last_name?: string;
  mobile_1?: string;
  city?: string;
  rating?: number;
}

export interface Customer extends BaseEntity {
  business_name?: string;
  first_name: string;
  last_name: string;
  mobile_1: string;
  rating?: number;
}

export interface Warehouse extends BaseEntity {
  name: string;
  location?: string;
  manager_id?: string;
}

export interface Invoice extends BaseEntity {
  invoice_type: 'proforma' | 'final';
  status: string;
  customer_id: string;
  total_amount: number;
  final_payable: number;
  financial_approval: boolean;
  items?: any[];
}

export interface Task extends BaseEntity {
  name: string;
  task_type: 'org' | 'production' | 'marketing';
  responsible_id?: string;
  status: string;
  due_at?: string;
  related_to_module?: string;
  related_to_id?: string;
}

export interface BOM extends BaseEntity {
  name: string;
  status: string;
  custom_code?: string;
  items?: any[];
}

export interface ProductionOrder extends BaseEntity {
  order_code: string;
  product_id: string;
  qty: number;
  start_date: string;
  due_date: string;
  status: string;
  items?: any[];
}
