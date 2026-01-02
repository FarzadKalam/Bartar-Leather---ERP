import React, { useEffect, useState } from 'react';
import { Form, Input, Button, message, InputNumber, Select, Upload, Divider, DatePicker, Row, Col, Switch } from 'antd';
import { SaveOutlined, UploadOutlined, CloseOutlined, CheckOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { FieldType, ModuleDefinition } from '../types';
import dayjs from 'dayjs';
import jalaliday from 'jalaliday';
import locale from 'antd/es/date-picker/locale/fa_IR';

dayjs.extend(jalaliday);

interface SmartFormProps {
  moduleConfig: ModuleDefinition;
  initialValues?: any;
  onSuccess: () => void;
  onCancel: () => void;
  mode: 'create' | 'edit';
  recordId?: string;
}

const SmartForm: React.FC<SmartFormProps> = ({ moduleConfig, initialValues, onSuccess, onCancel, mode, recordId }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && initialValues) {
      // تبدیل تاریخ‌ها به آبجکت moment/dayjs برای نمایش در فرم
      const parsedValues = { ...initialValues };
      moduleConfig.fields.forEach(f => {
          if (f.type === FieldType.DATE && parsedValues[f.key]) {
              parsedValues[f.key] = dayjs(parsedValues[f.key]);
          }
      });
      form.setFieldsValue(parsedValues);
    } else {
      form.resetFields();
      // تولید کد سیستمی در حالت ایجاد
      if (mode === 'create') generateSystemCode();
    }
    fetchOptions();
  }, [initialValues, mode, moduleConfig]);

  // --- اصلاح شده: تولید کد سیستمی بر اساس ماژول ---
  const generateSystemCode = async () => {
    // تعیین پیشوند بر اساس ماژول
    let prefix = 'SYS';
    if (moduleConfig.id === 'products') prefix = 'PRD';
    else if (moduleConfig.id === 'customers') prefix = 'CUS';
    else if (moduleConfig.id === 'suppliers') prefix = 'SUP';
    else if (moduleConfig.id === 'production_boms') prefix = 'BOM';

    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const code = `${prefix}-${randomNum}`;
    form.setFieldValue('system_code', code);
  };

  const fetchOptions = async () => {
    const dynFields = moduleConfig.fields.filter(f => (f as any).dynamicOptionsCategory);
    const opts: Record<string, any[]> = {};
    for (const field of dynFields) {
        const cat = (field as any).dynamicOptionsCategory;
        const { data } = await supabase.from('option_sets').select('label, value').eq('category', cat);
        if (data) opts[cat] = data;
    }
    setDynamicOptions(opts);
  };

  const handleUpload = async (file: File, fieldKey: string) => {
      setUploading(true);
      try {
          const fileName = `${moduleConfig.id}-${Date.now()}.${file.name.split('.').pop()}`;
          const { error } = await supabase.storage.from('images').upload(fileName, file);
          if (error) throw error;
          const { data } = supabase.storage.from('images').getPublicUrl(fileName);
          form.setFieldValue(fieldKey, data.publicUrl);
          message.success('آپلود شد');
      } catch (e) {
          message.error('خطا در آپلود');
      } finally {
          setUploading(false);
      }
      return false;
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      // تبدیل تاریخ‌ها به رشته استاندارد برای ذخیره
      const formattedValues = { ...values };
      moduleConfig.fields.forEach(f => {
          if (f.type === FieldType.DATE && values[f.key]) {
              formattedValues[f.key] = values[f.key].toDate().toISOString(); // فرمت ISO برای دیتابیس
          }
      });

      if (mode === 'create') {
        const { error } = await supabase.from(moduleConfig.id).insert([formattedValues]);
        if (error) throw error;
        message.success('رکورد جدید ایجاد شد');
      } else {
        const { error } = await supabase.from(moduleConfig.id).update(formattedValues).eq('id', recordId);
        if (error) throw error;
        message.success('ویرایش انجام شد');
      }
      onSuccess();
    } catch (error: any) {
      message.error('خطا: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={onFinish} className="pb-20">
      <Row gutter={16}>
        {moduleConfig.fields.sort((a,b) => (a.order||0) - (b.order||0)).map(field => {
           if (field.readonly && mode === 'create' && field.key !== 'system_code') return null; // فیلدهای فقط خواندنی (بجز کد) در ایجاد نمایش داده نشوند

           return (
             <Col span={field.type === FieldType.TEXTAREA || field.type === FieldType.IMAGE ? 24 : 12} key={field.key}>
                <Form.Item 
                    name={field.key} 
                    label={field.labels.fa} 
                    rules={field.validation?.required ? [{ required: true, message: 'الزامی' }] : []}
                >
                    {field.type === FieldType.SELECT || field.type === FieldType.STATUS ? (
                        <Select options={field.options || dynamicOptions[(field as any).dynamicOptionsCategory] || []} allowClear />
                    ) : field.type === FieldType.DATE ? (
                        <DatePicker style={{ width: '100%' }} locale={locale} />
                    ) : field.type === FieldType.NUMBER || field.type === FieldType.PRICE || field.type === FieldType.stock ? (
                        <InputNumber style={{ width: '100%' }} formatter={val => field.type === FieldType.PRICE ? `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : `${val}`} />
                    ) : field.type === FieldType.IMAGE ? (
                        <Upload showUploadList={false} beforeUpload={(f) => handleUpload(f, field.key)}>
                            <Button icon={<UploadOutlined />} loading={uploading}>آپلود تصویر</Button>
                        </Upload>
                    ) : field.type === FieldType.TEXTAREA ? (
                        <Input.TextArea rows={3} />
                    ) : (
                        <Input disabled={field.readonly} />
                    )}
                </Form.Item>
             </Col>
           );
        })}
      </Row>
      
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2 z-10">
        <Button onClick={onCancel} icon={<CloseOutlined />}>انصراف</Button>
        <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />} className="bg-leather-600">ذخیره</Button>
      </div>
    </Form>
  );
};

export default SmartForm;