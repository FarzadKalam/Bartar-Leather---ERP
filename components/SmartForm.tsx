import React, { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Select, Button, Tabs, message, Upload, Divider, Space } from 'antd';
import { SaveOutlined, UploadOutlined, PlusOutlined } from '@ant-design/icons';
import { ModuleDefinition, FieldType, FieldLocation, BlockType, LogicOperator } from '../types';
import { supabase } from '../supabaseClient';
import dayjs from 'dayjs';
import jalaliday from 'jalaliday';
import EditableTable from './EditableTable';

dayjs.extend(jalaliday);

interface SmartFormProps {
  moduleConfig: ModuleDefinition;
  onSuccess: () => void;
  onCancel: () => void;
  initialValues?: any; // برای ویرایش تکی
  recordId?: string;   // آیدی رکورد برای ویرایش تکی
  batchIds?: React.Key[]; // آیدی‌ها برای ویرایش گروهی
  mode?: 'create' | 'edit' | 'bulk'; // حالت فرم
}

const SmartForm: React.FC<SmartFormProps> = ({ 
  moduleConfig, 
  onSuccess, 
  onCancel, 
  initialValues, 
  recordId, 
  batchIds,
  mode = 'create' 
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});
  const [formValues, setFormValues] = useState<any>({});
  const [imageUrl, setImageUrl] = useState<string | null>(initialValues?.image_url || null);
  const [tableData, setTableData] = useState<Record<string, any[]>>({});

  const checkVisibility = (logic: any) => {
    // در حالت ویرایش گروهی، شرط‌ها رو ساده‌تر می‌گیریم یا نادیده می‌گیریم چون ممکنه مقادیر وابسته خالی باشن
    if (mode === 'bulk') return true; 
    
    if (!logic || !logic.visibleIf) return true;
    const { field, operator, value } = logic.visibleIf;
    const currentValue = formValues[field];
    if (operator === LogicOperator.EQUALS) return currentValue === value;
    if (operator === LogicOperator.NOT_EQUALS) return currentValue !== value;
    return true;
  };

  const generateSystemCode = async (modulePrefix: string = 'PRD') => {
    try {
      const { data } = await supabase.from(moduleConfig.id).select('system_code').order('created_at', { ascending: false }).limit(1);
      let nextNum = 1;
      if (data && data.length > 0 && data[0].system_code) {
          const parts = data[0].system_code.split('-');
          if (parts.length === 2 && !isNaN(parseInt(parts[1]))) nextNum = parseInt(parts[1]) + 1;
      }
      return `${modulePrefix}-${String(nextNum).padStart(5, '0')}`;
    } catch (e) { return `${modulePrefix}-${Date.now().toString().slice(-5)}`; }
  };

  useEffect(() => {
    const initData = async () => {
      // 1. Fetch Relations
      const relFields = [...moduleConfig.fields.filter(f => f.type === FieldType.RELATION)];
      moduleConfig.blocks?.forEach(b => {
          if (b.type === BlockType.TABLE && b.tableColumns) {
              b.tableColumns.forEach(c => {
                  if (c.type === FieldType.RELATION) relFields.push({ ...c, key: `${b.id}_${c.key}` });
              });
          }
      });

      const relOpts: Record<string, any[]> = {};
      for (const field of relFields) {
        if (field.relationConfig) {
          const { targetModule, targetField } = field.relationConfig;
          const { data } = await supabase.from(targetModule).select(`id, ${targetField}, system_code`).limit(100);
          if (data) {
              const options = data.map(i => ({ label: `${i[targetField]} ${i.system_code ? `(${i.system_code})` : ''}`, value: i.id }));
              relOpts[field.key] = options;
              if (field.key.includes('_')) relOpts[field.key.split('_')[1]] = options; 
          }
        }
      }
      setRelationOptions(relOpts);

      // 2. Fetch Dynamic Options
      const dynFields = moduleConfig.fields.filter(f => (f as any).dynamicOptionsCategory);
      const dynOpts: Record<string, any[]> = {};
      for (const field of dynFields) {
          const cat = (field as any).dynamicOptionsCategory;
          const { data } = await supabase.from('option_sets').select('label, value').eq('category', cat);
          if (data) dynOpts[cat] = data;
      }
      setDynamicOptions(dynOpts);
    };

    initData();
    
    // مقداردهی اولیه فرم
    if (mode === 'edit' && initialValues) {
        form.setFieldsValue(initialValues);
        setFormValues(initialValues);
        if (initialValues.image_url) setImageUrl(initialValues.image_url);
        
        // پر کردن جداول از دیتای اولیه
        const tables: Record<string, any[]> = {};
        moduleConfig.blocks?.filter(b => b.type === BlockType.TABLE).forEach(b => {
            if (initialValues[b.id]) tables[b.id] = initialValues[b.id];
        });
        setTableData(tables);
    } else if (mode === 'bulk') {
        form.resetFields(); // در حالت بالک فرم خالی است
        setFormValues({});
        setImageUrl(null);
        setTableData({});
    } else {
        // حالت Create
        const defaults: any = {};
        moduleConfig.fields.forEach(f => { if ((f as any).defaultValue) defaults[f.key] = (f as any).defaultValue; });
        form.resetFields();
        form.setFieldsValue(defaults);
        setFormValues(defaults);
        setImageUrl(null);
        setTableData({});
    }
  }, [moduleConfig, initialValues, mode]);

  const handleValuesChange = (changedValues: any, allValues: any) => {
      setFormValues(allValues);
  };

  const handleAddOption = async (category: string, newValue: string) => {
      if(!newValue) return;
      const { error } = await supabase.from('option_sets').insert([{ category, label: newValue, value: newValue }]);
      if(!error) {
          message.success('گزینه اضافه شد');
          setDynamicOptions(prev => ({ ...prev, [category]: [...(prev[category] || []), { label: newValue, value: newValue }] }));
      }
  };

  const handleImageUpload = async (file: File) => {
    try {
      const fileName = `${Math.random()}.${file.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('images').upload(fileName, file);
      if (error) throw error;
      const { data } = supabase.storage.from('images').getPublicUrl(fileName);
      setImageUrl(data.publicUrl);
      form.setFieldValue('image_url', data.publicUrl);
      return false;
    } catch (e: any) {
      message.error('خطا: ' + e.message);
      return false;
    }
  };

  const onFinish = async (values: any) => {
    setSubmitting(true);
    try {
      const cleanValues = { ...values };
      
      // حذف مقادیر خالی یا undefined در حالت بالک (فقط چیزهایی که پر شده ارسال شود)
      if (mode === 'bulk') {
          Object.keys(cleanValues).forEach(key => {
              if (cleanValues[key] === undefined || cleanValues[key] === null || cleanValues[key] === '') {
                  delete cleanValues[key];
              }
          });
          if (Object.keys(cleanValues).length === 0) {
              throw new Error('هیچ تغییری اعمال نشده است');
          }
      } else {
          // در حالت تکی، عکس و جداول را هم اضافه کن
          if (imageUrl) cleanValues.image_url = imageUrl;
          Object.keys(tableData).forEach(key => { cleanValues[key] = tableData[key]; });
      }

      // --- عملیات دیتابیس بر اساس مود ---
      if (mode === 'bulk' && batchIds && batchIds.length > 0) {
          // آپدیت گروهی
          const { error } = await supabase.from(moduleConfig.id).update(cleanValues).in('id', batchIds);
          if (error) throw error;
          message.success(`${batchIds.length} رکورد با موفقیت ویرایش شد`);
      } 
      else if (mode === 'edit' && recordId) {
          // ویرایش تکی
          const { error } = await supabase.from(moduleConfig.id).update(cleanValues).eq('id', recordId);
          if (error) throw error;
          message.success('ویرایش انجام شد');
      } 
      else {
          // ایجاد جدید
          if (moduleConfig.fields.find(f => f.key === 'system_code')) {
              cleanValues.system_code = await generateSystemCode();
          }
          const { error } = await supabase.from(moduleConfig.id).insert([cleanValues]);
          if (error) throw error;
          message.success('ثبت شد');
      }

      onSuccess();
    } catch (e: any) {
      console.error(e);
      message.error(e.message || 'خطا در عملیات');
    } finally {
      setSubmitting(false);
    }
  };

  const renderInput = (field: any) => {
    if ((field as any).dynamicOptionsCategory) {
        const cat = (field as any).dynamicOptionsCategory;
        return (
            <Select showSearch placeholder="انتخاب..." filterOption={(input, option) => (option?.label as string ?? '').includes(input)} options={dynamicOptions[cat]?.map(o => ({ label: o.label, value: o.value }))}
                dropdownRender={(menu) => (<><>{menu}</><Divider style={{ margin: '8px 0' }} /><Space style={{ padding: '0 8px 4px' }}><Input placeholder="جدید..." onPressEnter={(e) => handleAddOption(cat, e.currentTarget.value)} /></Space></>)}
            />
        );
    }
    switch (field.type) {
        case FieldType.SELECT: case FieldType.STATUS: return <Select options={field.options} allowClear />;
        case FieldType.IMAGE: return <div className="flex gap-2"><Upload showUploadList={false} beforeUpload={handleImageUpload}><Button icon={<UploadOutlined />}>تصویر</Button></Upload>{imageUrl && <img src={imageUrl} className="h-8 w-8 rounded block" />}</div>;
        case FieldType.RELATION: return <Select options={relationOptions[field.key]} showSearch filterOption={(input, option) => (option?.label as string ?? '').includes(input)} allowClear />;
        case FieldType.PRICE: return <InputNumber formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={value => value!.replace(/\$\s?|(,*)/g, '')} className="w-full" addonAfter="تومان" />;
        case FieldType.PERCENTAGE: return <InputNumber min={0} max={100} className="w-full" addonAfter="%" />;
        case FieldType.STOCK: return <InputNumber className="w-full" />;
        default: return <Input />;
    }
  };

  const renderFormItem = (field: any) => {
      if (!checkVisibility(field.logic)) return null;
      // در حالت بالک، فیلدها نباید Required باشند تا کاربر بتونه فقط یکی رو پر کنه
      const isRequired = mode === 'bulk' ? false : field.validation?.required;
      
      return (
        <Form.Item key={field.key} label={field.labels.fa} name={field.key} rules={[{ required: isRequired }]}>
            {renderInput(field)}
        </Form.Item>
      );
  };

  const visibleBlocks = moduleConfig.blocks?.filter(b => checkVisibility(b as any));
  const fieldGroups = visibleBlocks?.filter(b => b.type === BlockType.FIELD_GROUP);
  const tableBlocks = visibleBlocks?.filter(b => b.type === BlockType.TABLE);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#141414]">
        <Form form={form} layout="vertical" onFinish={onFinish} onValuesChange={handleValuesChange} className="flex-1 overflow-y-auto px-1">
            {mode === 'bulk' && <div className="bg-blue-50 text-blue-600 p-3 rounded-lg mb-4 text-sm">شما در حال ویرایش گروهی {batchIds?.length} رکورد هستید. فقط فیلدهایی که تغییر دهید اعمال می‌شوند.</div>}
            
            <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl mb-4 border border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-4">
                {moduleConfig.fields.filter(f => f.location === FieldLocation.HEADER && f.key !== 'system_code').map(renderFormItem)}
            </div>

            {fieldGroups && fieldGroups.length > 0 && (
                <Tabs type="card" items={fieldGroups.map(block => ({
                    key: block.id,
                    label: block.titles.fa,
                    children: (
                        <div className="bg-white dark:bg-transparent grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                            {moduleConfig.fields.filter(f => f.blockId === block.id).map(renderFormItem)}
                        </div>
                    )
                }))} />
            )}

            {/* جداول فقط در حالت Create و Edit نمایش داده می‌شوند، نه Bulk */}
            {mode !== 'bulk' && tableBlocks && tableBlocks.length > 0 && (
                <div className="mt-8 space-y-6">
                    {tableBlocks.map(block => (
                        <EditableTable 
                            key={block.id}
                            block={block}
                            mode="local"
                            initialData={tableData[block.id] || []}
                            relationOptions={relationOptions}
                            onChange={(newData) => setTableData({ ...tableData, [block.id]: newData })}
                        />
                    ))}
                </div>
            )}
        </Form>
        <div className="border-t border-gray-200 dark:border-gray-800 pt-4 mt-4 flex justify-end gap-3 sticky bottom-0 bg-white dark:bg-[#141414] z-10 p-4">
            <Button onClick={onCancel} className="dark:text-white dark:bg-transparent dark:border-gray-600">انصراف</Button>
            <Button type="primary" onClick={() => form.submit()} loading={submitting} className="bg-leather-500 hover:!bg-leather-600 border-none shadow-lg shadow-leather-500/30">
                {mode === 'create' ? 'ثبت نهایی' : 'ذخیره تغییرات'}
            </Button>
        </div>
    </div>
  );
};

export default SmartForm;