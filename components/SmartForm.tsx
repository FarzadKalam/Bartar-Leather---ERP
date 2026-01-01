import React, { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Select, DatePicker, Button, Tabs, message, Spin, Upload } from 'antd';
import { SaveOutlined, CloseOutlined, UploadOutlined, LoadingOutlined } from '@ant-design/icons';
import { ModuleDefinition, FieldType, FieldLocation, BlockType } from '../types';
import { supabase } from '../supabaseClient';
import dayjs from 'dayjs';
import jalaliday from 'jalaliday';

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
  const [loadingRelations, setLoadingRelations] = useState(false);
  
  // استیت‌های آپلود عکس
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchRelations = async () => {
      const relationFields = moduleConfig.fields.filter(f => f.type === FieldType.RELATION);
      if (relationFields.length === 0) return;

      setLoadingRelations(true);
      const newOptions: Record<string, any[]> = {};

      for (const field of relationFields) {
        if (field.relationConfig) {
          const { targetModule, targetField } = field.relationConfig;
          const { data, error } = await supabase
            .from(targetModule)
            .select(`id, ${targetField}`)
            .limit(100);

          if (!error && data) {
            newOptions[field.key] = data.map(item => ({
              label: item[targetField],
              value: item.id
            }));
          }
        }
      }
      setRelationOptions(newOptions);
      setLoadingRelations(false);
    };

    fetchRelations();
    form.resetFields();
    setImageUrl(null); // ریست کردن عکس
  }, [moduleConfig]);

  // --- تابع تولید کد سیستمی ---
  const generateSystemCode = async (modulePrefix: string = 'GEN') => {
    try {
      const { count, error } = await supabase
        .from(moduleConfig.id)
        .select('*', { count: 'exact', head: true }); // head: true یعنی فقط تعداد بده، دیتا نده
      
      if (error) throw error; // اگر خطا داد برو توی catch

      const nextNum = (count || 0) + 1;
      return `${modulePrefix}-${String(nextNum).padStart(5, '0')}`;
    } catch (e) {
      console.warn('System code fallback used:', e);
      // فال‌بک: اگر نتونست تعداد رو بخونه، از زمان استفاده کن که یکتا باشه
      return `${modulePrefix}-${Date.now().toString().slice(-6)}`;
    }
  };

  // --- هندل آپلود عکس ---
  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('images') // نام باکتی که ساختی
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // دریافت لینک عمومی
      const { data } = supabase.storage.from('images').getPublicUrl(filePath);
      
      setImageUrl(data.publicUrl);
      form.setFieldValue('image_url', data.publicUrl); // ست کردن مقدار در فرم
      message.success('تصویر آپلود شد');
    } catch (error: any) {
      message.error('خطا در آپلود: ' + error.message);
    } finally {
      setUploading(false);
    }
    return false; // جلوگیری از آپلود پیش‌فرض antd
  };

  const onFinish = async (values: any) => {
    setSubmitting(true);
    try {
      const cleanValues = { ...values };

      // 1. تبدیل تاریخ‌ها
      Object.keys(cleanValues).forEach(key => {
        const field = moduleConfig.fields.find(f => f.key === key);
        if (field?.type === FieldType.DATE && cleanValues[key]) {
             cleanValues[key] = cleanValues[key].toDate().toISOString();
        }
        if (cleanValues[key] === undefined || cleanValues[key] === '') {
            delete cleanValues[key];
        }
      });

      // 2. تولید کد سیستمی (اگر فیلدش در ماژول باشه)
      if (moduleConfig.fields.find(f => f.key === 'system_code')) {
         // تعیین پیشوند بر اساس ماژول (مثلا products -> PRD)
         const prefixMap: Record<string, string> = { products: 'PRD', suppliers: 'SUP', customers: 'CUS' };
         const prefix = prefixMap[moduleConfig.id] || 'GEN';
         cleanValues.system_code = await generateSystemCode(prefix);
      }

      // 3. اطمینان از ذخیره لینک عکس
      if (imageUrl) {
        cleanValues.image_url = imageUrl;
      }

      const { error } = await supabase
        .from(moduleConfig.id)
        .insert([cleanValues]);

      if (error) throw error;

      message.success('رکورد با موفقیت ثبت شد');
      form.resetFields();
      setImageUrl(null);
      onSuccess();
    } catch (error: any) {
      console.error(error);
      message.error(`خطا: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const renderInput = (field: any) => {
    // اگر فیلد readonly است (مثل کد سیستمی)
    if (field.readonly) {
        return <Input disabled placeholder="(تولید خودکار)" className="bg-gray-100 text-gray-500 cursor-not-allowed" />;
    }

    switch (field.type) {
      case FieldType.TEXT:
      case FieldType.PHONE:
      case FieldType.EMAIL:
        return <Input placeholder={field.labels.fa} />;
      
      case FieldType.NUMBER:
      case FieldType.STOCK:
        return <InputNumber className="w-full" placeholder="0" />;
        
      case FieldType.PRICE:
        return (
            <InputNumber 
                className="w-full" 
                formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={value => value!.replace(/\$\s?|(,*)/g, '')}
                addonAfter="تومان"
            />
        );

      case FieldType.SELECT:
      case FieldType.STATUS:
        return (
            <Select>
                {field.options?.map((opt: any) => (
                    <Select.Option key={opt.value} value={opt.value}>
                        {field.type === FieldType.STATUS ? (
                            <span style={{ color: opt.color }}>{opt.label}</span>
                        ) : opt.label}
                    </Select.Option>
                ))}
            </Select>
        );

      case FieldType.RELATION:
        return (
            <Select 
                loading={!relationOptions[field.key]} 
                placeholder="جستجو..."
                showSearch
                filterOption={(input, option) => (option?.children as unknown as string).includes(input)}
            >
                {relationOptions[field.key]?.map((opt: any) => (
                    <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
                ))}
            </Select>
        );

      case FieldType.IMAGE:
        return (
            <div className="flex items-center gap-4">
                <Upload 
                    beforeUpload={handleImageUpload} 
                    showUploadList={false}
                    accept="image/*"
                >
                    <Button icon={uploading ? <LoadingOutlined /> : <UploadOutlined />}>
                        {uploading ? 'در حال آپلود...' : 'انتخاب تصویر'}
                    </Button>
                </Upload>
                {imageUrl && (
                    <img src={imageUrl} alt="preview" className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
                )}
            </div>
        );

      case FieldType.DATE:
        return <DatePicker className="w-full" />;

      default:
        return <Input />;
    }
  };

  const renderFormItem = (field: any) => (
    <Form.Item
        key={field.key}
        label={field.labels.fa}
        name={field.key}
        rules={[{ required: field.validation?.required, message: 'الزامی' }]}
        className="mb-4"
    >
        {renderInput(field)}
    </Form.Item>
  );

  const headerFields = moduleConfig.fields.filter(f => f.location === FieldLocation.HEADER).sort((a, b) => a.order - b.order);
  const blockFields = moduleConfig.fields.filter(f => f.location === FieldLocation.BLOCK);

  const items = moduleConfig.blocks
    ?.filter(b => b.type === BlockType.FIELD_GROUP)
    .map(block => ({
        key: block.id,
        label: block.titles.fa,
        children: (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                {blockFields
                    .filter(f => f.blockId === block.id)
                    .sort((a, b) => a.order - b.order)
                    .map(renderFormItem)}
            </div>
        )
    }));

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-1">
        {loadingRelations ? <div className="text-center py-10"><Spin /></div> : (
            <Form form={form} layout="vertical" onFinish={onFinish}>
                <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl mb-4 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-bold text-gray-500 mb-4 border-b pb-2">اطلاعات پایه</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {headerFields.map(renderFormItem)}
                    </div>
                </div>
                {items && items.length > 0 && <Tabs defaultActiveKey={items[0].key} items={items} type="card" />}
            </Form>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-800 pt-4 mt-4 flex justify-end gap-3 bg-white dark:bg-[#141414] sticky bottom-0 z-10 p-4 -mx-4 -mb-4">
        <Button onClick={onCancel} icon={<CloseOutlined />} className="dark:text-white dark:bg-transparent dark:border-gray-600">انصراف</Button>
        <Button type="primary" onClick={() => form.submit()} loading={submitting} icon={<SaveOutlined />} className="bg-leather-500 border-none shadow-lg shadow-leather-500/30">
            ثبت نهایی
        </Button>
      </div>
    </div>
  );
};

export default SmartForm;