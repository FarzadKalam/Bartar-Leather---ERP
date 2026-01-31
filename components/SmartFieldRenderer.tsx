import React, { useState } from 'react';
<<<<<<< HEAD
import { Form, Input, InputNumber, Select, Switch, Upload, Image, Modal, App, Tag, Button } from 'antd';
import { DatePicker as JalaliDatePicker, TimePicker as JalaliTimePicker } from 'antd-jalali';
import { UploadOutlined, LoadingOutlined, QrcodeOutlined } from '@ant-design/icons';
import { ModuleField, FieldType, FieldNature } from '../types';
import { toPersianNumber, formatPersianTime, safeJalaliFormat } from '../utils/persianNumberFormatter';
=======
import { Form, Input, InputNumber, Select, Switch, Upload, Image, Modal, App } from 'antd';
import { DatePicker as JalaliDatePicker, TimePicker as JalaliTimePicker } from 'antd-jalali';
import { UploadOutlined, LoadingOutlined } from '@ant-design/icons';
import { ModuleField, FieldType } from '../types';
import { toPersianNumber, formatPersianTime, safeJalaliFormat, parseDateValue } from '../utils/persianNumberFormatter';
>>>>>>> 0de9c9462de5035ffc3abdf4bc52404abbceee8f
import { jalaliDatePickerLocale } from '../utils/jalaliLocale';
import { supabase } from '../supabaseClient';
import DynamicSelectField from './DynamicSelectField';
import TagInput from './TagInput';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
<<<<<<< HEAD
import ProductionStagesField from './ProductionStagesField';
=======
>>>>>>> 0de9c9462de5035ffc3abdf4bc52404abbceee8f

interface SmartFieldRendererProps {
  field: ModuleField;
  value: any;
  onChange: (value: any) => void;
  label?: string; 
  type?: string;
  options?: any[];
  relationModule?: string;
  compactMode?: boolean;
  forceEditMode?: boolean;
  onSave?: (val: any) => void;
<<<<<<< HEAD
  onOptionsUpdate?: () => void;
  allValues?: Record<string, any>;
  recordId?: string;
  moduleId?: string;
}

const SmartFieldRenderer: React.FC<SmartFieldRendererProps> = ({ 
  field, value, onChange, label, type, options, forceEditMode, onOptionsUpdate, allValues = {}, recordId, moduleId, compactMode = false
=======
  onOptionsUpdate?: () => void; // برای رفرش options
  allValues?: Record<string, any>; // مقادیر تمام فیلدها برای handle کردن dependsOn
  recordId?: string; // برای TagInput
  moduleId?: string; // برای TagInput
}

const SmartFieldRenderer: React.FC<SmartFieldRendererProps> = ({ 
  field, value, onChange, label, type, options, forceEditMode, onOptionsUpdate, allValues = {}, recordId, moduleId
>>>>>>> 0de9c9462de5035ffc3abdf4bc52404abbceee8f
}) => {
  const { message: msg } = App.useApp();
  const [uploading, setUploading] = useState(false);
  
<<<<<<< HEAD
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateValue, setQuickCreateValue] = useState('');
  const [quickCreateLoading, setQuickCreateLoading] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scannedCode, setScannedCode] = useState('');

=======
>>>>>>> 0de9c9462de5035ffc3abdf4bc52404abbceee8f
  const fieldLabel = field?.labels?.fa || label || 'بدون نام';
  const fieldType = field?.type || type || FieldType.TEXT;
  const fieldKey = field?.key || 'unknown';
  const isRequired = field?.validation?.required || false;
  const isReadonly = field?.readonly || false;
  const fieldOptions = field?.options || options || [];

