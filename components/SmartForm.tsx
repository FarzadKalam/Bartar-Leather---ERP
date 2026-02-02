import React, { useEffect, useState } from 'react';
import { Form, Button, message, Spin, Divider } from 'antd';
import { SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import SmartFieldRenderer from './SmartFieldRenderer';
import EditableTable from './EditableTable';
import SummaryCard from './SummaryCard';
import { calculateSummary } from '../utils/calculations';
import { ModuleDefinition, FieldLocation, BlockType, LogicOperator, FieldType, SummaryCalculationType } from '../types';

interface SmartFormProps {
  module: ModuleDefinition;
  visible: boolean;
  onCancel: () => void;
  onSave?: (values: any) => void;
  recordId?: string;
  title?: string;
  isBulkEdit?: boolean;
  initialValues?: Record<string, any>;
}

const SmartForm: React.FC<SmartFormProps> = ({ 
  module, visible, onCancel, onSave, recordId, title, isBulkEdit = false,
  initialValues = {} 
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const watchedValues = Form.useWatch([], form);
  
  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});
  const [fieldPermissions, setFieldPermissions] = useState<Record<string, boolean>>({});
  const [modulePermissions, setModulePermissions] = useState<{ view?: boolean; edit?: boolean; delete?: boolean }>({});
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allRoles, setAllRoles] = useState<any[]>([]);
  
  const fetchAllRelationOptionsWrapper = async () => {
    await fetchRelationOptions();
    await fetchBaseInfo();
    setOptionsLoaded(true);
  };

  const fetchBaseInfo = async () => {
    const { data: users } = await supabase.from('profiles').select('id, full_name, avatar_url');
    const { data: roles } = await supabase.from('org_roles').select('id, title');
    if (users) setAllUsers(users);
    if (roles) setAllRoles(roles);
  };

  useEffect(() => {
    // Fetch options فقط یک بار در اولین باز شدن
    if (!optionsLoaded) {
      fetchAllRelationOptionsWrapper();
    }
  }, []);

  useEffect(() => {
    if (visible) {
      if (recordId && !isBulkEdit) {
        // --- حالت ویرایش ---
        fetchRecord();
      } else {
        // --- حالت ایجاد رکورد جدید ---
        form.resetFields();
        setFormData({}); // اول خالی کن

        // 1. استخراج مقادیر پیش‌فرض از کانفیگ
        const defaults: Record<string, any> = {};
        module.fields.forEach(field => {
          if (field.defaultValue !== undefined) {
            defaults[field.key] = field.defaultValue;
          }
        });

        // 2. ترکیب با مقادیر اولیه ورودی (اولویت با ورودی‌هاست)
        const initialProps = initialValues || {};
        const finalValues = { ...defaults, ...initialProps };

        // 3. اعمال مقادیر اولیه بدون تاخیر (برای جلوگیری از flicker)
        setFormData(finalValues);
        form.setFieldsValue(finalValues);
      }
      
      // فراخوانی توابع کمکی
      fetchUserPermissions();
      fetchRelationOptions();
      loadDynamicOptions();
    }
  }, [visible, recordId, module, initialValues]);

  const fetchUserPermissions = async () => { /* کد قبلی */ setModulePermissions({ view: true, edit: true, delete: true }); };
  
  // --- 2. دریافت آپشن‌های ارتباطی (Relation) ---
  const fetchRelationOptions = async () => {
    const options: Record<string, any[]> = {};
    
    // تابع کمکی برای دریافت دیتا با کد سیستمی
    const fetchOptionsForField = async (targetModule?: string, targetField?: string, key?: string) => {
        // اگر پارامترهای ضروری موجود نیستند، کاری انجام نده
        if (!targetModule || !targetField || !key) return;

        try {
            // تلاش برای گرفتن نام + کد سیستمی
            const { data, error } = await supabase
                .from(targetModule)
                .select(`id, ${targetField}, system_code`)
                .limit(100);
            
            if (!error && data) {
                options[key] = data.map((item: any) => ({
                    label: item.system_code ? `${item[targetField]} (${item.system_code})` : item[targetField],
                    value: item.id
                }));
                return;
            }
        } catch (e) { /* اگر فیلد system_code نبود خطا نده */ }

        try {
            // تلاش دوم: فقط نام
            const { data } = await supabase
                .from(targetModule)
                .select(`id, ${targetField}`)
                .limit(100);
            
            if (data) {
                options[key] = data.map((item: any) => ({
                    label: item[targetField],
                    value: item.id
                }));
            }
        } catch (e) { console.error("Error fetching relation:", e); }
    };

    // پیمایش فیلدهای اصلی
    for (const field of module.fields) {
      if (field.type === FieldType.RELATION && field.relationConfig) {
        await fetchOptionsForField(field.relationConfig.targetModule, field.relationConfig.targetField, field.key);
      }
    }

    // پیمایش ستون‌های جداول
    if (module.blocks) {
        for (const block of module.blocks) {
            if (block.type === BlockType.TABLE && block.tableColumns) {
                for (const col of block.tableColumns) {
                    if (col.type === FieldType.RELATION && col.relationConfig) {
                        const key = `${block.id}_${col.key}`;
                        await fetchOptionsForField(col.relationConfig.targetModule, col.relationConfig.targetField, key);
                        // کپی برای دسترسی راحت‌تر
                        if (!options[col.key]) options[col.key] = options[key];
                    }
                }
            }
        }
    }
    setRelationOptions(options);
  };

  // --- 3. دریافت آپشن‌های داینامیک ---
  const loadDynamicOptions = async () => {
    const newOptions: Record<string, any[]> = {};
    const categoriesToFetch = new Set<string>();

    // جمع‌آوری دسته‌ها از فیلدها و ستون‌های جدول
    module.fields.forEach(f => { if (f.dynamicOptionsCategory) categoriesToFetch.add(f.dynamicOptionsCategory); });
    module.blocks?.forEach(b => {
        b.tableColumns?.forEach((c: any) => { if (c.dynamicOptionsCategory) categoriesToFetch.add(c.dynamicOptionsCategory); });
    });

    for (const category of Array.from(categoriesToFetch)) {
        const { data } = await supabase
            .from('dynamic_options')
            .select('label, value')
            .eq('category', category)
            .eq('is_active', true)
            .order('display_order', { ascending: true });
        
        if (data) {
            newOptions[category] = data.map(item => ({
                label: item.label,
                value: item.value,
            }));
        }
    }
    setDynamicOptions(newOptions);
  };

  // --- 4. دریافت رکورد (در حالت ویرایش) ---
  const fetchRecord = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from(module.table).select('*').eq('id', recordId).single();
      if (error) throw error;
      if (data) {
        form.setFieldsValue(data);
        setFormData(data);
      }
    } catch (err: any) {
      message.error('خطا: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- تابع کمکی: دریافت دیتای خلاصه (Summary) ---
  const getSummaryData = (currentData: any) => {
      const summaryBlock = module.blocks?.find(b => b.summaryConfig);
      if (summaryBlock) {
          return calculateSummary(currentData, module.blocks || [], summaryBlock.summaryConfig);
      }
      // اگر کانفیگ نبود ولی جدول داشتیم، پیش‌فرض جمع بزن (برای BOM)
      if (module.blocks?.some(b => b.type === BlockType.TABLE)) {
          return calculateSummary(currentData, module.blocks || [], {});
      }
      return null;
  };

  // --- ذخیره نهایی ---
  const handleFinish = async (values: any) => {
    setLoading(true);
    try {
      const summaryData = getSummaryData(formData);
      const summaryBlock = module.blocks?.find(b => b.summaryConfig);

      // تزریق مقادیر محاسباتی به دیتای ارسالی
      if (summaryData && summaryBlock?.summaryConfig?.fieldMapping) {
          const mapping = summaryBlock.summaryConfig.fieldMapping;
          if (mapping.total && summaryData.total !== undefined) values[mapping.total] = summaryData.total;
          if (mapping.received && summaryData.received !== undefined) values[mapping.received] = summaryData.received;
          if (mapping.remaining && summaryData.remaining !== undefined) values[mapping.remaining] = summaryData.remaining;
      } else if (summaryData && (module.id === 'products' || module.id === 'production_boms')) {
          values['production_cost'] = summaryData.total;
      }

      if (onSave) await onSave(values);
      else {
        if (recordId) await supabase.from(module.table).update(values).eq('id', recordId);
        else await supabase.from(module.table).insert(values);
        message.success('ثبت شد');
        onCancel();
      }
    } catch (err: any) { message.error(err.message); } finally { setLoading(false); }
  };

  const handleValuesChange = (_: any, allValues: any) => { setFormData(allValues); };
  const checkVisibility = (logicOrRule: any, values?: any) => {
    if (!logicOrRule) return true;
    
    // پشتیبانی هم از آبجکت logic (که visibleIf دارد) و هم از خود قانون شرط
    const rule = logicOrRule.visibleIf || logicOrRule;
    
    // اگر قانون معتبری نبود، نمایش بده
    if (!rule || !rule.field) return true;

    const { field, operator, value } = rule;
    const resolvedValues = values || watchedValues || formData;
    const fieldValue = resolvedValues?.[field];

    // اگر فیلد مرجع هنوز مقدار نگرفته، برای شرط‌های "مخالف" آن را مخفی کن
    if (fieldValue === undefined || fieldValue === null) {
         if (operator === LogicOperator.NOT_EQUALS) return false;
    }

    switch (operator) {
      case LogicOperator.EQUALS:
        return fieldValue === value;
      case LogicOperator.NOT_EQUALS:
        return fieldValue !== value;
      case LogicOperator.CONTAINS:
        return Array.isArray(fieldValue) ? fieldValue.includes(value) : false;
      case LogicOperator.GREATER_THAN:
        return Number(fieldValue) > Number(value);
      case LogicOperator.LESS_THAN:
        return Number(fieldValue) < Number(value);
      default:
        return true;
    }
  };

  const canEditModule = modulePermissions.edit !== false;
  const sortedBlocks = [...(module.blocks || [])].sort((a, b) => a.order - b.order);
  const headerFields = module.fields
      .filter(f => f.location === FieldLocation.HEADER)
      .filter(f => f.nature !== 'system') // 👈 این خط را اینجا هم اضافه کنید
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  // محاسبه دیتا برای نمایش در لحظه (رندر)
  const currentValues = watchedValues || formData;
  const currentSummaryData = getSummaryData(currentValues);
  const summaryConfigObj = module.blocks?.find(b => b.summaryConfig)?.summaryConfig;  return (
    <div className="fixed inset-0 bg-black/50 z-[1300] flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-[#1e1e1e] w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/5">
          <h2 className="text-xl font-black text-gray-800 dark:text-white m-0 flex items-center gap-2">
            <span className="w-2 h-8 bg-leather-500 rounded-full inline-block"></span>
            {title || (recordId ? `ویرایش ${module.titles.fa}` : `افزودن ${module.titles.fa} جدید`)}
          </h2>
          <Button shape="circle" icon={<CloseOutlined />} onClick={onCancel} className="border-none hover:bg-red-50 hover:text-red-500" />
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading && !isBulkEdit ? (
            <div className="h-full flex items-center justify-center"><Spin size="large" /></div>
          ) : (
            <Form form={form} layout="vertical" onFinish={handleFinish} onValuesChange={handleValuesChange} initialValues={formData}>
              
              {/* Header Fields */}
              {headerFields.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 bg-gray-50 dark:bg-white/5 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                  {headerFields.map(field => {
                     if (field.logic && !checkVisibility(field.logic, currentValues)) return null;
                     let options = field.options; 
                     if (field.dynamicOptionsCategory) options = dynamicOptions[field.dynamicOptionsCategory];
                     if (field.type === FieldType.RELATION) options = relationOptions[field.key];
                     return (
                        <div key={field.key} className={field.type === FieldType.IMAGE ? 'row-span-2' : ''}>
                          <SmartFieldRenderer 
                            field={field} 
                            value={formData[field.key]} 
                            onChange={(val) => form.setFieldValue(field.key, val)}
                            forceEditMode={true}
                            options={options}
                          />
                        </div>
                     );
                  })}
                </div>
              )}

              {/* Blocks */}
              {sortedBlocks.map(block => {
                if (block.visibleIf && !checkVisibility(block.visibleIf, currentValues)) return null;

                if (block.type === BlockType.FIELD_GROUP || block.type === BlockType.DEFAULT) {
                  const blockFields = module.fields
                    .filter(f => f.blockId === block.id)
                    .filter(f => f.nature !== 'system') // 👈 این خط اضافه شد: حذف کامل فیلدهای سیستمی از گرید
                    .sort((a, b) => (a.order || 0) - (b.order || 0));

                  return (
                    <div key={block.id} className="mb-6 animate-slideUp">
                      <Divider orientation="left" className="!border-leather-200 !text-leather-600 !font-bold !text-sm">
                        {block.icon && <i className={`mr-2 ${block.icon}`}></i>}
                        {block.titles.fa}
                      </Divider>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {blockFields.map(field => {
                          if (field.logic && !checkVisibility(field.logic, currentValues)) return null;
                           let fieldValue = formData[field.key];
                           let isReadOnly = false;
                           // فیلدهای خلاصه اگر محاسبه شده باشند
                           if (currentSummaryData && summaryConfigObj?.calculationType === SummaryCalculationType.INVOICE_FINANCIALS) {                               // لاجیک نمایشی فیلدهای خلاصه
                           }
                           let options = field.options;
                           if (field.dynamicOptionsCategory) options = dynamicOptions[field.dynamicOptionsCategory];
                           if (field.type === FieldType.RELATION) options = relationOptions[field.key];
                           return (
                             <SmartFieldRenderer 
                               key={field.key}
                               field={field}
                               value={fieldValue}
                               recordId={recordId}
                               onChange={(val) => {
                                 if (!isReadOnly) { form.setFieldValue(field.key, val); setFormData({ ...form.getFieldsValue(), [field.key]: val }); }
                               }}
                               forceEditMode={true} options={options}
                             />
                           );
                        })}
                      </div>
                    </div>
                  );
                }

                if (block.type === BlockType.TABLE) {
                      return (
                        <div key={block.id} className="mb-8 p-1 border border-dashed border-gray-300 rounded-3xl">
                            <Form.Item name={block.id} noStyle>
                                <EditableTable
                                    block={block}
                                    initialData={formData[block.id] || []}
                                    mode="local"
                                    moduleId={module.id}
                                    relationOptions={relationOptions}
                                    dynamicOptions={dynamicOptions}
                                    onChange={(newData) => {
                                        const newFormData = { ...formData, [block.id]: newData };
                                        setFormData(newFormData);
                                        form.setFieldValue(block.id, newData);
                                    }}
                                />
                            </Form.Item>
                        </div>
                      );
                  }

                return null;
              })}

              {/* --- نمایش فوتر هوشمند --- */}
              {currentSummaryData && (
                  <SummaryCard 
                    type={summaryConfigObj?.calculationType || SummaryCalculationType.SUM_ALL_ROWS} 
                    data={currentSummaryData} 
                  />
              )}
            </Form>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1e1e1e] flex justify-end gap-3">
          <Button size="large" onClick={onCancel} className="rounded-xl">انصراف</Button>
          <Button size="large" type="primary" onClick={() => form.submit()} loading={loading} disabled={!canEditModule} icon={<SaveOutlined />} className="rounded-xl bg-leather-600 hover:!bg-leather-500 shadow-lg shadow-leather-500/20">
            {recordId ? 'ذخیره تغییرات' : 'ثبت نهایی'}
          </Button>
        </div>

      </div>
    </div>
  );
};

export default SmartForm;