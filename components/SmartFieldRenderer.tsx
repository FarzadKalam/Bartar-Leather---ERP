import React from 'react';
import { Form, Input, InputNumber, Select, Checkbox, Switch, Upload, Button, Image, Modal } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { ModuleField, FieldType } from '../types';

interface SmartFieldRendererProps {
  field: ModuleField;
  value: any;
  onChange: (value: any) => void;
  label?: string; 
  type?: string;
  options?: any[];
  relationModule?: string;
  forceEditMode?: boolean;
  onSave?: (val: any) => void; 
}

const SmartFieldRenderer: React.FC<SmartFieldRendererProps> = ({ 
  field, value, onChange, label, type, options, forceEditMode 
}) => {
  const fieldLabel = field?.labels?.fa || label || 'بدون نام';
  const fieldType = field?.type || type || FieldType.TEXT;
  const fieldKey = field?.key || 'unknown';
  const isRequired = field?.validation?.required || false;
  const fieldOptions = field?.options || options || [];

  const renderInput = () => {
    switch (fieldType) {
      case FieldType.TEXT:
        return <Input value={value} onChange={e => onChange(e.target.value)} placeholder={fieldLabel} />;
      
      case FieldType.NUMBER:
      case FieldType.PRICE:
      case FieldType.STOCK:
      case FieldType.PERCENTAGE:
        return (
            <InputNumber 
                className="w-full" 
                value={value} 
                onChange={onChange} 
                formatter={fieldType === FieldType.PRICE ? value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : undefined}
                parser={fieldType === FieldType.PRICE ? value => value!.replace(/\$\s?|(,*)/g, '') : undefined}
            />
        );

      case FieldType.SELECT:
      case FieldType.STATUS:
        return (
            <Select 
                value={value} 
                onChange={onChange} 
                options={fieldOptions} 
                placeholder="انتخاب کنید"
                allowClear
                // 👇 این خط مشکل باز نشدن دراپ‌داون را حل می‌کند 👇
                getPopupContainer={(trigger) => trigger.parentNode}
            />
        );

      case FieldType.IMAGE:
        return (
            <Upload listType="picture-card" showUploadList={false} beforeUpload={() => false}>
                {value ? <img src={value} alt="avatar" style={{ width: '100%' }} /> : <div><UploadOutlined /><div style={{ marginTop: 8 }}>آپلود</div></div>}
            </Upload>
        );

      case FieldType.BOOLEAN:
      case FieldType.CHECKBOX:
        return <Switch checked={!!value} onChange={onChange} />;

      default:
        return <Input value={value} onChange={e => onChange(e.target.value)} />;
    }
  };

  if (!forceEditMode) {
     if (fieldType === FieldType.CHECKBOX || fieldType === FieldType.BOOLEAN) return value ? 'بله' : 'خیر';
     if (fieldType === FieldType.IMAGE && value) return <Image src={value} width={50} className="rounded" />;
     if (fieldType === FieldType.PRICE) return <span className="font-mono">{Number(value).toLocaleString()}</span>;
     return <span className="text-gray-800 dark:text-gray-200">{value || '-'}</span>;
  }

  return (
    <Form.Item 
        label={fieldLabel} 
        name={fieldKey} 
        rules={[{ required: isRequired, message: 'الزامی است' }]}
        valuePropName={fieldType === FieldType.BOOLEAN || fieldType === FieldType.CHECKBOX ? 'checked' : 'value'}
    >
        {renderInput()}
    </Form.Item>
  );
};

export default SmartFieldRenderer;

// --- کامپوننت داخلی ---
interface QuickCreateProps {
    open: boolean;
    label: string;
    value: string;
    onChange: (val: string) => void;
    onCancel: () => void;
    onOk: () => void;
}

export const RelationQuickCreateInline: React.FC<QuickCreateProps> = ({ open, label, value, onChange, onCancel, onOk }) => {
  return (
    <Modal
      title={`افزودن سریع: ${label}`}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      okText="افزودن"
      cancelText="انصراف"
      destroyOnClose
      zIndex={2000} // مدال دوم باید بالاتر باشد
    >
      <Input
        autoFocus
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="text-xs text-gray-400 mt-2">این افزودن سریع فقط یک فیلد اصلی را ثبت می‌کند. بعداً می‌توانید اطلاعات کامل را ویرایش کنید.</div>
    </Modal>
  );
};