<<<<<<< HEAD
  // --- 1. تابع کمکی حیاتی برای تبدیل ورودی‌ها به Dayjs (حل مشکل تاریخ) ---
  const ensureDayjs = (val: any): Dayjs | null => {
      if (!val) return null;
      if (dayjs.isDayjs(val)) return val;
=======
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
>>>>>>> 0de9c9462de5035ffc3abdf4bc52404abbceee8f
      
      // تلاش برای پارس کردن فرمت‌های مختلف
      // 1. اگر فرمت ISO یا استاندارد میلادی باشد (مثل timestamptz)
      const standardDate = dayjs(val);
      if (standardDate.isValid() && val.includes && (val.includes('T') || val.includes('+'))) {
          return standardDate;
      }

<<<<<<< HEAD
      // 2. اگر فرمت شمسی باشد (مثل 1404-11-05 یا 1404/11/05)
      // نکته: antd-jalali نیاز دارد بداند که ورودی jalali است
      const jalaliDate = dayjs(val, { jalali: true });
      if (jalaliDate.isValid()) {
          return jalaliDate;
      }

      // 3. تلاش نهایی استاندارد
      return standardDate.isValid() ? standardDate : null;
  };

  // --- Logic for 'dependsOn' ---
  const fieldAny = field as any;
  if (fieldAny?.dependsOn && allValues) {
      const parentValue = allValues[fieldAny.dependsOn.field];
      if (parentValue && fieldAny.dependsOn.map) {
          // const subset = fieldAny.dependsOn.map[parentValue];
      }
  }

  // --- عدم نمایش فیلدهای سیستمی در فرم ویرایش ---
  // اگر فیلد سیستمی است (مثل system_code) و در حالت compact (جدول) نیستیم، مخفی شود
  if (!compactMode && forceEditMode && field?.nature === FieldNature.SYSTEM) {
      // فقط یک Input مخفی برمی‌گردانیم تا در Form.Item مشکلی پیش نیاید ولی دیده نشود
      return <Input type="hidden" value={value} />;
  }

  const renderPersianDateCell = (current: Dayjs) => {
    const formatted = safeJalaliFormat(current, 'D');
    const fallback = current && (current as any).isValid?.() ? current.format('D') : '';
    const display = formatted || fallback;
    return <div className="ant-picker-cell-inner">{display ? toPersianNumber(display) : ''}</div>;
  };

  const handleImageUpload = async (file: File) => {
    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('images').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);

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

  const handleQuickCreate = async () => {
      if (!quickCreateValue.trim()) return;
      if (!field.relationConfig?.targetModule) return;

      setQuickCreateLoading(true);
      try {
          const targetModule = field.relationConfig.targetModule;
          const targetField = (field.relationConfig as any).targetField;
          const payload: any = {};
          payload[targetField] = quickCreateValue; 
          
          const { data, error } = await supabase
              .from(targetModule)
              .insert([payload])
              .select('id, ' + targetField)
              .single();

          if (error) throw error;

          if (data) {
              msg.success('رکورد جدید ایجاد شد');
              setQuickCreateOpen(false);
              setQuickCreateValue('');
              if (onOptionsUpdate) onOptionsUpdate(); 
              onChange((data as any).id);
          }
      } catch (err: any) {
          msg.error('خطا در ایجاد رکورد: ' + err.message);
      } finally {
          setQuickCreateLoading(false);
      }
  };

  const handleScan = () => {
    if (scannedCode) {
      const found = fieldOptions.find((opt: any) => 
        String(opt.value) === scannedCode || 
        (opt.label && opt.label.includes(scannedCode))
      );
      if (found) {
        onChange(found.value);
        setIsScanModalOpen(false);
        setScannedCode('');
      } else {
         if (fieldType === FieldType.TEXT) {
             onChange(scannedCode);
             setIsScanModalOpen(false);
         } else {
             msg.error('موردی یافت نشد');
         }
      }
    }
  };

  // --- رندر محتوا ---
  const renderInputContent = () => {
    // 1. حالت نمایش (View Mode)
    if (!forceEditMode) {
        if (fieldType === FieldType.CHECKBOX) {
            return value ? <Tag color="green">بله</Tag> : <Tag color="red">خیر</Tag>;
        }
        if (fieldType === FieldType.IMAGE && value) {
            return <Image src={value} width={40} className="rounded border" />;
        }
        if (fieldType === FieldType.PRICE) {
            return <span className="font-mono font-bold text-gray-700">{value ? Number(value).toLocaleString() : '0'}</span>;
        }
        if (fieldType === FieldType.DATE) {
            // رفع خطای TS برای safeJalaliFormat
            return <span className="font-mono">{toPersianNumber(safeJalaliFormat(value as any))}</span>;
        }
        if (fieldType === FieldType.SELECT || fieldType === FieldType.RELATION || fieldType === FieldType.STATUS) {
             const selectedOpt = fieldOptions.find((o: any) => o.value === value);
             if (fieldType === FieldType.STATUS && selectedOpt) {
                 return <Tag color={selectedOpt.color}>{selectedOpt.label}</Tag>;
             }
             return <span className="text-gray-800">{selectedOpt ? selectedOpt.label : (value || '-')}</span>;
        }
        if (fieldType === FieldType.TAGS) {
             if (Array.isArray(value) && value.length > 0) {
                 return <div className="flex gap-1">{value.map((t: string, i: number) => <Tag key={i}>{t}</Tag>)}</div>;
             }
             return <span>-</span>;
        }
        
        return <span className="text-gray-800 break-words">{toPersianNumber(value) || (compactMode ? '' : '-')}</span>;
    }

    // 2. تنظیمات مشترک برای حالت ویرایش
    const commonProps = {
        value,
        onChange: (val: any) => onChange(val),
        disabled: !forceEditMode,
        placeholder: compactMode ? undefined : fieldLabel,
        style: { width: '100%' }
    };

    switch (fieldType) {
      case FieldType.TEXT:
        return <Input {...commonProps} onChange={e => onChange(e.target.value)} allowClear />;
      
      case FieldType.LONG_TEXT:
        return <Input.TextArea {...commonProps} onChange={e => onChange(e.target.value)} rows={compactMode ? 1 : 4} />;
      
      case FieldType.PROGRESS_STAGES:
        return (
            <ProductionStagesField 
                recordId={recordId} 
                // اگر در حال ویرایش هستیم یا کامپکت نیستیم، قابلیت ویرایش داشته باشد
                // اما در حالت Create (وقتی recordId نیست)، کامپوننت خودش پیام میدهد
                readOnly={!forceEditMode && !compactMode} 
                compact={compactMode} 
            />
        );

      case FieldType.NUMBER:
      case FieldType.PRICE:
      case FieldType.PERCENTAGE:
      case FieldType.PERCENTAGE_OR_AMOUNT:
      case FieldType.STOCK:
        return (
            <InputNumber 
                {...commonProps}
                className="w-full" 
                controls={false}
                formatter={fieldType === FieldType.PRICE ? val => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : undefined}
                parser={fieldType === FieldType.PRICE ? val => val!.replace(/\$\s?|(,*)/g, '') : undefined}
            />
        );
      case FieldType.PROGRESS_STAGES:
    return (
      <ProductionStagesField 
        recordId={recordId} // شناسه رکورد فعلی (سفارش تولید)
        readOnly={!forceEditMode && !compactMode} // در حالت نمایش فقط خواندنی باشد
        compact={compactMode} // در حالت لیست (جدول) فشرده باشد
      />
    );
      case FieldType.SELECT:
      case FieldType.STATUS:
        if (field.dynamicOptionsCategory) {
            return (
                <DynamicSelectField
                    value={value}
                    onChange={onChange}
                    options={fieldOptions}
                    category={field.dynamicOptionsCategory}
                    placeholder={compactMode ? '' : "انتخاب کنید"}
                    onOptionsUpdate={onOptionsUpdate}
                    disabled={!forceEditMode}
                />
            );
        }
        return (
            <Select 
                {...commonProps}
                showSearch
                options={fieldOptions}
                allowClear
                optionFilterProp="label"
                getPopupContainer={() => document.body}
                dropdownStyle={{ zIndex: 9999 }}
            />
        );

      case FieldType.MULTI_SELECT:
        if (field.dynamicOptionsCategory) {
             return (
                <DynamicSelectField
                    value={value}
                    onChange={onChange}
                    options={fieldOptions}
                    category={field.dynamicOptionsCategory}
                    placeholder={compactMode ? '' : "انتخاب کنید"}
                    mode="multiple"
                    onOptionsUpdate={onOptionsUpdate}
                    disabled={!forceEditMode}
                />
            );
        }
        return (
            <Select 
                {...commonProps}
                mode="multiple"
                showSearch
                options={fieldOptions}
                allowClear
                optionFilterProp="label"
                getPopupContainer={() => document.body}
                dropdownStyle={{ zIndex: 9999 }}
            />
        );

      case FieldType.RELATION:
        const allowQuickCreate = (field.relationConfig as any)?.allowQuickCreate;
        let filteredOptions = fieldOptions;
        
        const relConfigAny = field.relationConfig as any;
        if (relConfigAny?.dependsOn && allValues) {
             const depVal = allValues[relConfigAny.dependsOn];
             if (!depVal) {
                 return <Select disabled placeholder="ابتدا فیلد مرتبط را انتخاب کنید" style={{width:'100%'}} value={value} options={[]} />;
             }
             filteredOptions = fieldOptions.filter((opt: any) => opt.module === depVal);
        }

        return (
           <div className="flex gap-1 w-full">
              <Select 
                  {...commonProps}
                  showSearch
                  options={filteredOptions}
                  optionFilterProp="label"
                  getPopupContainer={() => document.body}
                  dropdownStyle={{ zIndex: 9999 }}
                  filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                  dropdownRender={(menu) => (
                      <>
                        {menu}
                        {!compactMode && allowQuickCreate && (
                            <>
                                <div className="h-[1px] bg-gray-100 my-1"></div>
                                <div 
                                    className="p-2 text-blue-500 cursor-pointer text-xs hover:bg-blue-50 flex items-center gap-1"
                                    onClick={() => setQuickCreateOpen(true)}
                                >
                                    <LoadingOutlined spin={false} /> افزودن مورد جدید...
                                </div>
                            </>
                        )}
                      </>
                  )}
              />
              <Button icon={<QrcodeOutlined />} onClick={() => setIsScanModalOpen(true)} />
           </div>
        );

      case FieldType.DATE:
        return (
          <JalaliDatePicker 
            className="w-full"
            // استفاده از تابع ensureDayjs برای اطمینان از مقداردهی صحیح
            value={ensureDayjs(value)}
            // رفع خطای TS و تبدیل به فرمت رشته‌ای برای ذخیره
            onChange={(_: any, dateString: string | string[]) => {
                const finalStr = Array.isArray(dateString) ? dateString[0] : dateString;
                // اگر دیتابیس text است و مقدار فارسی نگه میدارد، همین عالی است
                // اگر timestamptz است، شاید لازم باشد به ISO تبدیل کنید (اما فعلا طبق دیتابیس شما رفتار میکنیم)
                onChange(finalStr); 
            }}
            placeholder={compactMode ? undefined : "انتخاب تاریخ"}
            allowClear
            locale={jalaliDatePickerLocale}
            popupClassName="persian-number"
            dateRender={renderPersianDateCell}
            getPopupContainer={() => document.body}
            popupStyle={{ zIndex: 9999 }}
            disabled={!forceEditMode}
          />
        );

      case FieldType.TIME:
        return (
          <JalaliTimePicker 
            className="w-full"
            value={value ? dayjs(value, 'HH:mm') : null}
            onChange={(time: any) => {
               const formatted = time ? time.format('HH:mm') : null;
               onChange(formatted);
            }}
            placeholder={compactMode ? undefined : "انتخاب زمان"}
            format={(val: Dayjs | null) => (val ? toPersianNumber(val.format('HH:mm')) : '')}
            showSecond={false}
            use12Hours={false}
            locale={jalaliDatePickerLocale}
            popupClassName="persian-number"
            getPopupContainer={() => document.body}
            popupStyle={{ zIndex: 9999 }}
            disabled={!forceEditMode}
          />
        );

      case FieldType.DATETIME:
        return (
          <JalaliDatePicker 
            className="w-full"
            showTime={{ format: 'HH:mm', showSecond: false }}
            value={ensureDayjs(value)}
            onChange={(_: any, dateString: string | string[]) => {
                const finalStr = Array.isArray(dateString) ? dateString[0] : dateString;
                onChange(finalStr);
            }}
            placeholder={compactMode ? undefined : "انتخاب تاریخ و زمان"}
            locale={jalaliDatePickerLocale}
            popupClassName="persian-number"
            dateRender={renderPersianDateCell}
            getPopupContainer={() => document.body}
            popupStyle={{ zIndex: 9999 }}
            disabled={!forceEditMode}
          />
        );

      case FieldType.TAGS:
        if (recordId && moduleId) {
          return (
            <TagInput
              recordId={recordId}
              moduleId={moduleId}
              initialTags={value || []}
              onChange={onOptionsUpdate as any}
              {...({ disabled: !forceEditMode } as any)}
            />
          );
        }
        return <Input disabled placeholder="بعد از ذخیره، تگ‌ها قابل ویرایش است" />;

      case FieldType.IMAGE:
        return (
            <Upload 
                listType="picture-card" 
                showUploadList={false} 
                beforeUpload={(file) => { handleImageUpload(file); return false; }}
                disabled={uploading || !forceEditMode}
                fileList={[]}
            >
                {uploading ? (
                  <div><LoadingOutlined /><div style={{ marginTop: 8 }}>...</div></div>
                ) : value ? (
                  <img src={value} alt="avatar" style={{ width: '100%', borderRadius: 8 }} />
                ) : (
                  <div><UploadOutlined /><div style={{ marginTop: 8 }}>آپلود</div></div>
                )}
            </Upload>
        );

      case FieldType.CHECKBOX:
        return <Switch checked={!!value} onChange={onChange} disabled={!forceEditMode} />;

      default:
        return <Input {...commonProps} onChange={e => onChange(e.target.value)} />;
    }
  };

  // --- Wrapper نهایی ---
  
  if (compactMode) {
      const allowQuickCreate = (field.relationConfig as any)?.allowQuickCreate;
      return (
        <div className="w-full">
            {renderInputContent()}
            
            {/* مودال‌ها */}
            {fieldType === FieldType.RELATION && allowQuickCreate && (
                <RelationQuickCreateInline 
                    open={quickCreateOpen}
                    label={fieldLabel}
                    value={quickCreateValue}
                    onChange={setQuickCreateValue}
                    onCancel={() => setQuickCreateOpen(false)}
                    onOk={handleQuickCreate}
                />
            )}
             <Modal 
                title="اسکن بارکد" 
                open={isScanModalOpen} 
                onCancel={() => setIsScanModalOpen(false)} 
                footer={null}
                zIndex={10000}
            >
                <Input 
                    autoFocus 
                    placeholder="کد را اسکن کنید..." 
                    value={scannedCode} 
                    onChange={e => setScannedCode(e.target.value)}
                    onPressEnter={handleScan} 
                    suffix={<QrcodeOutlined />}
                />
            </Modal>
        </div>
      );
  }

  // --- تنظیمات Form.Item برای حالت عادی ---
  const formItemProps: any = {
=======
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
>>>>>>> 0de9c9462de5035ffc3abdf4bc52404abbceee8f
      label: fieldLabel,
      name: fieldKey,
      rules: [{ required: isRequired, message: 'الزامی است' }],
      valuePropName: fieldType === FieldType.CHECKBOX ? 'checked' : 'value',
<<<<<<< HEAD
  };

  // تنظیمات تبدیل مقدار برای Form.Item
  if (fieldType === FieldType.DATE || fieldType === FieldType.DATETIME) {
      formItemProps.getValueProps = (val: any) => ({ value: ensureDayjs(val) });
  }
  if (fieldType === FieldType.TIME) {
      formItemProps.getValueProps = (val: any) => ({ value: val ? dayjs(val, 'HH:mm') : null });
  }

  const allowQuickCreate = (field.relationConfig as any)?.allowQuickCreate;

  return (
    <>
        <Form.Item {...formItemProps}>
            {renderInputContent()}
        </Form.Item>

        {fieldType === FieldType.RELATION && allowQuickCreate && (
            <RelationQuickCreateInline 
                open={quickCreateOpen}
                label={fieldLabel}
                value={quickCreateValue}
                onChange={setQuickCreateValue}
                onCancel={() => setQuickCreateOpen(false)}
                onOk={handleQuickCreate}
            />
        )}
        <Modal 
            title="اسکن بارکد" 
            open={isScanModalOpen} 
            onCancel={() => setIsScanModalOpen(false)} 
            footer={null}
            zIndex={10000}
        >
            <Input 
                autoFocus 
                placeholder="کد را اسکن کنید..." 
                value={scannedCode} 
                onChange={e => setScannedCode(e.target.value)}
                onPressEnter={handleScan} 
                suffix={<QrcodeOutlined />}
            />
        </Modal>
    </>
=======
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
>>>>>>> 0de9c9462de5035ffc3abdf4bc52404abbceee8f
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
      zIndex={2000} 
    >
      <Input
        autoFocus
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPressEnter={onOk}
      />
      <div className="text-xs text-gray-400 mt-2">این فقط فیلد اصلی را ثبت می‌کند. بعداً می‌توانید اطلاعات کامل را ویرایش کنید.</div>
    </Modal>
  );
};