import React, { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Select, Button, Tabs, message, Upload, Divider, Space } from 'antd';
import { SaveOutlined, UploadOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { ModuleDefinition, FieldType, FieldLocation, BlockType, LogicOperator } from '../types';
import { supabase } from '../supabaseClient';
import dayjs from 'dayjs';
import jalaliday from 'jalaliday';
import SmartTableRenderer from './SmartTableRenderer'; 

dayjs.extend(jalaliday);

interface SmartFormProps {
  moduleConfig: ModuleDefinition;
  onSuccess: () => void;
  onCancel: () => void;
}

const SmartForm: React.FC<SmartFormProps> = ({ moduleConfig, onSuccess, onCancel }) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});
  const [formValues, setFormValues] = useState<any>({}); 
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [tableData, setTableData] = useState<Record<string, any[]>>({}); 

  const checkVisibility = (logic: any) => {
    if (!logic || !logic.visibleIf) return true;
    const { field, operator, value } = logic.visibleIf;
    const currentValue = formValues[field];
    if (operator === LogicOperator.EQUALS) return currentValue === value;
    if (operator === LogicOperator.NOT_EQUALS) return currentValue !== value;
    return true;
  };

  useEffect(() => {
    const initData = async () => {
      const relationFields = moduleConfig.fields.filter(f => f.type === FieldType.RELATION);
      const relOpts: Record<string, any[]> = {};
      for (const field of relationFields) {
        if (field.relationConfig) {
          const { targetModule, targetField } = field.relationConfig;
          const { data } = await supabase.from(targetModule).select(`id, ${targetField}`).limit(50);
          if (data) relOpts[field.key] = data.map(i => ({ label: i[targetField], value: i.id }));
        }
      }
      setRelationOptions(relOpts);

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
    const initialValues: any = {};
    moduleConfig.fields.forEach(f => {
        if ((f as any).defaultValue) initialValues[f.key] = (f as any).defaultValue;
    });
    
    form.resetFields();
    form.setFieldsValue(initialValues);
    setFormValues(initialValues);
    setImageUrl(null);
    setTableData({});
  }, [moduleConfig]);

  const handleValuesChange = (changedValues: any, allValues: any) => {
      setFormValues(allValues);
  };

  const handleAddOption = async (category: string, newValue: string) => {
      if(!newValue) return;
      const payload = { category, label: newValue, value: newValue };
      const { error } = await supabase.from('option_sets').insert([payload]);
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
      if (imageUrl) cleanValues.image_url = imageUrl;
      Object.keys(tableData).forEach(key => {
          cleanValues[key] = tableData[key];
      });

      const { error } = await supabase.from(moduleConfig.id).insert([cleanValues]);
      if (error) throw error;
      message.success('ثبت شد');
      onSuccess();
    } catch (e: any) {
      console.error(e);
      message.error(e.message || 'خطا در ثبت');
    } finally {
      setSubmitting(false);
    }
  };

  const renderInput = (field: any) => {
    if ((field as any).dynamicOptionsCategory) {
        const cat = (field as any).dynamicOptionsCategory;
        return (
            <Select showSearch placeholder="انتخاب یا تایپ..." 
                filterOption={(input, option) => (option?.label as string ?? '').includes(input)} 
                options={dynamicOptions[cat]?.map(o => ({ label: o.label, value: o.value }))}
                dropdownRender={(menu) => (
                    <>
                        {menu}
                        <Divider style={{ margin: '8px 0' }} />
                        <Space style={{ padding: '0 8px 4px' }}>
                            <Input placeholder="جدید..." onPressEnter={(e) => handleAddOption(cat, e.currentTarget.value)} />
                        </Space>
                    </>
                )}
            />
        );
    }
    switch (field.type) {
        case FieldType.SELECT: 
        case FieldType.STATUS:
             return <Select options={field.options} />;
        case FieldType.IMAGE: 
             return <div className="flex gap-2"><Upload showUploadList={false} beforeUpload={handleImageUpload}><Button icon={<UploadOutlined />}>تصویر</Button></Upload>{imageUrl && <img src={imageUrl} className="h-8 w-8 rounded block" />}</div>;
        case FieldType.RELATION: 
             return <Select options={relationOptions[field.key]} showSearch filterOption={(input, option) => (option?.label as string ?? '').includes(input)} />;
        case FieldType.PRICE: 
             return <InputNumber formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={value => value!.replace(/\$\s?|(,*)/g, '')} className="w-full" addonAfter="تومان" />;
        case FieldType.PERCENTAGE: 
             return <InputNumber min={0} max={100} className="w-full" addonAfter="%" />;
        case FieldType.STOCK:
             return <InputNumber className="w-full" />;
        default: 
             return <Input />;
    }
  };

  const renderFormItem = (field: any) => {
      if (!checkVisibility(field.logic)) return null;
      return <Form.Item key={field.key} label={field.labels.fa} name={field.key} rules={[{ required: field.validation?.required }]}>{renderInput(field)}</Form.Item>;
  };

  const visibleBlocks = moduleConfig.blocks?.filter(b => checkVisibility(b as any));
  const fieldGroups = visibleBlocks?.filter(b => b.type === BlockType.FIELD_GROUP);
  const tableBlocks = visibleBlocks?.filter(b => b.type === BlockType.TABLE);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#141414]"> {/* بک گراند اصلی دارک */}
        <Form form={form} layout="vertical" onFinish={onFinish} onValuesChange={handleValuesChange} className="flex-1 overflow-y-auto px-1">
            {/* Header Box - اصلاح رنگ در دارک مود */}
            <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl mb-4 border border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-4">
                {moduleConfig.fields.filter(f => f.location === FieldLocation.HEADER).map(renderFormItem)}
            </div>

            {/* Tabs */}
            {fieldGroups && fieldGroups.length > 0 && (
                <Tabs type="card" items={fieldGroups.map(block => ({
                    key: block.id,
                    label: block.titles.fa,
                    children: (
                        // Tab Content Box - اصلاح رنگ
                        <div className="bg-white dark:bg-transparent grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                            {moduleConfig.fields.filter(f => f.blockId === block.id).map(renderFormItem)}
                        </div>
                    )
                }))} />
            )}

            {/* Table Blocks - اصلاح رنگ */}
            {tableBlocks && tableBlocks.length > 0 && (
                <div className="mt-8 space-y-6">
                    {tableBlocks.map(block => (
                        <div key={block.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-white/5">
                            <h4 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 text-gray-700 dark:text-gray-200">{block.titles.fa}</h4>
                            <SmartTableRenderer 
                                columns={block.tableColumns || []}
                                dataSource={tableData[block.id] || []}
                                onChange={(newData) => setTableData({ ...tableData, [block.id]: newData })}
                            />
                        </div>
                    ))}
                </div>
            )}
        </Form>
        
        {/* Footer Buttons - اصلاح رنگ دکمه‌ها */}
        <div className="border-t border-gray-200 dark:border-gray-800 pt-4 mt-4 flex justify-end gap-3 sticky bottom-0 bg-white dark:bg-[#141414] z-10 p-4">
            <Button onClick={onCancel} className="dark:text-white dark:bg-transparent dark:border-gray-600">انصراف</Button>
            {/* دکمه با رنگ چرمی */}
            <Button type="primary" onClick={() => form.submit()} loading={submitting} className="bg-leather-500 hover:!bg-leather-600 border-none shadow-lg shadow-leather-500/30">
                ثبت نهایی
            </Button>
        </div>
    </div>
  );
};

export default SmartForm;