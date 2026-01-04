import React, { useState, useRef } from 'react';
import { 
  Input, InputNumber, Switch, DatePicker, Select, Upload, Button, Divider, Space, message, Image 
} from 'antd';
import { PlusOutlined, LoadingOutlined, DeleteOutlined } from '@ant-design/icons';
import { FieldType } from '../types';
import { supabase } from '../supabaseClient';
import dayjs from 'dayjs';
import jalaliday from 'jalaliday';

dayjs.extend(jalaliday);

interface SmartFieldRendererProps {
  label: string;
  value: any;
  type: FieldType;
  options?: { label: string; value: any; color?: string }[];
  onSave: (value: any) => void;
  forceEditMode?: boolean;
  fieldKey: string; 
}

const SmartFieldRenderer: React.FC<SmartFieldRendererProps> = ({
  label, value, type, options = [], onSave, forceEditMode = false, fieldKey
}) => {
  const [items, setItems] = useState(options || []);
  const [newItemName, setNewItemName] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<any>(null);

  const isSystemCode = fieldKey === 'system_code';
  
  // --- اصلاح شده: نام باکت به 'images' تغییر کرد ---
  const handleUpload = async (file: File) => {
    try {
        setUploading(true);
        const fileExt = file.name.split('.').pop();
        // اسم فایل رو رندوم میکنیم که تداخل پیش نیاد
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        // 1. آپلود در باکت images
        const { error: uploadError } = await supabase.storage
            .from('images') // <--- اصلاح شد
            .upload(fileName, file);

        if (uploadError) throw uploadError;

        // 2. دریافت لینک عمومی از باکت images
        const { data: urlData } = supabase.storage
            .from('images') // <--- اصلاح شد
            .getPublicUrl(fileName);
        
        onSave(urlData.publicUrl);
        message.success('تصویر بارگذاری شد');
    } catch (error: any) {
        message.error('خطا در آپلود: ' + error.message);
    } finally {
        setUploading(false);
    }
    return false; 
  };

  const addItem = (e: React.MouseEvent) => {
    e.preventDefault();
    if (newItemName) {
      setItems([...items, { label: newItemName, value: newItemName }]);
      setNewItemName('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const renderInput = () => {
    if (isSystemCode) {
        return <Input value={value} disabled placeholder="(تولید خودکار)" className="bg-gray-50 text-gray-500 cursor-not-allowed" />;
    }

    switch (type) {
      case FieldType.TEXT:
        return <Input value={value} onChange={e => onSave(e.target.value)} placeholder={label} />;
      
      case FieldType.NUMBER:
      case FieldType.PRICE:
      case FieldType.STOCK:
        return (
          <InputNumber 
            value={value} 
            onChange={val => onSave(val)} 
            style={{ width: '100%' }} 
            formatter={val => type === FieldType.PRICE ? `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : `${val}`}
            parser={val => val!.replace(/\$\s?|(,*)/g, '')}
            placeholder={label}
          />
        );

      case FieldType.TEXTAREA:
        return <Input.TextArea value={value} onChange={e => onSave(e.target.value)} rows={4} placeholder={label} />;

      case FieldType.BOOLEAN:
        return <Switch checked={value} onChange={val => onSave(val)} />;

      case FieldType.DATE:
         return <Input type="date" value={value} onChange={e => onSave(e.target.value)} />;

      case FieldType.SELECT:
      case FieldType.STATUS:
        return (
          <Select
            style={{ width: '100%' }}
            placeholder={`انتخاب ${label}`}
            value={value}
            onChange={onSave}
            options={items}
            dropdownRender={(menu) => (
              <>
                {menu}
                {type !== FieldType.STATUS && (
                    <>
                        <Divider style={{ margin: '8px 0' }} />
                        <Space style={{ padding: '0 8px 4px' }}>
                        <Input
                            placeholder="مورد جدید..."
                            ref={inputRef}
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            onKeyDown={(e) => e.stopPropagation()}
                        />
                        <Button type="text" icon={<PlusOutlined />} onClick={addItem}>افزودن</Button>
                        </Space>
                    </>
                )}
              </>
            )}
          />
        );
      
      case FieldType.TAGS:
        return <Select mode="tags" style={{ width: '100%' }} placeholder="تایپ و اینتر..." value={value} onChange={onSave} options={options} />;

      case FieldType.IMAGE:
        return (
            <div className="flex items-start gap-4 border border-dashed border-gray-300 rounded-lg p-3">
                <Upload
                    listType="picture-card"
                    maxCount={1}
                    showUploadList={false}
                    beforeUpload={handleUpload}
                >
                    {value ? (
                        <img src={value} alt="uploaded" className="w-full h-full object-cover rounded" />
                    ) : (
                        <div className="flex flex-col items-center justify-center text-gray-400">
                            {uploading ? <LoadingOutlined /> : <PlusOutlined />}
                            <div className="text-xs mt-1">{uploading ? '...' : 'آپلود'}</div>
                        </div>
                    )}
                </Upload>
                {value && (
                    <Button danger icon={<DeleteOutlined />} onClick={() => onSave(null)} size="small">
                        حذف
                    </Button>
                )}
            </div>
        );

      default:
        return <Input value={value} onChange={e => onSave(e.target.value)} />;
    }
  };

  if (!forceEditMode) {
     if (type === FieldType.BOOLEAN) return value ? 'بله' : 'خیر';
     if (type === FieldType.IMAGE && value) return <Image src={value} width={50} className="rounded" />;
     if (type === FieldType.PRICE) return <span className="font-mono">{Number(value).toLocaleString()}</span>;
     return <span className="text-gray-800 dark:text-gray-200">{value || '-'}</span>;
  }

  return renderInput();
};

export default SmartFieldRenderer;