import React, { useState } from 'react';
import { Form, Input, InputNumber, Select, Switch, Upload, Image, Modal, App, Tag, Button } from 'antd';
import { DatePicker as JalaliDatePicker, TimePicker as JalaliTimePicker } from 'antd-jalali';
import { UploadOutlined, LoadingOutlined, QrcodeOutlined } from '@ant-design/icons';
import { ModuleField, FieldType, FieldNature } from '../types';
import { toPersianNumber, formatPersianTime, safeJalaliFormat, parseDateValue, toGregorianDateString } from '../utils/persianNumberFormatter';
import { jalaliDatePickerLocale } from '../utils/jalaliLocale';
import { supabase } from '../supabaseClient';
import DynamicSelectField from './DynamicSelectField';
import TagInput from './TagInput';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import ProductionStagesField from './ProductionStagesField';

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
  onOptionsUpdate?: () => void;
  allValues?: Record<string, any>;
  recordId?: string;
  moduleId?: string;
}

const SmartFieldRenderer: React.FC<SmartFieldRendererProps> = ({ 
  field, value, onChange, label, type, options, forceEditMode, onOptionsUpdate, allValues = {}, recordId, moduleId, compactMode = false
}) => {
  const { message: msg } = App.useApp();
  const [uploading, setUploading] = useState(false);
  
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateValue, setQuickCreateValue] = useState('');
  const [quickCreateLoading, setQuickCreateLoading] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scannedCode, setScannedCode] = useState('');

  const fieldLabel = field?.labels?.fa || label || 'بدون نام';
  const fieldType = field?.type || type || FieldType.TEXT;
  const fieldKey = field?.key || 'unknown';
  const isRequired = field?.validation?.required || false;
  const isReadonly = field?.readonly || false;
  const fieldOptions = field?.options || options || [];

  // --- 1. تابع کمکی حیاتی برای تبدیل ورودی‌ها به Dayjs (حل مشکل تاریخ) ---
  const ensureDayjs = (val: any): Dayjs | null => {
      return parseDateValue(val);
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
            // تبدیل به Dayjs ابتدا برای نمایش صحیح
            const dayjsValue = parseDateValue(value);
            if (!dayjsValue) return <span className="font-mono">-</span>;
            const formatted = safeJalaliFormat(dayjsValue, 'YYYY/MM/DD');
            return <span className="font-mono">{toPersianNumber(formatted || '-')}</span>;
        }
        if (fieldType === FieldType.DATETIME) {
            // تبدیل به Dayjs ابتدا برای نمایش صحیح
            const dayjsValue = parseDateValue(value);
            if (!dayjsValue) return <span className="font-mono">-</span>;
            const formatted = safeJalaliFormat(dayjsValue, 'YYYY/MM/DD HH:mm');
            return <span className="font-mono">{toPersianNumber(formatted || '-')}</span>;
        }
        if (fieldType === FieldType.TIME) {
            return <span className="font-mono">{formatPersianTime(value)}</span>;
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
                    getPopupContainer={() => document.body}
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
                    getPopupContainer={() => document.body}
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
            onChange={(date: Dayjs | null) => {
                const finalStr = toGregorianDateString(date, 'YYYY-MM-DD');
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
            onChange={(datetime: Dayjs | null) => {
                const finalStr = toGregorianDateString(datetime, 'YYYY-MM-DD HH:mm');
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
      label: fieldLabel,
      name: fieldKey,
      rules: [{ required: isRequired, message: 'الزامی است' }],
      valuePropName: fieldType === FieldType.CHECKBOX ? 'checked' : 'value',
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
