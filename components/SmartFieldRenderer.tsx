import React, { useState } from 'react';
import { Form, Input, InputNumber, Select, Switch, Upload, Image, Modal, App } from 'antd';
import { DatePicker as JalaliDatePicker, TimePicker as JalaliTimePicker } from 'antd-jalali';
import { UploadOutlined, LoadingOutlined } from '@ant-design/icons';
import { ModuleField, FieldType } from '../types';
import { toPersianNumber, formatPersianTime, safeJalaliFormat, parseDateValue } from '../utils/persianNumberFormatter';
import { jalaliDatePickerLocale } from '../utils/jalaliLocale';
import { supabase } from '../supabaseClient';
import DynamicSelectField from './DynamicSelectField';
import TagInput from './TagInput';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

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
  onOptionsUpdate?: () => void; // برای رفرش options
  allValues?: Record<string, any>; // مقادیر تمام فیلدها برای handle کردن dependsOn
  recordId?: string; // برای TagInput
  moduleId?: string; // برای TagInput
}

const SmartFieldRenderer: React.FC<SmartFieldRendererProps> = ({ 
  field, value, onChange, label, type, options, forceEditMode, onOptionsUpdate, allValues = {}, recordId, moduleId
}) => {
  const { message: msg } = App.useApp();
  const [uploading, setUploading] = useState(false);
  
  const fieldLabel = field?.labels?.fa || label || 'بدون نام';
  const fieldType = field?.type || type || FieldType.TEXT;
  const fieldKey = field?.key || 'unknown';
  const isRequired = field?.validation?.required || false;
  const isReadonly = field?.readonly || false;
  const fieldOptions = field?.options || options || [];

  const renderPersianDateCell = (current: Dayjs) => {
    const formatted = safeJalaliFormat(current, 'D');
    const fallback = current && (current as any).isValid?.() ? current.format('D') : '';
    const display = formatted || fallback;
    return <div className="ant-picker-cell-inner">{display ? toPersianNumber(display) : ''}</div>;
  };

  // تابع آپلود تصویر به Supabase Storage
  const handleImageUpload = async (file: File) => {
    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      msg.success('تصویر با موفقیت آپلود شد');
      onChange(publicUrl);
      return publicUrl;
    } catch (error: any) {
      console.error('خطا در آپلود تصویر:', error);
      msg.error(`خطا در آپلود: ${error.message}`);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const renderInput = () => {
    // اگر فیلد readonly است، فقط نمایش بده
    if (isReadonly && !forceEditMode) {
      return <Input value={value} disabled className="bg-gray-100" />;
    }
    
    if (isReadonly && forceEditMode) {
      return <Input value={value} disabled className="bg-gray-50 cursor-not-allowed" placeholder="تولید خودکار" />;
    }

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
      case FieldType.RELATION:
        // برای RELATION با dependsOn - filter کردن options بر اساس ماژول انتخاب‌شده
        if (fieldType === FieldType.RELATION && field?.relationConfig?.dependsOn && allValues && fieldOptions.length > 0) {
          const dependsOnField = field.relationConfig.dependsOn;
          const dependsOnValue = allValues[dependsOnField];
          
          // اگر فیلد وابسته مقدار ندارد
          if (!dependsOnValue) {
            return (
              <Select
                disabled
                placeholder="ابتدا فیلد مرتبط را انتخاب کنید"
                value={value}
                onChange={onChange}
                options={[]}
              />
            );
          }

          // filter کردن options بر اساس ماژول انتخاب‌شده
          const filteredOptions = fieldOptions.filter((opt: any) => opt.module === dependsOnValue);
          
          return (
            <Select
              showSearch
              value={value}
              onChange={onChange}
              options={filteredOptions}
              placeholder="انتخاب کنید"
              allowClear
              optionFilterProp="label"
              getPopupContainer={(trigger) => trigger.parentNode as HTMLElement}
            />
          );
        }
        
        // اگر فیلد dynamicOptionsCategory دارد، از DynamicSelectField استفاده کن
        if (field?.dynamicOptionsCategory) {
          return (
            <DynamicSelectField
              value={value}
              onChange={onChange}
              options={fieldOptions}
              category={field.dynamicOptionsCategory}
              placeholder="انتخاب کنید"
              onOptionsUpdate={onOptionsUpdate}
            />
          );
        }
        
        // برای فیلدهای معمولی SELECT بدون قابلیت افزودن
        return (
          <Select
            showSearch
            value={value}
            onChange={onChange}
            options={fieldOptions}
            placeholder="انتخاب کنید"
            allowClear
            optionFilterProp="label"
            getPopupContainer={(trigger) => trigger.parentNode as HTMLElement}
          />
        );

      case FieldType.MULTI_SELECT:
        // اگر فیلد dynamicOptionsCategory دارد، از DynamicSelectField استفاده کن
        if (field?.dynamicOptionsCategory) {
          return (
            <DynamicSelectField
              value={value}
              onChange={onChange}
              options={fieldOptions}
              category={field.dynamicOptionsCategory}
              placeholder="انتخاب کنید"
              onOptionsUpdate={onOptionsUpdate}
              mode="multiple"
            />
          );
        }
        
        // برای فیلدهای معمولی MULTI_SELECT
        return (
          <Select
            mode="multiple"
            showSearch
            value={Array.isArray(value) ? value : (value ? [value] : [])}
            onChange={onChange}
            options={fieldOptions}
            placeholder="انتخاب کنید"
            allowClear
            optionFilterProp="label"
            getPopupContainer={(trigger) => trigger.parentNode as HTMLElement}
          />
        );

      case FieldType.IMAGE:
        return (
            <Upload 
                listType="picture-card" 
                showUploadList={false} 
                beforeUpload={(file) => {
                  handleImageUpload(file);
                  return false;
                }}
                disabled={uploading}
                fileList={[]}
            >
                {uploading ? (
                  <div>
                    <LoadingOutlined />
                    <div style={{ marginTop: 8 }}>در حال آپلود...</div>
                  </div>
                ) : value ? (
                  <img src={value} alt="avatar" style={{ width: '100%' }} />
                ) : (
                  <div>
                    <UploadOutlined />
                    <div style={{ marginTop: 8 }}>آپلود</div>
                  </div>
                )}
            </Upload>
        );

      case FieldType.CHECKBOX:
        return <Switch checked={!!value} onChange={onChange} />;

      case FieldType.DATE:
        return (
          <JalaliDatePicker 
            className="w-full"
            value={parseDateValue(value)}
            onChange={(date: Dayjs | null) => onChange(date ? date.format('YYYY-MM-DD') : null)}
            placeholder="انتخاب تاریخ"
            picker="date"
            format={(val: Dayjs | null) => {
              const formatted = safeJalaliFormat(val, 'YYYY/MM/DD');
              return formatted ? toPersianNumber(formatted) : '';
            }}
            locale={jalaliDatePickerLocale}
            popupClassName="persian-number"
            dateRender={renderPersianDateCell}
            getPopupContainer={(trigger: HTMLElement) => trigger.parentElement || document.body}
            popupStyle={{ zIndex: 1600 }}
          />
        );

      case FieldType.TIME:
        return (
          <JalaliTimePicker 
            className="w-full"
            value={value ? dayjs(value, ['HH:mm', 'HH:mm:ss']) : null}
            onChange={(time: Dayjs | Dayjs[] | null) => {
              const picked = Array.isArray(time) ? time[0] : time;
              onChange(picked ? picked.format('HH:mm') : null);
            }}
            placeholder="انتخاب زمان"
            format={(val: Dayjs | null) => (val ? toPersianNumber(val.format('HH:mm')) : '')}
            showSecond={false}
            use12Hours={false}
            locale={jalaliDatePickerLocale}
            popupClassName="persian-number"
            getPopupContainer={(trigger: HTMLElement) => trigger.parentElement || document.body}
            popupStyle={{ zIndex: 1600 }}
          />
        );

      case FieldType.DATETIME:
        return (
          <JalaliDatePicker 
            className="w-full"
            showTime={{ format: 'HH:mm', showSecond: false }}
            value={parseDateValue(value)}
            onChange={(datetime: Dayjs | null) => onChange(datetime ? datetime.format('YYYY-MM-DD HH:mm') : null)}
            placeholder="انتخاب تاریخ و زمان"
            format={(val: Dayjs | null) => {
              const formatted = safeJalaliFormat(val, 'YYYY/MM/DD HH:mm');
              return formatted ? toPersianNumber(formatted) : '';
            }}
            locale={jalaliDatePickerLocale}
            popupClassName="persian-number"
            dateRender={renderPersianDateCell}
            getPopupContainer={(trigger: HTMLElement) => trigger.parentElement || document.body}
            popupStyle={{ zIndex: 1600 }}
          />
        );

      case FieldType.TAGS:
        // برای TAGS از TagInput استفاده می‌کنیم
        if (recordId && moduleId) {
          return (
            <TagInput
              recordId={recordId}
              moduleId={moduleId}
              initialTags={value || []}
              onChange={onOptionsUpdate}
            />
          );
        }
        // اگر recordId نداریم (در حالت ایجاد جدید)، یک پیام نمایش بده
        return <Input disabled placeholder="بعد از ذخیره، تگ‌ها قابل ویرایش است" />;

      default:
        return <Input value={value} onChange={e => onChange(e.target.value)} />;
    }
  };

  if (!forceEditMode) {
     if (fieldType === FieldType.CHECKBOX) return value ? 'بله' : 'خیر';
     if (fieldType === FieldType.IMAGE && value) return <Image src={value} width={50} className="rounded" />;
     if (fieldType === FieldType.PRICE) return <span className="font-mono">{Number(value).toLocaleString()}</span>;
     if (fieldType === FieldType.DATE && value) {
       const formatted = safeJalaliFormat(value, 'YYYY/MM/DD');
       if (!formatted) return <span className="text-gray-600 font-mono">-</span>;
       return <span className="text-gray-600 font-mono">{toPersianNumber(formatted)}</span>;
     }
    if (fieldType === FieldType.TIME && value) return <span className="text-gray-600 font-mono">{formatPersianTime(value)}</span>;
     if (fieldType === FieldType.DATETIME && value) {
       const formatted = safeJalaliFormat(value, 'YYYY/MM/DD HH:mm');
       if (!formatted) return <span className="text-gray-600 font-mono">-</span>;
       return <span className="text-gray-600 font-mono">{toPersianNumber(formatted)}</span>;
     }
     if (fieldType === FieldType.TAGS && recordId && moduleId) {
       return (
         <TagInput
           recordId={recordId}
           moduleId={moduleId}
           initialTags={value || []}
           onChange={onOptionsUpdate}
         />
       );
     }
     return <span className="text-gray-800 dark:text-gray-200">{value || '-'}</span>;
  }

  const getFormItemProps = () => {
    const baseProps = {
      label: fieldLabel,
      name: fieldKey,
      rules: [{ required: isRequired, message: 'الزامی است' }],
      valuePropName: fieldType === FieldType.CHECKBOX ? 'checked' : 'value',
    };

    // Special handling for date/time fields
    if (fieldType === FieldType.DATE) {
      return {
        ...baseProps,
        valuePropName: 'value',
        getValueFromEvent: (date: any) => date ? date.format('YYYY-MM-DD') : null,
        getValueProps: (value: any) => ({
          value: parseDateValue(value),
        }),
      };
    }

    if (fieldType === FieldType.TIME) {
      return {
        ...baseProps,
        valuePropName: 'value',
        getValueFromEvent: (time: any) => time ? time.format('HH:mm') : null,
        getValueProps: (value: any) => ({
          value: value ? dayjs(value, ['HH:mm', 'HH:mm:ss']) : null,
        }),
      };
    }

    if (fieldType === FieldType.DATETIME) {
      return {
        ...baseProps,
        valuePropName: 'value',
        getValueFromEvent: (datetime: any) => datetime ? datetime.format('YYYY-MM-DD HH:mm') : null,
        getValueProps: (value: any) => ({
          value: parseDateValue(value),
        }),
      };
    }

    return baseProps;
  };

  return (
    <Form.Item {...getFormItemProps()}>
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